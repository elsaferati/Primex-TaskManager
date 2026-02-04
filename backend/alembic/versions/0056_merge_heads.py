"""merge multiple heads (ga department + daily progress)

Revision ID: 0056_merge_heads
Revises: 0051_add_ga_department, 0055_add_task_daily_progress
Create Date: 2026-02-04
"""

from __future__ import annotations

from alembic import op


revision = "0056_merge_heads"
down_revision = ("0051_add_ga_department", "0055_add_task_daily_progress")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge revision: no schema changes.
    pass


def downgrade() -> None:
    # Merge revision: no schema changes.
    pass

