"""Store manual Open Tasks planning baselines.

Revision ID: 0113_open_task_baselines
Revises: 0112_calendar_pre_meeting
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0113_open_task_baselines"
down_revision = "0112_calendar_pre_meeting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "open_task_planning_baselines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("planning_week_start", sa.Date(), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("when_value", sa.String(length=20), nullable=True),
        sa.Column("status_value", sa.String(length=20), nullable=True),
        sa.Column("comment_value", sa.Text(), nullable=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "planning_week_start",
            "task_id",
            name="uq_open_task_planning_baseline_week_task",
        ),
    )
    op.create_index(
        "ix_open_task_planning_baselines_planning_week_start",
        "open_task_planning_baselines",
        ["planning_week_start"],
    )
    op.create_index(
        "ix_open_task_planning_baselines_task_id",
        "open_task_planning_baselines",
        ["task_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_open_task_planning_baselines_task_id",
        table_name="open_task_planning_baselines",
    )
    op.drop_index(
        "ix_open_task_planning_baselines_planning_week_start",
        table_name="open_task_planning_baselines",
    )
    op.drop_table("open_task_planning_baselines")
