"""add weekly planner snapshots

Revision ID: 0057_add_weekly_planner_snapshots
Revises: 0056_merge_heads
Create Date: 2026-02-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0057_add_weekly_planner_snapshots"
down_revision = "0056_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weekly_planner_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column("week_end_date", sa.Date(), nullable=False),
        sa.Column("snapshot_type", sa.String(length=20), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_weekly_planner_snapshots_lookup",
        "weekly_planner_snapshots",
        ["department_id", "week_start_date", "snapshot_type", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_weekly_planner_snapshots_lookup", table_name="weekly_planner_snapshots")
    op.drop_table("weekly_planner_snapshots")
