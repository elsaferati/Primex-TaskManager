import importlib.util
import io
import unittest
import uuid
from dataclasses import dataclass
from datetime import date, time
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from pydantic import ValidationError
from sqlalchemy import CheckConstraint

from app.models.enums import (
    RealizationLevel,
    RealizationMarker,
    RealizationObservationCategory,
    RealizationObservationVisibility,
    RealizationPeriodSlot,
    RealizationPeriodType,
    RealizationScopeType,
    RealizationSymbol,
    UserRole,
)
from app.models.realization import (
    RealizationDepartmentResult,
    RealizationObservation,
    RealizationPeriod,
    RealizationPersonResult,
    RealizationPolicyVersion,
)
from app.models.task import Task
from app.schemas.realization import (
    RealizationFinalDecision,
    RealizationObservationCreate,
    RealizationPeriodCreate,
    RealizationPolicyVersionCreate,
)
from app.services.realization_access import (
    can_approve_realization,
    can_lock_realization,
    can_review_realization,
    can_view_department_aggregate,
    can_view_observation,
    can_view_person_result,
)


@dataclass
class UserStub:
    id: uuid.UUID
    role: UserRole
    department_id: uuid.UUID | None


def _person_observation(**overrides: object) -> dict:
    data: dict = {
        "scope_type": RealizationScopeType.PERSON,
        "user_id": uuid.uuid4(),
        "marker": RealizationMarker.NEUTRAL,
        "category": RealizationObservationCategory.OTHER,
    }
    data.update(overrides)
    return data


