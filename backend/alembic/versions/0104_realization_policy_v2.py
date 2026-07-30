"""Merge current heads and seed deterministic Realization policy version 2."""

from __future__ import annotations

from alembic import op


revision = "0104_realization_policy_v2"
down_revision = ("0103_add_realization_domain", "0103_question_daily_signoffs")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX uq_realization_observation_active_verification "
        "ON realization_observations (period_id, source_type, source_id) "
        "WHERE source_type = 'realization_observation_verification' "
        "AND voided_at IS NULL"
    )
    op.execute(
        """
        INSERT INTO realization_policy_versions (
            id, name, version, effective_from, criteria_json, bonus_json,
            am_cutoff, pm_cutoff, approved_at
        )
        VALUES (
            '00000000-0000-4000-8000-000000000002',
            'PrimeFlow Realization',
            2,
            DATE '2026-01-01',
            '{
              "algorithm": "first_matching_rule",
              "frequent_tardiness_threshold": 3,
              "a_plus_verified_extra_min": 2,
              "a_verified_extra_min": 1,
              "unexpected_absence_e_threshold": 2,
              "repeated_problem_d_threshold": 2,
              "approved_postponement_is_not_penalized": true,
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
            '{"A+": 50, "A": 40, "B": 30, "C": 20, "M": 15, "D": 10, "E": 0}'::jsonb,
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
        "WHERE name = 'PrimeFlow Realization' AND version = 2"
    )
    op.execute("DROP INDEX uq_realization_observation_active_verification")
