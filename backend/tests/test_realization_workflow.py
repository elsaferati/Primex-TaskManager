import importlib.util
import io
import unittest
import uuid
from datetime import date, datetime, time, timezone
from pathlib import Path
from types import SimpleNamespace

from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models.enums import RealizationLevel, RealizationPeriodStatus
from app.services.realization_calculator import build_questions
from app.services.realization_daily import _include_nonplanned_weekly_task
from app.services.realization_evidence import (
    _classify_planned_task,
    _planned_deadline,
    _postponement,
    _snapshot_tasks,
    _snapshot_users,
)
from app.services.realization_narrative import build_albanian_narrative
from app.services.realization_periods import (
    RealizationWorkflowError,
    normalize_week_start,
    transition_period,
    weekly_end,
)
from app.services.realization_people import (
    build_common_leave_coverage,
    full_period_leave_user_ids,
)
from app.services.realization_policy import evaluate_policy


BONUSES = {"A+": 50, "A": 40, "B": 30, "C": 20, "M": 15, "D": 10, "E": 0}
CRITERIA = {
    "algorithm": "first_matching_rule",
    "frequent_tardiness_threshold": 3,
    "a_plus_verified_extra_min": 2,
    "a_verified_extra_min": 1,
    "unexpected_absence_e_threshold": 2,
    "repeated_problem_d_threshold": 2,
}


class TestPolicy(unittest.TestCase):
    def test_complete_on_time_uses_b(self) -> None:
        result = evaluate_policy(
            {"planned_count": 3, "completed_on_time_count": 3},
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.B)

    def test_annual_leave_is_not_personal_absence_m(self) -> None:
        result = evaluate_policy(
            {
                "planned_count": 0,
                "annual_leave_days": 5,
                "approved_absence_days": 5,
            },
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.B)

    def test_approved_personal_absence_uses_m(self) -> None:
        result = evaluate_policy(
            {
                "planned_count": 1,
                "accounted_planned_count": 1,
                "approved_personal_absence_days": 1,
            },
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.M)

    def test_confirmed_missed_meeting_uses_d(self) -> None:
        result = evaluate_policy(
            {
                "planned_count": 1,
                "completed_on_time_count": 1,
                "meeting_missed_count": 1,
            },
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.D)

    def test_verified_extras_use_first_matching_a_plus_rule(self) -> None:
        result = evaluate_policy(
            {
                "planned_count": 3,
                "completed_on_time_count": 3,
                "verified_extra_count": 2,
            },
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.A_PLUS)

    def test_unapproved_postponement_caps_result_at_d(self) -> None:
        result = evaluate_policy(
            {
                "planned_count": 1,
                "completed_on_time_count": 1,
                "unapproved_postponement_count": 1,
            },
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.D)

    def test_accounted_counter_does_not_double_count_completed_postponement(self) -> None:
        result = evaluate_policy(
            {
                "planned_count": 1,
                "completed_on_time_count": 1,
                "approved_postponement_count": 1,
                "accounted_planned_count": 1,
            },
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.B)

    def test_verified_minor_impact_caps_result_at_c(self) -> None:
        result = evaluate_policy(
            {
                "planned_count": 1,
                "completed_on_time_count": 1,
                "accounted_planned_count": 1,
                "negative_count": 1,
                "minor_negative_impact_count": 1,
            },
            CRITERIA,
            BONUSES,
        )
        self.assertEqual(result.level, RealizationLevel.C)


