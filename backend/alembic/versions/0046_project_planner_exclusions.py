"""add project planner exclusions

Revision ID: 0046_project_planner_exclusions
Revises: 0045_task_planner_exclusions
Create Date: 2026-01-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0046_project_planner_exclusions"
down_revision = "0045_task_planner_exclusions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_planner_exclusions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_date", sa.Date(), nullable=False),
        sa.Column("time_slot", sa.String(length=10), nullable=False, server_default="ALL"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("project_id", "user_id", "day_date", "time_slot", name="uq_project_planner_exclusion"),
    )
    op.create_index(op.f("ix_project_planner_exclusions_project_id"), "project_planner_exclusions", ["project_id"], unique=False)
    op.create_index(op.f("ix_project_planner_exclusions_user_id"), "project_planner_exclusions", ["user_id"], unique=False)
    op.create_index(op.f("ix_project_planner_exclusions_day_date"), "project_planner_exclusions", ["day_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_project_planner_exclusions_day_date"), table_name="project_planner_exclusions")
    op.drop_index(op.f("ix_project_planner_exclusions_user_id"), table_name="project_planner_exclusions")
    op.drop_index(op.f("ix_project_planner_exclusions_project_id"), table_name="project_planner_exclusions")
    op.drop_table("project_planner_exclusions")
