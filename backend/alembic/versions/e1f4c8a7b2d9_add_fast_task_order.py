"""add fast task order column

Revision ID: e1f4c8a7b2d9
Revises: 0068_simplify_system_task_slots, add_performance_indexes, d4c7f6b8a9c1
Create Date: 2026-03-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "e1f4c8a7b2d9"
down_revision = ("0068_simplify_system_task_slots", "add_performance_indexes", "d4c7f6b8a9c1")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("fast_task_order", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "fast_task_order")
