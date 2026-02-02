"""add weekly planner legend entries

Revision ID: 0050_add_weekly_planner_legend_entries
Revises: 0049_add_project_phase_checklist_items
Create Date: 2026-02-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0050_add_weekly_planner_legend_entries"
down_revision = "0049_add_project_phase_checklist_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weekly_planner_legend_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=False),
        sa.Column("question_text", sa.String(length=1000), nullable=False),
        sa.Column("answer_text", sa.String(length=500), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_weekly_planner_legend_entries_department_id",
        "weekly_planner_legend_entries",
        ["department_id"],
    )
    op.create_index(
        "ix_weekly_planner_legend_entries_week_start_date",
        "weekly_planner_legend_entries",
        ["week_start_date"],
    )
    op.create_unique_constraint(
        "uq_legend_dept_week_key",
        "weekly_planner_legend_entries",
        ["department_id", "week_start_date", "key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_legend_dept_week_key", "weekly_planner_legend_entries", type_="unique")
    op.drop_index("ix_weekly_planner_legend_entries_week_start_date", table_name="weekly_planner_legend_entries")
    op.drop_index("ix_weekly_planner_legend_entries_department_id", table_name="weekly_planner_legend_entries")
    op.drop_table("weekly_planner_legend_entries")