class TestWorkflow(unittest.TestCase):
    def test_old_task_completed_this_week_is_included_in_live_report(self) -> None:
        self.assertTrue(
            _include_nonplanned_weekly_task(
                created_at=datetime(2026, 7, 24, 9, tzinfo=timezone.utc),
                planned_snapshot_at=datetime(2026, 8, 3, 8, tzinfo=timezone.utc),
                completed_day=date(2026, 8, 5),
                week_start=date(2026, 8, 3),
                as_of_day=date(2026, 8, 6),
            )
        )

    def test_old_incomplete_task_stays_outside_live_report(self) -> None:
        self.assertFalse(
            _include_nonplanned_weekly_task(
                created_at=datetime(2026, 7, 24, 9, tzinfo=timezone.utc),
                planned_snapshot_at=datetime(2026, 8, 3, 8, tzinfo=timezone.utc),
                completed_day=None,
                week_start=date(2026, 8, 3),
                as_of_day=date(2026, 8, 6),
            )
        )

    def test_week_is_monday_to_friday(self) -> None:
        self.assertEqual(normalize_week_start(date(2026, 7, 30)), date(2026, 7, 27))
        self.assertEqual(weekly_end(date(2026, 7, 30)), date(2026, 7, 31))

    def test_status_flow_and_lock(self) -> None:
        actor = uuid.uuid4()
        period = SimpleNamespace(
            status="OPEN",
            calculated_at=None,
            approved_at=None,
            approved_by=None,
            locked_at=None,
        )
        transition_period(period, RealizationPeriodStatus.CALCULATED, actor_id=actor)
        transition_period(period, RealizationPeriodStatus.REVIEWED, actor_id=actor)
        transition_period(period, RealizationPeriodStatus.APPROVED, actor_id=actor)
        transition_period(period, RealizationPeriodStatus.LOCKED, actor_id=actor)
        self.assertEqual(period.status, "LOCKED")
        with self.assertRaises(RealizationWorkflowError):
            transition_period(period, RealizationPeriodStatus.CALCULATED, actor_id=actor)

    def test_invalid_transition_is_rejected(self) -> None:
        period = SimpleNamespace(status="OPEN", locked_at=None)
        with self.assertRaises(RealizationWorkflowError):
            transition_period(period, RealizationPeriodStatus.APPROVED, actor_id=uuid.uuid4())


class TestRealizationPeopleEligibility(unittest.TestCase):
    def test_full_week_common_view_leave_excludes_only_covered_user(self) -> None:
        covered_user = uuid.uuid4()
        working_user = uuid.uuid4()
        entry = SimpleNamespace(
            id=uuid.uuid4(),
            assigned_to_user_id=covered_user,
            created_by_user_id=covered_user,
            entry_date=date(2026, 8, 3),
            created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
            description="Date range: 2026-08-03 to 2026-08-07 (Full day)",
        )
        partial_entry = SimpleNamespace(
            id=uuid.uuid4(),
            assigned_to_user_id=working_user,
            created_by_user_id=working_user,
            entry_date=date(2026, 8, 4),
            created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
            description="Date: 2026-08-04 (09:00 - 12:00)",
        )
        coverage = build_common_leave_coverage(
            [entry, partial_entry],
            user_ids={covered_user, working_user},
            start_date=date(2026, 8, 3),
            end_date=date(2026, 8, 7),
        )
        working_days = {date(2026, 8, day) for day in range(3, 8)}
        self.assertEqual(
            full_period_leave_user_ids(coverage, working_days=working_days),
            {covered_user},
        )
        self.assertNotIn(working_user, coverage)

    def test_common_view_all_users_leave_applies_to_each_active_user(self) -> None:
        first = uuid.uuid4()
        second = uuid.uuid4()
        entry = SimpleNamespace(
            id=uuid.uuid4(),
            assigned_to_user_id=None,
            created_by_user_id=first,
            entry_date=date(2026, 8, 4),
            created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
            description="[ALL_USERS] Date: 2026-08-04 (Full day)",
        )
        coverage = build_common_leave_coverage(
            [entry],
            user_ids={first, second},
            start_date=date(2026, 8, 4),
            end_date=date(2026, 8, 4),
        )
        self.assertEqual(set(coverage), {first, second})


class TestQuestionsAndNarrative(unittest.TestCase):
    def test_meeting_and_absence_questions_do_not_invent_evidence(self) -> None:
        person = {
            "counters": {"planned_count": 1, "completed_on_time_count": 1, "absence_needs_review_count": 1},
            "tasks": [],
            "observations": [],
        }
        decision = evaluate_policy(person["counters"], CRITERIA, BONUSES)
        narrative = build_albanian_narrative(person)
        questions = {row["key"]: row for row in build_questions(person, decision, narrative)}
        self.assertEqual(questions["respected_meetings"]["source_status"], "AUTO_NEEDS_CONFIRMATION")
        self.assertEqual(questions["unexpected_absences"]["source_status"], "AUTO_NEEDS_CONFIRMATION")
        self.assertEqual(questions["current_level"]["auto_value"], "—")
        self.assertNotIn("weekly_bonus", questions)

    def test_narrative_is_deterministic(self) -> None:
        facts = {"planned_count": 2, "completed_on_time_count": 2, "verified_extra_count": 1}
        self.assertEqual(
            build_albanian_narrative(facts),
            build_albanian_narrative(facts),
        )


