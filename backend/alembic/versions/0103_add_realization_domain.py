"""add the additive Realization domain

Revision ID: 0103_add_realization_domain
Revises: 0102_merge_question_tasks, 0073_add_primeflow_report_management
Create Date: 2026-07-29
"""

from __future__ import annotations

from alembic import op


revision = "0103_add_realization_domain"
down_revision = ("0102_merge_question_tasks", "0073_add_primeflow_report_management")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE realization_policy_versions (
            id UUID PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            version INTEGER NOT NULL,
            effective_from DATE NOT NULL,
            effective_to DATE,
            criteria_json JSONB NOT NULL,
            bonus_json JSONB NOT NULL,
            am_cutoff TIME NOT NULL,
            pm_cutoff TIME NOT NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            approved_at TIMESTAMPTZ,
            CONSTRAINT uq_realization_policy_name_version UNIQUE (name, version),
            CONSTRAINT ck_realization_policy_positive_version CHECK (version > 0),
            CONSTRAINT ck_realization_policy_effective_range
                CHECK (effective_to IS NULL OR effective_to >= effective_from),
            CONSTRAINT ck_realization_policy_cutoff_order CHECK (am_cutoff < pm_cutoff)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE realization_periods (
            id UUID PRIMARY KEY,
            period_type VARCHAR(12) NOT NULL,
            slot VARCHAR(3) NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
            policy_version_id UUID NOT NULL
                REFERENCES realization_policy_versions(id) ON DELETE RESTRICT,
            planned_snapshot_id UUID
                REFERENCES weekly_planner_snapshots(id) ON DELETE RESTRICT,
            final_snapshot_id UUID
                REFERENCES weekly_planner_snapshots(id) ON DELETE RESTRICT,
            status VARCHAR(12) NOT NULL DEFAULT 'OPEN',
            calculated_at TIMESTAMPTZ,
            approved_at TIMESTAMPTZ,
            locked_at TIMESTAMPTZ,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_realization_period_date_range CHECK (end_date >= start_date),
            CONSTRAINT ck_realization_period_type
                CHECK (period_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),
            CONSTRAINT ck_realization_period_slot CHECK (slot IN ('AM', 'PM', 'ALL')),
            CONSTRAINT ck_realization_period_status
                CHECK (status IN ('OPEN', 'CALCULATED', 'REVIEWED', 'APPROVED', 'LOCKED')),
            CONSTRAINT ck_realization_period_shape CHECK (
                (period_type = 'DAILY' AND slot IN ('AM', 'PM') AND start_date = end_date)
                OR (period_type IN ('WEEKLY', 'MONTHLY') AND slot = 'ALL')
            ),
            CONSTRAINT ck_realization_weekly_snapshots CHECK (
                period_type <> 'WEEKLY' OR status = 'OPEN'
                OR (planned_snapshot_id IS NOT NULL AND final_snapshot_id IS NOT NULL)
            ),
            CONSTRAINT ck_realization_period_approval_pair CHECK (
                (approved_at IS NULL AND approved_by IS NULL)
                OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
            ),
            CONSTRAINT ck_realization_period_lock_state CHECK (
                (status <> 'LOCKED' AND locked_at IS NULL)
                OR (status = 'LOCKED' AND locked_at IS NOT NULL AND approved_at IS NOT NULL)
            )
        )
        """
    )
    op.execute(
        """
        CREATE TABLE realization_observations (
            id UUID PRIMARY KEY,
            period_id UUID REFERENCES realization_periods(id) ON DELETE SET NULL,
            scope_type VARCHAR(20) NOT NULL,
            task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
            department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
            marker VARCHAR(10) NOT NULL,
            category VARCHAR(24) NOT NULL,
            impact_minutes INTEGER,
            repeat_key VARCHAR(200),
            repeat_count_at_creation INTEGER NOT NULL DEFAULT 1,
            comment TEXT,
            evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            source_type VARCHAR(80),
            source_id UUID,
            is_system_generated BOOLEAN NOT NULL DEFAULT false,
            visibility VARCHAR(24) NOT NULL DEFAULT 'PERSON_AND_MANAGER',
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            voided_at TIMESTAMPTZ,
            voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
            void_reason TEXT,
            CONSTRAINT ck_realization_observation_scope CHECK (
                scope_type IN ('TASK', 'PERSON', 'PROJECT', 'DEPARTMENT', 'SYSTEM_TASK')
            ),
            CONSTRAINT ck_realization_observation_marker CHECK (
                marker IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'DIAMOND')
            ),
            CONSTRAINT ck_realization_observation_category CHECK (
                category IN (
                    'EXTRA_TASK', 'HELPED_COLLEAGUE', 'PROPOSAL', 'TIME_SAVED',
                    'QUALITY', 'DELAY', 'ABSENCE', 'MISSED_MEETING', 'BLOCKER',
                    'REPEATED_PROBLEM', 'PRIORITY_CHANGE', 'OTHER'
                )
            ),
            CONSTRAINT ck_realization_observation_visibility CHECK (
                visibility IN ('PRIVATE_MANAGER', 'PERSON_AND_MANAGER', 'TEAM_AGGREGATE')
            ),
            CONSTRAINT ck_realization_observation_scope_reference CHECK (
                (scope_type IN ('TASK', 'SYSTEM_TASK') AND task_id IS NOT NULL)
                OR (scope_type = 'PERSON' AND user_id IS NOT NULL)
                OR (scope_type = 'PROJECT' AND project_id IS NOT NULL)
                OR (scope_type = 'DEPARTMENT' AND department_id IS NOT NULL)
            ),
            CONSTRAINT ck_realization_observation_repeat_count
                CHECK (repeat_count_at_creation >= 1),
            CONSTRAINT ck_realization_observation_nonnegative_impact
                CHECK (impact_minutes IS NULL OR impact_minutes >= 0),
            CONSTRAINT ck_realization_observation_marker_comment CHECK (
                marker NOT IN ('NEGATIVE', 'DIAMOND')
                OR NULLIF(BTRIM(comment), '') IS NOT NULL
            ),
            CONSTRAINT ck_realization_observation_time_saved CHECK (
                category <> 'TIME_SAVED'
                OR (impact_minutes > 0 AND NULLIF(BTRIM(comment), '') IS NOT NULL)
            ),
            CONSTRAINT ck_realization_observation_repeated_problem CHECK (
                category <> 'REPEATED_PROBLEM'
                OR (
                    NULLIF(BTRIM(repeat_key), '') IS NOT NULL
                    AND NULLIF(BTRIM(comment), '') IS NOT NULL
                )
            ),
            CONSTRAINT ck_realization_observation_high_impact_comment CHECK (
                NOT (evidence_json @> '{"high_impact": true}'::jsonb)
                OR NULLIF(BTRIM(comment), '') IS NOT NULL
            ),
            CONSTRAINT ck_realization_observation_void_state CHECK (
                (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
                OR (
                    voided_at IS NOT NULL AND voided_by IS NOT NULL
                    AND NULLIF(BTRIM(void_reason), '') IS NOT NULL
                )
            )
        )
        """
    )
    op.execute(
        """
        CREATE TABLE realization_person_results (
            id UUID PRIMARY KEY,
            period_id UUID NOT NULL REFERENCES realization_periods(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
            facts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            planned_count INTEGER NOT NULL DEFAULT 0,
            completed_on_time_count INTEGER NOT NULL DEFAULT 0,
            completed_late_count INTEGER NOT NULL DEFAULT 0,
            in_progress_count INTEGER NOT NULL DEFAULT 0,
            pending_count INTEGER NOT NULL DEFAULT 0,
            no_progress_count INTEGER NOT NULL DEFAULT 0,
            additional_count INTEGER NOT NULL DEFAULT 0,
            approved_postponement_count INTEGER NOT NULL DEFAULT 0,
            unapproved_postponement_count INTEGER NOT NULL DEFAULT 0,
            system_task_count INTEGER NOT NULL DEFAULT 0,
            system_task_completed_count INTEGER NOT NULL DEFAULT 0,
            meeting_missed_count INTEGER NOT NULL DEFAULT 0,
            tardiness_count INTEGER NOT NULL DEFAULT 0,
            approved_absence_days INTEGER NOT NULL DEFAULT 0,
            unexcused_absence_days INTEGER NOT NULL DEFAULT 0,
            diamond_count INTEGER NOT NULL DEFAULT 0,
            positive_count INTEGER NOT NULL DEFAULT 0,
            negative_count INTEGER NOT NULL DEFAULT 0,
            neutral_count INTEGER NOT NULL DEFAULT 0,
            proposal_count INTEGER NOT NULL DEFAULT 0,
            helped_colleague_count INTEGER NOT NULL DEFAULT 0,
            time_saved_minutes INTEGER NOT NULL DEFAULT 0,
            repeated_problem_count INTEGER NOT NULL DEFAULT 0,
            suggested_symbol VARCHAR(3),
            suggested_level VARCHAR(2),
            suggested_bonus INTEGER,
            final_symbol VARCHAR(3),
            final_level VARCHAR(2),
            final_bonus INTEGER,
            auto_narrative TEXT,
            manager_comment TEXT,
            override_reason TEXT,
            reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_realization_person_result UNIQUE (period_id, user_id),
            CONSTRAINT ck_realization_person_nonnegative_facts CHECK (
                planned_count >= 0 AND completed_on_time_count >= 0
                AND completed_late_count >= 0 AND in_progress_count >= 0
                AND pending_count >= 0 AND no_progress_count >= 0
                AND additional_count >= 0 AND approved_postponement_count >= 0
                AND unapproved_postponement_count >= 0 AND system_task_count >= 0
                AND system_task_completed_count >= 0 AND meeting_missed_count >= 0
                AND tardiness_count >= 0 AND approved_absence_days >= 0
                AND unexcused_absence_days >= 0 AND diamond_count >= 0
                AND positive_count >= 0 AND negative_count >= 0 AND neutral_count >= 0
                AND proposal_count >= 0 AND helped_colleague_count >= 0
                AND time_saved_minutes >= 0 AND repeated_problem_count >= 0
            ),
            CONSTRAINT ck_realization_person_suggested_level CHECK (
                suggested_level IS NULL OR suggested_level IN ('A+', 'A', 'B', 'C', 'M', 'D', 'E')
            ),
            CONSTRAINT ck_realization_person_final_level CHECK (
                final_level IS NULL OR final_level IN ('A+', 'A', 'B', 'C', 'M', 'D', 'E')
            ),
            CONSTRAINT ck_realization_person_suggested_symbol CHECK (
                suggested_symbol IS NULL OR suggested_symbol IN ('+', '+/-', '-')
            ),
            CONSTRAINT ck_realization_person_final_symbol CHECK (
                final_symbol IS NULL OR final_symbol IN ('+', '+/-', '-')
            ),
            CONSTRAINT ck_realization_person_suggested_bonus CHECK (
                suggested_bonus IS NULL OR suggested_bonus >= 0
            ),
            CONSTRAINT ck_realization_person_final_bonus CHECK (
                final_bonus IS NULL OR final_bonus >= 0
            ),
            CONSTRAINT ck_realization_person_final_complete CHECK (
                (final_symbol IS NULL AND final_level IS NULL AND final_bonus IS NULL)
                OR (final_symbol IS NOT NULL AND final_level IS NOT NULL AND final_bonus IS NOT NULL)
            ),
            CONSTRAINT ck_realization_person_override_reason CHECK (
                final_level IS NULL
                OR (
                    final_level IS NOT DISTINCT FROM suggested_level
                    AND final_symbol IS NOT DISTINCT FROM suggested_symbol
                    AND final_bonus IS NOT DISTINCT FROM suggested_bonus
                )
                OR NULLIF(BTRIM(override_reason), '') IS NOT NULL
            ),
            CONSTRAINT ck_realization_person_review_pair CHECK (
                (reviewed_by IS NULL AND reviewed_at IS NULL)
                OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
            ),
            CONSTRAINT ck_realization_person_approval_pair CHECK (
                (approved_by IS NULL AND approved_at IS NULL)
                OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
            )
        )
        """
    )
    op.execute(
        """
        CREATE TABLE realization_department_results (
            id UUID PRIMARY KEY,
            period_id UUID NOT NULL REFERENCES realization_periods(id) ON DELETE CASCADE,
            department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
            facts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            a_plus_count INTEGER NOT NULL DEFAULT 0,
            a_count INTEGER NOT NULL DEFAULT 0,
            b_count INTEGER NOT NULL DEFAULT 0,
            c_count INTEGER NOT NULL DEFAULT 0,
            m_count INTEGER NOT NULL DEFAULT 0,
            d_count INTEGER NOT NULL DEFAULT 0,
            e_count INTEGER NOT NULL DEFAULT 0,
            a_rate NUMERIC(5, 2),
            total_bonus NUMERIC(12, 2),
            average_bonus NUMERIC(12, 2),
            proposal_count INTEGER NOT NULL DEFAULT 0,
            time_saved_minutes INTEGER NOT NULL DEFAULT 0,
            repeated_problem_count INTEGER NOT NULL DEFAULT 0,
            trend_percent NUMERIC(6, 2),
            department_suggestion TEXT,
            final_comment TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_realization_department_result UNIQUE (period_id, department_id),
            CONSTRAINT ck_realization_department_nonnegative_facts CHECK (
                a_plus_count >= 0 AND a_count >= 0 AND b_count >= 0 AND c_count >= 0
                AND m_count >= 0 AND d_count >= 0 AND e_count >= 0
                AND proposal_count >= 0 AND time_saved_minutes >= 0
                AND repeated_problem_count >= 0
            ),
            CONSTRAINT ck_realization_department_metrics CHECK (
                (a_rate IS NULL OR (a_rate >= 0 AND a_rate <= 100))
                AND (trend_percent IS NULL OR (trend_percent >= -100 AND trend_percent <= 100))
                AND (average_bonus IS NULL OR average_bonus >= 0)
                AND (total_bonus IS NULL OR total_bonus >= 0)
            )
        )
        """
    )

    op.execute(
        "CREATE UNIQUE INDEX uq_realization_period_department_scope "
        "ON realization_periods "
        "(period_type, slot, start_date, end_date, department_id) "
        "WHERE department_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_realization_period_global_scope "
        "ON realization_periods (period_type, slot, start_date, end_date) "
        "WHERE department_id IS NULL"
    )

    indexes = (
        ("ix_realization_period_lookup", "realization_periods", "start_date, end_date, period_type, status"),
        ("ix_realization_periods_department_id", "realization_periods", "department_id"),
        ("ix_realization_periods_policy_version_id", "realization_periods", "policy_version_id"),
        ("ix_realization_periods_planned_snapshot_id", "realization_periods", "planned_snapshot_id"),
        ("ix_realization_periods_final_snapshot_id", "realization_periods", "final_snapshot_id"),
        ("ix_realization_observation_period_user", "realization_observations", "period_id, user_id, created_at"),
        ("ix_realization_observation_repeat_key", "realization_observations", "repeat_key, created_at"),
        ("ix_realization_observation_source", "realization_observations", "source_type, source_id"),
        ("ix_realization_observations_period_id", "realization_observations", "period_id"),
        ("ix_realization_observations_task_id", "realization_observations", "task_id"),
        ("ix_realization_observations_user_id", "realization_observations", "user_id"),
        ("ix_realization_observations_project_id", "realization_observations", "project_id"),
        ("ix_realization_observations_department_id", "realization_observations", "department_id"),
        ("ix_realization_observations_created_by", "realization_observations", "created_by"),
        ("ix_realization_person_department", "realization_person_results", "period_id, department_id"),
        ("ix_realization_person_results_period_id", "realization_person_results", "period_id"),
        ("ix_realization_person_results_user_id", "realization_person_results", "user_id"),
        ("ix_realization_person_results_department_id", "realization_person_results", "department_id"),
        ("ix_realization_department_period", "realization_department_results", "period_id, department_id"),
        ("ix_realization_department_results_period_id", "realization_department_results", "period_id"),
        ("ix_realization_department_results_department_id", "realization_department_results", "department_id"),
    )
    for name, table, columns in indexes:
        op.execute(f"CREATE INDEX {name} ON {table} ({columns})")

    op.execute(
        """
        INSERT INTO realization_policy_versions (
            id, name, version, effective_from, criteria_json, bonus_json,
            am_cutoff, pm_cutoff, approved_at
        )
        VALUES (
            '00000000-0000-4000-8000-000000000001',
            'PrimeFlow Realization',
            1,
            DATE '2026-01-01',
            '{
              "algorithm": "first_matching_rule",
              "evidence_incomplete": {"result": "NEEDS_REVIEW"},
              "ordered_levels": [
                {"level": "E", "when": "no_real_progress_without_approved_reason"},
                {"level": "D", "when": "partial_or_unapproved_failure"},
                {"level": "M", "when": "approved_absence_and_workday_obligations_complete"},
                {"level": "C", "when": "complete_with_frequent_delays"},
                {"level": "A+", "when": "complete_on_time_with_multiple_verified_high_impact_extras"},
                {"level": "A", "when": "complete_on_time_with_one_verified_extra"},
                {"level": "B", "when": "complete_on_time_without_extra"}
              ],
              "diamond_is_evidence_not_grade": true,
              "additional_requires_verification": true,
              "approved_postponement_is_not_penalized": true
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
    op.execute("DROP TABLE realization_department_results")
    op.execute("DROP TABLE realization_person_results")
    op.execute("DROP TABLE realization_observations")
    op.execute("DROP TABLE realization_periods")
    op.execute("DROP TABLE realization_policy_versions")
