"""Add a shared marker for 1H tasks.

Revision ID: 0115_add_task_one_h_marker
Revises: 0114_merge_0113_heads
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0115_add_task_one_h_marker"
down_revision = "0114_merge_0113_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("one_h_marker", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "one_h_marker")
