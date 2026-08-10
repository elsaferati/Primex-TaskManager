import unittest
import importlib.util
import io
import uuid
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.api.routers.tasks import _validate_rlz_completion_comment
from app.models.enums import RealizationPulse, UserRole
from app.models.realization import RealizationDailyCloseEvent
from app.services.realization_policy import evaluate_policy
from app.services.realization_pulse import aggregate_monthly_pulses, calculate_pulse


class TestOperationalPulse(unittest.TestCase):
    def pulse(self, **facts):
        return calculate_pulse(facts).pulse

    def test_plan_met_is_plus(self):
        self.assertEqual(self.pulse(planned_count=3, completed_count=3), RealizationPulse.ON_PLAN)

    def test_plan_exceeded_is_plus_plus(self):
        self.assertEqual(self.pulse(planned_count=3, completed_count=4), RealizationPulse.ABOVE_PLAN)

    def test_verified_real_extra_with_accounted_plan_is_diamond(self):
        self.assertEqual(
            self.pulse(planned_count=3, completed_count=3, verified_diamond_count=1),
            RealizationPulse.DIAMOND,
        )
        self.assertEqual(
            self.pulse(planned_count=3, completed_count=2, verified_diamond_count=1),
            RealizationPulse.ACTION_REQUIRED,
        )

    def test_unverified_extra_is_not_diamond(self):
        self.assertEqual(
            self.pulse(planned_count=2, completed_count=2, unverified_extra_count=5),
            RealizationPulse.ON_PLAN,
        )

    def test_below_plan_without_reason_is_question(self):
        self.assertEqual(self.pulse(planned_count=2, completed_count=1), RealizationPulse.ACTION_REQUIRED)

    def test_pink_untouched_is_question(self):
        self.assertEqual(
            self.pulse(planned_count=1, completed_count=1, unresolved_pink_count=1),
            RealizationPulse.ACTION_REQUIRED,
        )

    def test_approved_postponement_is_ok_without_faking_completion(self):
        decision = calculate_pulse(
            {"planned_count": 2, "completed_count": 1, "approved_postponement_count": 1}
        )
        self.assertEqual(decision.pulse, RealizationPulse.JUSTIFIED)
        self.assertEqual(decision.completed_count, 1)

    def test_approved_absence_is_ok_when_shortfall_accounted(self):
        self.assertEqual(
            self.pulse(planned_count=2, completed_count=1, approved_absence_days=1),
            RealizationPulse.JUSTIFIED,
        )

    def test_employee_explanation_without_approval_remains_question(self):
        self.assertEqual(
            self.pulse(planned_count=2, completed_count=1, employee_explanation_count=1),
            RealizationPulse.ACTION_REQUIRED,
        )

    def test_zero_plan_is_ok_not_fake_one_hundred(self):
        decision = calculate_pulse({"planned_count": 0, "completed_count": 0})
        self.assertEqual(decision.pulse, RealizationPulse.JUSTIFIED)
        self.assertEqual(decision.expected_count, 0)

    def test_live_weekly_history_can_recover(self):
        history = [
            self.pulse(planned_count=2, completed_count=0),
            self.pulse(planned_count=3, completed_count=2, approved_postponement_count=1),
            self.pulse(planned_count=4, completed_count=4),
            self.pulse(planned_count=4, completed_count=5),
            self.pulse(planned_count=5, completed_count=5),
        ]
        self.assertEqual(
            history,
            [RealizationPulse.ACTION_REQUIRED, RealizationPulse.JUSTIFIED, RealizationPulse.ON_PLAN, RealizationPulse.ABOVE_PLAN, RealizationPulse.ON_PLAN],
        )


