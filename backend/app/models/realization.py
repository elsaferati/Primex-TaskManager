from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    Boolean,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import (
    RealizationLevel,
    RealizationDailyCloseAction,
    RealizationMarker,
    RealizationObservationCategory,
    RealizationObservationVisibility,
    RealizationPeriodSlot,
    RealizationPeriodStatus,
    RealizationPeriodType,
    RealizationScopeType,
    RealizationSymbol,
    RealizationOperatingMode,
    RealizationPulse,
)


def _values(enum_type: type) -> str:
    return ", ".join(f"'{item.value}'" for item in enum_type)


class RealizationPolicyVersion(Base):
    __tablename__ = "realization_policy_versions"
    __table_args__ = (
        UniqueConstraint("name", "version", name="uq_realization_policy_name_version"),
        CheckConstraint("version > 0", name="ck_realization_policy_positive_version"),
        CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_realization_policy_effective_range",
        ),
        CheckConstraint("am_cutoff < pm_cutoff", name="ck_realization_policy_cutoff_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    criteria_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    bonus_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    am_cutoff: Mapped[time] = mapped_column(Time, nullable=False)
    pm_cutoff: Mapped[time] = mapped_column(Time, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RealizationPeriod(Base):
    __tablename__ = "realization_periods"
    __table_args__ = (
        Index(
            "uq_realization_period_department_scope",
            "period_type",
            "slot",
            "start_date",
            "end_date",
            "department_id",
            unique=True,
            postgresql_where=text("department_id IS NOT NULL"),
        ),
        Index(
            "uq_realization_period_global_scope",
            "period_type",
            "slot",
            "start_date",
            "end_date",
            unique=True,
            postgresql_where=text("department_id IS NULL"),
        ),
        CheckConstraint("end_date >= start_date", name="ck_realization_period_date_range"),
        CheckConstraint(
            f"period_type IN ({_values(RealizationPeriodType)})",
            name="ck_realization_period_type",
        ),
        CheckConstraint(
            f"slot IN ({_values(RealizationPeriodSlot)})",
            name="ck_realization_period_slot",
        ),
        CheckConstraint(
            f"status IN ({_values(RealizationPeriodStatus)})",
            name="ck_realization_period_status",
        ),
        CheckConstraint(
            "(period_type = 'DAILY' AND slot IN ('AM', 'PM', 'ALL') AND start_date = end_date) "
            "OR (period_type IN ('WEEKLY', 'MONTHLY') AND slot = 'ALL')",
            name="ck_realization_period_shape",
        ),
        CheckConstraint(
            "period_type <> 'WEEKLY' OR status = 'OPEN' "
            "OR (planned_snapshot_id IS NOT NULL AND final_snapshot_id IS NOT NULL)",
            name="ck_realization_weekly_snapshots",
        ),
        CheckConstraint(
            "(approved_at IS NULL AND approved_by IS NULL) "
            "OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_realization_period_approval_pair",
        ),
        CheckConstraint(
            "(status <> 'LOCKED' AND locked_at IS NULL) "
            "OR (status = 'LOCKED' AND locked_at IS NOT NULL AND approved_at IS NOT NULL)",
            name="ck_realization_period_lock_state",
        ),
        Index("ix_realization_period_lookup", "start_date", "end_date", "period_type", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_type: Mapped[str] = mapped_column(String(12), nullable=False)
    slot: Mapped[str] = mapped_column(String(3), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), index=True
    )
    policy_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realization_policy_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    planned_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weekly_planner_snapshots.id", ondelete="RESTRICT"),
        index=True,
    )
    final_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weekly_planner_snapshots.id", ondelete="RESTRICT"),
        index=True,
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default="OPEN")
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RealizationObservation(Base):
    __tablename__ = "realization_observations"
    __table_args__ = (
        CheckConstraint(
            f"scope_type IN ({_values(RealizationScopeType)})",
            name="ck_realization_observation_scope",
        ),
        CheckConstraint(
            f"marker IN ({_values(RealizationMarker)})",
            name="ck_realization_observation_marker",
        ),
        CheckConstraint(
            f"category IN ({_values(RealizationObservationCategory)})",
            name="ck_realization_observation_category",
        ),
        CheckConstraint(
            f"visibility IN ({_values(RealizationObservationVisibility)})",
            name="ck_realization_observation_visibility",
        ),
        CheckConstraint(
            "(scope_type IN ('TASK', 'SYSTEM_TASK') AND task_id IS NOT NULL) "
            "OR (scope_type = 'PERSON' AND user_id IS NOT NULL) "
            "OR (scope_type = 'PROJECT' AND project_id IS NOT NULL) "
            "OR (scope_type = 'DEPARTMENT' AND department_id IS NOT NULL)",
            name="ck_realization_observation_scope_reference",
        ),
        CheckConstraint(
            "repeat_count_at_creation >= 1",
            name="ck_realization_observation_repeat_count",
        ),
        CheckConstraint(
            "impact_minutes IS NULL OR impact_minutes >= 0",
            name="ck_realization_observation_nonnegative_impact",
        ),
        CheckConstraint(
            "marker NOT IN ('NEGATIVE', 'DIAMOND') OR NULLIF(BTRIM(comment), '') IS NOT NULL",
            name="ck_realization_observation_marker_comment",
        ),
        CheckConstraint(
            "category <> 'TIME_SAVED' OR "
            "(impact_minutes > 0 AND NULLIF(BTRIM(comment), '') IS NOT NULL)",
            name="ck_realization_observation_time_saved",
        ),
        CheckConstraint(
            "category <> 'REPEATED_PROBLEM' OR "
            "(NULLIF(BTRIM(repeat_key), '') IS NOT NULL "
            "AND NULLIF(BTRIM(comment), '') IS NOT NULL)",
            name="ck_realization_observation_repeated_problem",
        ),
        CheckConstraint(
            "NOT (evidence_json @> '{\"high_impact\": true}'::jsonb) "
            "OR NULLIF(BTRIM(comment), '') IS NOT NULL",
            name="ck_realization_observation_high_impact_comment",
        ),
        CheckConstraint(
            "(voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) "
            "OR (voided_at IS NOT NULL AND voided_by IS NOT NULL "
            "AND NULLIF(BTRIM(void_reason), '') IS NOT NULL)",
            name="ck_realization_observation_void_state",
        ),
        Index("ix_realization_observation_period_user", "period_id", "user_id", "created_at"),
        Index("ix_realization_observation_repeat_key", "repeat_key", "created_at"),
        Index("ix_realization_observation_source", "source_type", "source_id"),
        Index(
            "uq_realization_observation_active_verification",
            "period_id",
            "source_type",
            "source_id",
            unique=True,
            postgresql_where=text(
                "source_type = 'realization_observation_verification' "
                "AND voided_at IS NULL"
            ),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realization_periods.id", ondelete="SET NULL"), index=True
    )
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), index=True
    )
    marker: Mapped[str] = mapped_column(String(10), nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    impact_minutes: Mapped[int | None] = mapped_column(Integer)
    repeat_key: Mapped[str | None] = mapped_column(String(200))
    repeat_count_at_creation: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )
    comment: Mapped[str | None] = mapped_column(Text)
    evidence_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    source_type: Mapped[str | None] = mapped_column(String(80))
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_system_generated: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false")
    )
    visibility: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default="PERSON_AND_MANAGER"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    void_reason: Mapped[str | None] = mapped_column(Text)


