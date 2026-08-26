"""Add immutable Daily Realization operational baselines.

Revision ID: 20260826_daily_rlz_baseline
Revises: current repository heads
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260826_daily_rlz_baseline"
down_revision = (
    "20260826_merge_1h_pim_heads",
    "20260811_merge_realization_strike_heads",
    "20260810_add_task_strike_event_field",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_planner_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_date", sa.Date(), nullable=False),
        sa.Column("source_weekly_snapshot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("captured_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["captured_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_weekly_snapshot_id"], ["weekly_planner_snapshots.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("department_id", "day_date", name="uq_daily_planner_snapshot_department_day"),
    )
    op.create_index(
        "ix_daily_planner_snapshot_day_department",
        "daily_planner_snapshots",
        ["day_date", "department_id"],
    )
    op.execute("""
        CREATE FUNCTION reject_daily_planner_snapshot_mutation()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'daily planner snapshots are immutable';
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_daily_planner_snapshots_immutable
        BEFORE UPDATE OR DELETE ON daily_planner_snapshots
        FOR EACH ROW EXECUTE FUNCTION reject_daily_planner_snapshot_mutation()
    """)
    op.create_index(
        "ix_audit_logs_entity_timeline",
        "audit_logs",
        ["entity_type", "entity_id", "created_at"],
    )
    op.create_table(
        "daily_plan_adjustments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("audit_event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_date", sa.Date(), nullable=False),
        sa.Column("adjustment_type", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=10), server_default="PENDING", nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("decision_comment", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("adjustment_type IN ('POSTPONEMENT','REASSIGNMENT','REMOVAL')", name="ck_daily_plan_adjustment_type"),
        sa.CheckConstraint("status IN ('PENDING','APPROVED','REJECTED')", name="ck_daily_plan_adjustment_status"),
        sa.ForeignKeyConstraint(["audit_event_id"], ["audit_logs.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("audit_event_id", "user_id", name="uq_daily_plan_adjustment_event_user"),
    )
    op.create_index("ix_daily_plan_adjustments_task_id", "daily_plan_adjustments", ["task_id"])
    op.create_index("ix_daily_plan_adjustment_user_day", "daily_plan_adjustments", ["user_id", "day_date", "status"])


def downgrade() -> None:
    op.drop_table("daily_plan_adjustments")
    op.drop_index("ix_audit_logs_entity_timeline", table_name="audit_logs")
    op.execute("DROP TRIGGER trg_daily_planner_snapshots_immutable ON daily_planner_snapshots")
    op.execute("DROP FUNCTION reject_daily_planner_snapshot_mutation()")
    op.drop_index("ix_daily_planner_snapshot_day_department", table_name="daily_planner_snapshots")
    op.drop_table("daily_planner_snapshots")