class TestCompletionComments(unittest.TestCase):
    def test_user_driven_done_requires_own_comment(self):
        with self.assertRaisesRegex(ValueError, "RLZ_TASK_COMMENT_REQUIRED"):
            _validate_rlz_completion_comment(
                user_role=UserRole.STAFF,
                actor_is_assignee=True,
                personal_comment=" ",
                override_reason=None,
            )

    def test_another_assignees_comment_does_not_satisfy_user(self):
        with self.assertRaisesRegex(ValueError, "RLZ_TASK_COMMENT_REQUIRED"):
            _validate_rlz_completion_comment(
                user_role=UserRole.STAFF,
                actor_is_assignee=True,
                personal_comment=None,
                override_reason=None,
            )

    def test_manager_override_requires_reason(self):
        with self.assertRaisesRegex(ValueError, "RLZ_COMPLETION_OVERRIDE_REASON_REQUIRED"):
            _validate_rlz_completion_comment(
                user_role=UserRole.MANAGER,
                actor_is_assignee=False,
                personal_comment=None,
                override_reason=None,
            )
        self.assertTrue(
            _validate_rlz_completion_comment(
                user_role=UserRole.MANAGER,
                actor_is_assignee=False,
                personal_comment=None,
                override_reason="Exceptional recovery",
            )
        )


class TestMonthlyAndFinalCompatibility(unittest.TestCase):
    def test_monthly_aggregation_uses_weekly_rows(self):
        result = aggregate_monthly_pulses(
            [
                {"period_id": "w1", "pulse": "+", "unresolved_pink_days": 0},
                {"period_id": "w2", "pulse": "?", "unresolved_pink_days": 2},
                {"period_id": "w3", "pulse": "OK", "unresolved_pink_days": 0},
            ]
        )
        self.assertEqual((result["plus_count"], result["question_count"], result["ok_count"]), (1, 1, 1))
        self.assertEqual(result["unresolved_pink_days"], 2)
        self.assertEqual(result["current_pulse"], "?")

    def test_monthly_no_data_has_no_artificial_ok(self):
        self.assertIsNone(aggregate_monthly_pulses([])["current_pulse"])

    def test_final_letter_policy_is_unchanged(self):
        decision = evaluate_policy(
            {"planned_count": 2, "completed_on_time_count": 2},
            {"algorithm": "first_matching_rule"},
            {},
        )
        self.assertEqual(decision.level.value, "B")


class TestDailyCloseHistory(unittest.TestCase):
    def test_reopen_and_correction_are_new_events(self):
        close_id, reopen_id = uuid.uuid4(), uuid.uuid4()
        common = dict(
            period_id=uuid.uuid4(), result_id=uuid.uuid4(), user_id=uuid.uuid4(),
            department_id=uuid.uuid4(), mode="AUTO", suggested_pulse="+",
            confirmed_pulse="+", actor_user_id=uuid.uuid4(), facts_json={},
        )
        closed = RealizationDailyCloseEvent(id=close_id, action="CLOSE", **common)
        reopened = RealizationDailyCloseEvent(
            id=reopen_id, action="REOPEN", reason="Correction required",
            supersedes_event_id=closed.id, **common,
        )
        corrected = RealizationDailyCloseEvent(
            id=uuid.uuid4(), action="CORRECT", reason="Facts refreshed",
            supersedes_event_id=reopened.id, **common,
        )
        self.assertEqual(reopened.supersedes_event_id, close_id)
        self.assertEqual(corrected.supersedes_event_id, reopen_id)
        self.assertNotEqual(corrected.id, closed.id)

    def test_pulse_migration_compiles(self):
        path = Path(__file__).parents[1] / "alembic" / "versions" / "20260810_add_realization_pulse.py"
        spec = importlib.util.spec_from_file_location("pulse_migration", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        output = io.StringIO()
        context = MigrationContext.configure(
            dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
        )
        with Operations.context(context):
            module.upgrade()
            module.downgrade()
        sql = output.getvalue()
        self.assertIn("realization_daily_close_events", sql)
        self.assertIn("realization_mode", sql)


if __name__ == "__main__":
    unittest.main()
