"""add user weekly planner hidden flag

Revision ID: 0081_add_user_weekly_planner_hidden
Revises: 0080_add_external_agent_test_task_flag
Create Date: 2026-06-08 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0081_add_user_weekly_planner_hidden"
down_revision = "0080_add_external_agent_test_task_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "weekly_planner_hidden",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "weekly_planner_hidden")