class TestRealizationDomainContract(unittest.TestCase):
    def test_neutral_observation_is_not_mixed_weekly_symbol(self) -> None:
        self.assertEqual(RealizationMarker.NEUTRAL.value, "NEUTRAL")
        self.assertEqual(RealizationSymbol.MIXED.value, "+/-")
        self.assertNotEqual(RealizationMarker.NEUTRAL.value, RealizationSymbol.MIXED.value)

    def test_diamond_is_not_a_level(self) -> None:
        self.assertNotIn(RealizationMarker.DIAMOND.value, {level.value for level in RealizationLevel})

    def test_all_five_tables_are_registered_without_task_columns(self) -> None:
        tables = RealizationPolicyVersion.metadata.tables
        expected = {
            "realization_policy_versions",
            "realization_periods",
            "realization_observations",
            "realization_person_results",
            "realization_department_results",
        }
        self.assertTrue(expected.issubset(tables))
        self.assertFalse(any(column.name.startswith("realization_") for column in Task.__table__.columns))

    def test_critical_database_constraints_are_present(self) -> None:
        models_and_constraints = {
            RealizationPeriod: {
                "ck_realization_period_shape",
                "ck_realization_weekly_snapshots",
                "ck_realization_period_lock_state",
            },
            RealizationObservation: {
                "ck_realization_observation_scope_reference",
                "ck_realization_observation_marker_comment",
                "ck_realization_observation_time_saved",
                "ck_realization_observation_high_impact_comment",
                "ck_realization_observation_nonnegative_impact",
                "ck_realization_observation_void_state",
            },
            RealizationPersonResult: {
                "ck_realization_person_final_complete",
                "ck_realization_person_override_reason",
                "ck_realization_person_nonnegative_facts",
            },
            RealizationDepartmentResult: {
                "ck_realization_department_nonnegative_facts",
                "ck_realization_department_metrics",
            },
        }
        for model, expected in models_and_constraints.items():
            names = {
                constraint.name
                for constraint in model.__table__.constraints
                if isinstance(constraint, CheckConstraint)
            }
            for expected_name in expected:
                self.assertTrue(
                    any(name and name.endswith(expected_name) for name in names),
                    f"{model.__name__}: {expected_name}",
                )

    def test_daily_period_accepts_all_day_snapshot(self) -> None:
        valid = RealizationPeriodCreate(
            period_type=RealizationPeriodType.DAILY,
            slot=RealizationPeriodSlot.AM,
            start_date=date(2026, 7, 29),
            end_date=date(2026, 7, 29),
            policy_version_id=uuid.uuid4(),
        )
        self.assertEqual(valid.slot, RealizationPeriodSlot.AM)
        all_day = RealizationPeriodCreate(
            period_type=RealizationPeriodType.DAILY,
            slot=RealizationPeriodSlot.ALL,
            start_date=date(2026, 7, 29),
            end_date=date(2026, 7, 29),
            policy_version_id=uuid.uuid4(),
        )
        self.assertEqual(all_day.slot, RealizationPeriodSlot.ALL)

    def test_weekly_period_requires_all_slot(self) -> None:
        with self.assertRaises(ValidationError):
            RealizationPeriodCreate(
                period_type=RealizationPeriodType.WEEKLY,
                slot=RealizationPeriodSlot.PM,
                start_date=date(2026, 7, 27),
                end_date=date(2026, 8, 2),
                policy_version_id=uuid.uuid4(),
            )

    def test_policy_does_not_require_monetary_values(self) -> None:
        common = {
            "name": "Policy",
            "version": 1,
            "effective_from": date(2026, 1, 1),
            "criteria_json": {"algorithm": "first_matching_rule"},
            "am_cutoff": time(12, 0),
            "pm_cutoff": time(16, 0),
        }
        policy = RealizationPolicyVersionCreate(**common)
        self.assertEqual(policy.bonus_json, {})

    def test_negative_and_diamond_require_comment(self) -> None:
        for marker in (RealizationMarker.NEGATIVE, RealizationMarker.DIAMOND):
            with self.subTest(marker=marker), self.assertRaises(ValidationError):
                RealizationObservationCreate(**_person_observation(marker=marker))

    def test_time_saved_requires_positive_minutes_and_comment(self) -> None:
        with self.assertRaises(ValidationError):
            RealizationObservationCreate(
                **_person_observation(
                    marker=RealizationMarker.POSITIVE,
                    category=RealizationObservationCategory.TIME_SAVED,
                    impact_minutes=0,
                    comment="Automation",
                )
            )
        observation = RealizationObservationCreate(
            **_person_observation(
                marker=RealizationMarker.POSITIVE,
                category=RealizationObservationCategory.TIME_SAVED,
                impact_minutes=45,
                comment="Automated a manual reconciliation",
            )
        )
        self.assertEqual(observation.impact_minutes, 45)

    def test_repeated_problem_requires_repeat_key(self) -> None:
        with self.assertRaises(ValidationError):
            RealizationObservationCreate(
                **_person_observation(
                    marker=RealizationMarker.NEGATIVE,
                    category=RealizationObservationCategory.REPEATED_PROBLEM,
                    comment="Same handoff failed again",
                )
            )

    def test_high_impact_evidence_requires_comment(self) -> None:
        with self.assertRaises(ValidationError):
            RealizationObservationCreate(
                **_person_observation(
                    marker=RealizationMarker.POSITIVE,
                    category=RealizationObservationCategory.QUALITY,
                    evidence_json={"high_impact": True},
                )
            )

    def test_completed_extra_requires_traceable_nonreplacement_evidence(self) -> None:
        task_id = uuid.uuid4()
        with self.assertRaises(ValidationError):
            RealizationObservationCreate(
                scope_type=RealizationScopeType.TASK,
                task_id=task_id,
                user_id=uuid.uuid4(),
                marker=RealizationMarker.POSITIVE,
                category=RealizationObservationCategory.EXTRA_TASK,
                comment="Completed an additional obligation",
                evidence_json={"kind": "COMPLETED_EXTRA_TASK"},
            )
        observation = RealizationObservationCreate(
            scope_type=RealizationScopeType.TASK,
            task_id=task_id,
            user_id=uuid.uuid4(),
            marker=RealizationMarker.POSITIVE,
            category=RealizationObservationCategory.EXTRA_TASK,
            comment="Completed an additional obligation",
            evidence_json={
                "kind": "COMPLETED_EXTRA_TASK",
                "replaces_unfinished_planned_task": False,
                "duplicate": False,
            },
        )
        self.assertFalse(observation.evidence_json["duplicate"])

    def test_scope_requires_matching_evidence_reference(self) -> None:
        with self.assertRaises(ValidationError):
            RealizationObservationCreate(
                scope_type=RealizationScopeType.TASK,
                marker=RealizationMarker.NEUTRAL,
                category=RealizationObservationCategory.OTHER,
            )

    def test_final_decision_is_complete(self) -> None:
        with self.assertRaises(ValidationError):
            RealizationFinalDecision(final_level=RealizationLevel.B)

    def test_final_override_requires_reason(self) -> None:
        decision = RealizationFinalDecision(
            final_symbol=RealizationSymbol.MIXED,
            final_level=RealizationLevel.C,
        )
        with self.assertRaises(ValueError):
            decision.validate_against_suggestion(
                suggested_symbol=RealizationSymbol.POSITIVE,
                suggested_level=RealizationLevel.B,
            )
        unchanged = RealizationFinalDecision(
            final_symbol=RealizationSymbol.POSITIVE,
            final_level=RealizationLevel.B,
        )
        unchanged.validate_against_suggestion(
            suggested_symbol=RealizationSymbol.POSITIVE,
            suggested_level=RealizationLevel.B,
        )