class TestEvidenceNormalization(unittest.TestCase):
    def test_snapshot_keeps_existing_match_key_and_assignees(self) -> None:
        task_id = uuid.uuid4()
        user_id = uuid.uuid4()
        snapshot = SimpleNamespace(
            payload={
                "task_items": [
                    {
                        "match_key": f"id:{task_id}",
                        "task_id": str(task_id),
                        "title": "Weekly obligation",
                        "status": "DONE",
                        "assignees": [
                            {"assignee_id": str(user_id), "assignee_name": "Test User"}
                        ],
                        "occurrences": [{"day": "2026-07-27", "time_slot": "AM"}],
                    }
                ]
            }
        )
        rows = _snapshot_tasks(snapshot)
        self.assertIn(f"id:{task_id}", rows)
        self.assertEqual(rows[f"id:{task_id}"]["assignees"][0]["assignee_id"], user_id)

    def test_snapshot_employee_set_includes_people_without_tasks(self) -> None:
        user_id = uuid.uuid4()
        snapshot = SimpleNamespace(
            payload={
                "department": {
                    "days": [
                        {
                            "users": [
                                {"user_id": str(user_id), "user_name": "No Task User"}
                            ]
                        }
                    ]
                },
                "task_items": [],
            }
        )
        self.assertEqual(_snapshot_users(snapshot), {user_id: "No Task User"})

    def test_deadline_uses_policy_cutoff_and_not_mutable_current_due_date(self) -> None:
        task = {
            "planned_due_date": None,
            "occurrences": [{"day": date(2026, 7, 27), "time_slot": "AM"}],
            "finish_period": "AM",
        }
        source = SimpleNamespace(
            original_due_date=None,
            due_date=datetime(2026, 8, 10, 16, 0, tzinfo=timezone.utc),
        )
        period = SimpleNamespace(end_date=date(2026, 7, 31))
        deadline = _planned_deadline(
            task,
            source,
            period,
            am_cutoff=time(11, 30),
            pm_cutoff=time(17, 0),
        )
        self.assertEqual(deadline.date(), date(2026, 7, 27))
        self.assertEqual(deadline.timetz().replace(tzinfo=None), time(11, 30))

    def test_done_without_completion_timestamp_requires_review(self) -> None:
        classification = _classify_planned_task(
            current={"is_completed": True, "completed_at": None, "status": "DONE"},
            positive_delta=0,
            postponement=None,
            effective_deadline=datetime(2026, 7, 31, 16, 0, tzinfo=timezone.utc),
            period_end=date(2026, 7, 31),
        )
        self.assertEqual(classification, "needs_review")

    def test_in_progress_without_delta_stays_visible_and_is_reviewable(self) -> None:
        classification = _classify_planned_task(
            current={
                "is_completed": False,
                "completed_at": None,
                "status": "IN_PROGRESS",
            },
            positive_delta=0,
            postponement=None,
            effective_deadline=datetime(2026, 7, 31, 16, 0, tzinfo=timezone.utc),
            period_end=date(2026, 7, 31),
        )
        self.assertEqual(classification, "in_progress")

    def test_due_date_change_without_approval_is_unapproved(self) -> None:
        from datetime import datetime, timezone

        task = SimpleNamespace(
            original_due_date=datetime(2026, 7, 27, tzinfo=timezone.utc),
            due_date=datetime(2026, 7, 29, tzinfo=timezone.utc),
            confirmation_assignee_id=None,
            status="TODO",
        )
        classification, evidence = _postponement(task, [])
        self.assertEqual(classification, "unapproved_postponement")
        self.assertEqual(evidence, [])


class TestPolicyMigration(unittest.TestCase):
    def test_policy_v2_migration_compiles(self) -> None:
        path = Path(__file__).parents[1] / "alembic" / "versions" / "0104_realization_policy_v2.py"
        spec = importlib.util.spec_from_file_location("policy_v2_migration", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(
            module.down_revision,
            ("0103_add_realization_domain", "0103_question_daily_signoffs"),
        )
        output = io.StringIO()
        context = MigrationContext.configure(
            dialect_name="postgresql",
            opts={"as_sql": True, "output_buffer": output},
        )
        with Operations.context(context):
            module.upgrade()
            module.downgrade()
        sql = output.getvalue()
        self.assertIn("version", sql)
        self.assertIn("DELETE FROM realization_policy_versions", sql)

    def test_merge_migration_keeps_one_head_for_concurrent_question_work(self) -> None:
        path = (
            Path(__file__).parents[1]
            / "alembic"
            / "versions"
            / "0105_merge_realization_question_batches.py"
        )
        spec = importlib.util.spec_from_file_location("realization_merge_migration", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(
            module.down_revision,
            ("0104_realization_policy_v2", "0104_question_task_batches"),
        )


if __name__ == "__main__":
    unittest.main()
