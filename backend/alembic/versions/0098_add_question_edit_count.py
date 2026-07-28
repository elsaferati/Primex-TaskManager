"""add question edit count

Revision ID: 0098_question_edit_count
Revises: 0097_system_task_weekly_planner
Create Date: 2026-07-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0098_question_edit_count"
down_revision = "0097_system_task_weekly_planner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "question_definitions",
        sa.Column("edit_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("question_definitions", "edit_count")