class TestRealizationMigration(unittest.TestCase):
    def test_upgrade_and_downgrade_compile_to_postgresql_sql(self) -> None:
        migration_path = (
            Path(__file__).parents[1]
            / "alembic"
            / "versions"
            / "0103_add_realization_domain.py"
        )
        spec = importlib.util.spec_from_file_location(
            "test_realization_migration_module", migration_path
        )
        if spec is None or spec.loader is None:
            self.fail("could not load Realization migration")
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)

        self.assertEqual(
            migration.down_revision,
            ("0102_merge_question_tasks", "0073_add_primeflow_report_management"),
        )
        output = io.StringIO()
        context = MigrationContext.configure(
            dialect_name="postgresql",
            opts={"as_sql": True, "output_buffer": output},
        )
        with Operations.context(context):
            migration.upgrade()
            migration.downgrade()

        sql = output.getvalue()
        self.assertEqual(sql.count("CREATE TABLE realization_"), 5)
        self.assertEqual(sql.count("DROP TABLE realization_"), 5)
        self.assertIn("uq_realization_period_global_scope", sql)
        self.assertIn("PrimeFlow Realization", sql)


class TestRealizationPermissions(unittest.TestCase):
    def setUp(self) -> None:
        self.department = uuid.uuid4()
        self.other_department = uuid.uuid4()
        self.staff = UserStub(uuid.uuid4(), UserRole.STAFF, self.department)
        self.manager = UserStub(uuid.uuid4(), UserRole.MANAGER, self.department)
        self.admin = UserStub(uuid.uuid4(), UserRole.ADMIN, None)

    def test_staff_cannot_open_realization_person_detail(self) -> None:
        self.assertFalse(
            can_view_person_result(
                self.staff,
                subject_user_id=self.staff.id,
                subject_department_id=self.department,
            )
        )
        self.assertFalse(
            can_view_person_result(
                self.staff,
                subject_user_id=uuid.uuid4(),
                subject_department_id=self.department,
            )
        )

    def test_manager_scope_is_department_bound(self) -> None:
        self.assertTrue(
            can_view_person_result(
                self.manager,
                subject_user_id=uuid.uuid4(),
                subject_department_id=self.department,
            )
        )
        self.assertFalse(
            can_review_realization(self.manager, department_id=self.other_department)
        )
        self.assertTrue(can_review_realization(self.manager, department_id=self.department))

    def test_private_manager_comment_is_hidden_from_staff(self) -> None:
        self.assertFalse(
            can_view_observation(
                self.staff,
                subject_user_id=self.staff.id,
                department_id=self.department,
                visibility=RealizationObservationVisibility.PRIVATE_MANAGER,
            )
        )
        self.assertTrue(
            can_view_observation(
                self.manager,
                subject_user_id=self.staff.id,
                department_id=self.department,
                visibility=RealizationObservationVisibility.PRIVATE_MANAGER,
            )
        )

    def test_staff_cannot_see_team_aggregate_or_private_detail(self) -> None:
        self.assertFalse(
            can_view_department_aggregate(self.staff, department_id=self.other_department)
        )
        self.assertFalse(
            can_view_observation(
                self.staff,
                subject_user_id=None,
                department_id=self.other_department,
                visibility=RealizationObservationVisibility.TEAM_AGGREGATE,
            )
        )

    def test_only_admin_can_approve_and_lock(self) -> None:
        self.assertFalse(can_approve_realization(self.manager))
        self.assertFalse(can_lock_realization(self.manager))
        self.assertTrue(can_approve_realization(self.admin))
        self.assertTrue(can_lock_realization(self.admin))

    def test_admin_access_is_global(self) -> None:
        self.assertTrue(
            can_view_person_result(
                self.admin,
                subject_user_id=uuid.uuid4(),
                subject_department_id=self.other_department,
            )
        )
        self.assertTrue(can_review_realization(self.admin, department_id=None))


if __name__ == "__main__":
    unittest.main()
