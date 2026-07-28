"""add system task weekly planner visibility

Revision ID: 0097_system_task_weekly_planner
Revises: 0096_review_has_diamond
Create Date: 2026-07-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0097_system_task_weekly_planner"
down_revision = "0096_review_has_diamond"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "system_task_templates",
        sa.Column(
            "show_in_weekly_planner",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("system_task_templates", "show_in_weekly_planner")
