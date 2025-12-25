"""add tasks is_active

Revision ID: 0009_add_task_is_active
Revises: 0008_add_ga_note_department_id
Create Date: 2025-12-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0009_add_task_is_active"
down_revision = "0008_add_ga_note_department_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.execute("UPDATE tasks SET is_active = true WHERE is_active IS NULL")


def downgrade() -> None:
    op.drop_column("tasks", "is_active")
