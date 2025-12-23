"""merge alembic heads

Revision ID: 0006_merge_heads
Revises: 0003_sys_task_priority, 0005_create_meetings
Create Date: 2025-12-23
"""

from __future__ import annotations


revision = "0006_merge_heads"
down_revision = ("0003_sys_task_priority", "0005_create_meetings")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
