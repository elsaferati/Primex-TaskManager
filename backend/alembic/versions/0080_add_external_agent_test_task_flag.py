"""add external agent test task opt-in flag

Revision ID: 0080_add_external_agent_test_task_flag
Revises: 0079_add_daily_progress_finish_period
Create Date: 2026-06-08 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0080_add_external_agent_test_task_flag"
down_revision = "0079_add_daily_progress_finish_period"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column(
            "external_agent_test_task_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("meetings", "external_agent_test_task_requested")