class RealizationPersonResult(Base):
    __tablename__ = "realization_person_results"
    __table_args__ = (
        UniqueConstraint("period_id", "user_id", name="uq_realization_person_result"),
        CheckConstraint(
            "planned_count >= 0 AND completed_on_time_count >= 0 "
            "AND completed_late_count >= 0 AND in_progress_count >= 0 "
            "AND pending_count >= 0 AND no_progress_count >= 0 "
            "AND additional_count >= 0 AND approved_postponement_count >= 0 "
            "AND unapproved_postponement_count >= 0 AND system_task_count >= 0 "
            "AND system_task_completed_count >= 0 AND meeting_missed_count >= 0 "
            "AND tardiness_count >= 0 AND approved_absence_days >= 0 "
            "AND unexcused_absence_days >= 0 AND diamond_count >= 0 "
            "AND positive_count >= 0 AND negative_count >= 0 AND neutral_count >= 0 "
            "AND proposal_count >= 0 AND helped_colleague_count >= 0 "
            "AND time_saved_minutes >= 0 AND repeated_problem_count >= 0",
            name="ck_realization_person_nonnegative_facts",
        ),
        CheckConstraint(
            f"suggested_level IS NULL OR suggested_level IN ({_values(RealizationLevel)})",
            name="ck_realization_person_suggested_level",
        ),
        CheckConstraint(
            f"final_level IS NULL OR final_level IN ({_values(RealizationLevel)})",
            name="ck_realization_person_final_level",
        ),
        CheckConstraint(
            f"ai_suggested_level IS NULL OR ai_suggested_level IN ({_values(RealizationLevel)})",
            name="ck_realization_person_ai_suggested_level",
        ),
        CheckConstraint(
            f"suggested_symbol IS NULL OR suggested_symbol IN ({_values(RealizationSymbol)})",
            name="ck_realization_person_suggested_symbol",
        ),
        CheckConstraint(
            f"final_symbol IS NULL OR final_symbol IN ({_values(RealizationSymbol)})",
            name="ck_realization_person_final_symbol",
        ),
        CheckConstraint(
            "suggested_bonus IS NULL OR suggested_bonus >= 0",
            name="ck_realization_person_suggested_bonus",
        ),
        CheckConstraint(
            "final_bonus IS NULL OR final_bonus >= 0",
            name="ck_realization_person_final_bonus",
        ),
        CheckConstraint(
            "(final_symbol IS NULL AND final_level IS NULL) "
            "OR (final_symbol IS NOT NULL AND final_level IS NOT NULL)",
            name="ck_realization_person_final_complete",
        ),
        CheckConstraint(
            "final_level IS NULL "
            "OR (final_level IS NOT DISTINCT FROM suggested_level "
            "AND final_symbol IS NOT DISTINCT FROM suggested_symbol) "
            "OR NULLIF(BTRIM(override_reason), '') IS NOT NULL",
            name="ck_realization_person_override_reason",
        ),
        CheckConstraint(
            "(reviewed_by IS NULL AND reviewed_at IS NULL) "
            "OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_realization_person_review_pair",
        ),
        CheckConstraint(
            "(approved_by IS NULL AND approved_at IS NULL) "
            "OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)",
            name="ck_realization_person_approval_pair",
        ),
        Index("ix_realization_person_department", "period_id", "department_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realization_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), index=True
    )
    facts_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    planned_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    completed_on_time_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    completed_late_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    in_progress_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    pending_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    no_progress_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    additional_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    approved_postponement_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    unapproved_postponement_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    system_task_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    system_task_completed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    meeting_missed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    tardiness_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    approved_absence_days: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    unexcused_absence_days: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    diamond_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    positive_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    negative_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    neutral_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    proposal_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    helped_colleague_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    time_saved_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    repeated_problem_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    suggested_symbol: Mapped[str | None] = mapped_column(String(3))
    suggested_level: Mapped[str | None] = mapped_column(String(2))
    ai_suggested_level: Mapped[str | None] = mapped_column(String(2))
    ai_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_analysis_stale: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    suggested_bonus: Mapped[int | None] = mapped_column(Integer)
    final_symbol: Mapped[str | None] = mapped_column(String(3))
    final_level: Mapped[str | None] = mapped_column(String(2))
    final_bonus: Mapped[int | None] = mapped_column(Integer)
    auto_narrative: Mapped[str | None] = mapped_column(Text)
    manager_comment: Mapped[str | None] = mapped_column(Text)
    override_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RealizationDepartmentResult(Base):
    __tablename__ = "realization_department_results"
    __table_args__ = (
        UniqueConstraint("period_id", "department_id", name="uq_realization_department_result"),
        CheckConstraint(
            "a_plus_count >= 0 AND a_count >= 0 AND b_count >= 0 AND c_count >= 0 "
            "AND m_count >= 0 AND d_count >= 0 AND e_count >= 0 "
            "AND proposal_count >= 0 AND time_saved_minutes >= 0 "
            "AND repeated_problem_count >= 0",
            name="ck_realization_department_nonnegative_facts",
        ),
        CheckConstraint(
            "(a_rate IS NULL OR (a_rate >= 0 AND a_rate <= 100)) "
            "AND (trend_percent IS NULL OR (trend_percent >= -100 AND trend_percent <= 100)) "
            "AND (average_bonus IS NULL OR average_bonus >= 0) "
            "AND (total_bonus IS NULL OR total_bonus >= 0)",
            name="ck_realization_department_metrics",
        ),
        Index("ix_realization_department_period", "period_id", "department_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realization_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    facts_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    a_plus_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    a_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    b_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    c_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    m_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    d_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    e_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    a_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    total_bonus: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    average_bonus: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    proposal_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    time_saved_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    repeated_problem_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    trend_percent: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    department_suggestion: Mapped[str | None] = mapped_column(Text)
    final_comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RealizationQuestionAnswer(Base):
    """Append-only manager answer history for formal weekly questions."""

    __tablename__ = "realization_question_answers"
    __table_args__ = (
        CheckConstraint(
            "NULLIF(BTRIM(question_key), '') IS NOT NULL",
            name="ck_realization_question_answer_key",
        ),
        Index(
            "ix_realization_question_answer_latest",
            "result_id",
            "question_key",
            "answered_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realization_periods.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realization_person_results.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    question_key: Mapped[str] = mapped_column(String(80), nullable=False)
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    evidence_ids_json: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    answered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    supersedes_answer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realization_question_answers.id", ondelete="RESTRICT"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RealizationDailyCloseEvent(Base):
    """Append-only personal close/reopen/correction history for a daily result."""

    __tablename__ = "realization_daily_close_events"
    __table_args__ = (
        CheckConstraint(
            f"action IN ({_values(RealizationDailyCloseAction)})",
            name="ck_realization_daily_close_action",
        ),
        CheckConstraint(
            f"mode IN ({_values(RealizationOperatingMode)})",
            name="ck_realization_daily_close_mode",
        ),
        CheckConstraint(
            f"suggested_pulse IN ({_values(RealizationPulse)})",
            name="ck_realization_daily_close_suggested_pulse",
        ),
        CheckConstraint(
            f"confirmed_pulse IS NULL OR confirmed_pulse IN ({_values(RealizationPulse)})",
            name="ck_realization_daily_close_confirmed_pulse",
        ),
        CheckConstraint(
            "action = 'CLOSE' OR NULLIF(BTRIM(reason), '') IS NOT NULL",
            name="ck_realization_daily_close_change_reason",
        ),
        CheckConstraint(
            "mode = 'AUTO' OR confirmed_pulse IS NOT NULL",
            name="ck_realization_daily_close_confirmation",
        ),
        CheckConstraint(
            "confirmed_pulse IS NULL OR confirmed_pulse = suggested_pulse "
            "OR NULLIF(BTRIM(reason), '') IS NOT NULL",
            name="ck_realization_daily_close_override_reason",
        ),
        Index(
            "ix_realization_daily_close_latest",
            "period_id",
            "user_id",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realization_periods.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realization_person_results.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(10), nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    suggested_pulse: Mapped[str] = mapped_column(String(10), nullable=False)
    confirmed_pulse: Mapped[str | None] = mapped_column(String(10))
    daily_comment: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    facts_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    supersedes_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realization_daily_close_events.id", ondelete="RESTRICT")
    )
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RealizationDailyApprovalEvent(Base):
    """Append-only manager approval/revocation history for one person's day."""

    __tablename__ = "realization_daily_approval_events"
    __table_args__ = (
        CheckConstraint(
            "action IN ('APPROVE', 'REVOKE')",
            name="ck_realization_daily_approval_action",
        ),
        CheckConstraint(
            "action = 'APPROVE' OR NULLIF(BTRIM(reason), '') IS NOT NULL",
            name="ck_realization_daily_approval_revoke_reason",
        ),
        CheckConstraint(
            "action = 'REVOKE' OR source_close_event_id IS NOT NULL",
            name="ck_realization_daily_approval_close_source",
        ),
        Index(
            "ix_realization_daily_approval_latest",
            "period_id",
            "user_id",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realization_periods.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realization_person_results.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(10), nullable=False)
    source_close_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realization_daily_close_events.id", ondelete="RESTRICT"), index=True
    )
    approval_comment: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
