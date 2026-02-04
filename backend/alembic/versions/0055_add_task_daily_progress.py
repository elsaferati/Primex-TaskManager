"""add task daily progress

Revision ID: 0055_add_task_daily_progress
Revises: 0054_add_internal_note_done_fields
Create Date: 2026-02-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0055_add_task_daily_progress"
down_revision = "57e9452f55a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_daily_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_date", sa.Date(), nullable=False),
        sa.Column("completed_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_delta", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("daily_status", sa.String(length=50), nullable=False, server_default="TODO"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_task_daily_progress_task_id", "task_daily_progress", ["task_id"])
    op.create_index("ix_task_daily_progress_day_date", "task_daily_progress", ["day_date"])
    op.create_unique_constraint(
        "uq_task_daily_progress_task_id_day_date",
        "task_daily_progress",
        ["task_id", "day_date"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_task_daily_progress_task_id_day_date",
        "task_daily_progress",
        type_="unique",
    )
    op.drop_index("ix_task_daily_progress_day_date", table_name="task_daily_progress")
    op.drop_index("ix_task_daily_progress_task_id", table_name="task_daily_progress")
    op.drop_table("task_daily_progress")
