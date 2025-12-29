"""add internal notes to system task templates and tasks

Revision ID: 0013_sys_task_notes
Revises: 0012_merge_heads
Create Date: 2025-12-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0013_sys_task_notes"
down_revision = "0012_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("system_task_templates", sa.Column("internal_notes", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("internal_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "internal_notes")
    op.drop_column("system_task_templates", "internal_notes")
