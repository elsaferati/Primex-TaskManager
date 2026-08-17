"""Add manager approval history for each person's daily Realization.

Revision ID: 20260817_daily_approvals
Revises: 20260817_rlz_variants
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260817_daily_approvals"
down_revision = "20260817_rlz_variants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "realization_daily_approval_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("result_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("source_close_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approval_comment", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("action IN ('APPROVE', 'REVOKE')", name="ck_realization_daily_approval_action"),
        sa.CheckConstraint(
            "action = 'APPROVE' OR NULLIF(BTRIM(reason), '') IS NOT NULL",
            name="ck_realization_daily_approval_revoke_reason",
        ),
        sa.CheckConstraint(
            "action = 'REVOKE' OR source_close_event_id IS NOT NULL",
            name="ck_realization_daily_approval_close_source",
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["period_id"], ["realization_periods.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["result_id"], ["realization_person_results.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_close_event_id"], ["realization_daily_close_events.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("period_id", "result_id", "user_id", "department_id", "source_close_event_id", "actor_user_id"):
        op.create_index(f"ix_realization_daily_approval_events_{column}", "realization_daily_approval_events", [column])
    op.create_index(
        "ix_realization_daily_approval_latest",
        "realization_daily_approval_events",
        ["period_id", "user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("realization_daily_approval_events")
