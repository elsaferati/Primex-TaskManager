"""merge heads

Revision ID: 0010_merge_heads
Revises: 0007_task_assignees, 0009_add_task_is_active
Create Date: 2025-12-24
"""

from __future__ import annotations


revision = "0010_merge_heads"
down_revision = ("0007_task_assignees", "0009_add_task_is_active")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
