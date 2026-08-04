"""persist daily realization and remove monetary scoring

Revision ID: 20260804_realization_automation
Revises: 20260804_performance_hot_paths
Create Date: 2026-08-04
"""

from __future__ import annotations

from alembic import op


revision = "20260804_realization_automation"
down_revision = "20260804_performance_hot_paths"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE realization_periods "
        "DROP CONSTRAINT IF EXISTS ck_realization_period_shape"
    )
    op.execute(
        "ALTER TABLE realization_periods ADD CONSTRAINT ck_realization_period_shape CHECK ("
        "(period_type = 'DAILY' AND slot IN ('AM', 'PM', 'ALL') AND start_date = end_date) "
        "OR (period_type IN ('WEEKLY', 'MONTHLY') AND slot = 'ALL'))"
    )

    op.execute(
        "UPDATE realization_person_results SET suggested_bonus = NULL, final_bonus = NULL"
    )
    op.execute(
        "UPDATE realization_department_results SET total_bonus = NULL, average_bonus = NULL"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "DROP CONSTRAINT IF EXISTS ck_realization_person_final_complete"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "DROP CONSTRAINT IF EXISTS ck_realization_person_override_reason"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "ADD CONSTRAINT ck_realization_person_final_complete CHECK ("
        "(final_symbol IS NULL AND final_level IS NULL) OR "
        "(final_symbol IS NOT NULL AND final_level IS NOT NULL))"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "ADD CONSTRAINT ck_realization_person_override_reason CHECK ("
        "final_level IS NULL OR ("
        "final_level IS NOT DISTINCT FROM suggested_level AND "
        "final_symbol IS NOT DISTINCT FROM suggested_symbol) OR "
        "NULLIF(BTRIM(override_reason), '') IS NOT NULL)"
    )

    op.execute(
        """
        INSERT INTO realization_policy_versions (
            id, name, version, effective_from, criteria_json, bonus_json,
            am_cutoff, pm_cutoff, approved_at
        )
        VALUES (
            '00000000-0000-4000-8000-000000000003',
            'PrimeFlow Realization',
            3,
            DATE '2026-01-01',
            '{
              "algorithm": "first_matching_rule",
              "frequent_tardiness_threshold": 3,
              "a_plus_verified_extra_min": 2,
              "a_verified_extra_min": 1,
              "unexpected_absence_e_threshold": 2,
              "repeated_problem_d_threshold": 2,
              "approved_postponement_is_not_penalized": true,
              "annual_leave_is_baseline_b": true,
              "approved_personal_absence_is_m": true,
              "meeting_absence_requires_verified_evidence": true,
              "additional_requires_verification": true,
              "diamond_is_evidence_not_grade": true,
              "symbols": {
                "A+": "+", "A": "+", "B": "+", "C": "+/-",
                "M": "+/-", "D": "-", "E": "-"
              },
              "impact_caps": {
                "MINOR": "C", "MAJOR": "D", "MULTIPLE_PEOPLE": "D"
              },
              "ordered_levels": ["E", "D", "M", "C", "A+", "A", "B"]
            }'::jsonb,
            '{}'::jsonb,
            TIME '12:00:00',
            TIME '16:00:00',
            now()
        )
        ON CONFLICT (name, version) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM realization_policy_versions "
        "WHERE name = 'PrimeFlow Realization' AND version = 3"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "DROP CONSTRAINT IF EXISTS ck_realization_person_override_reason"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "DROP CONSTRAINT IF EXISTS ck_realization_person_final_complete"
    )
    op.execute(
        "UPDATE realization_person_results SET "
        "suggested_bonus = CASE WHEN suggested_level IS NULL THEN NULL ELSE 0 END, "
        "final_bonus = CASE WHEN final_level IS NULL THEN NULL ELSE 0 END"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "ADD CONSTRAINT ck_realization_person_final_complete CHECK ("
        "(final_symbol IS NULL AND final_level IS NULL AND final_bonus IS NULL) OR "
        "(final_symbol IS NOT NULL AND final_level IS NOT NULL AND final_bonus IS NOT NULL))"
    )
    op.execute(
        "ALTER TABLE realization_person_results "
        "ADD CONSTRAINT ck_realization_person_override_reason CHECK ("
        "final_level IS NULL OR ("
        "final_level IS NOT DISTINCT FROM suggested_level AND "
        "final_symbol IS NOT DISTINCT FROM suggested_symbol AND "
        "final_bonus IS NOT DISTINCT FROM suggested_bonus) OR "
        "NULLIF(BTRIM(override_reason), '') IS NOT NULL)"
    )
    op.execute(
        "ALTER TABLE realization_periods "
        "DROP CONSTRAINT IF EXISTS ck_realization_period_shape"
    )
    op.execute(
        "ALTER TABLE realization_periods ADD CONSTRAINT ck_realization_period_shape CHECK ("
        "(period_type = 'DAILY' AND slot IN ('AM', 'PM') AND start_date = end_date) "
        "OR (period_type IN ('WEEKLY', 'MONTHLY') AND slot = 'ALL'))"
    )
