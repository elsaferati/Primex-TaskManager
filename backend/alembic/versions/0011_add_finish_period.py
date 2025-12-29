"""add finish period to system task templates and tasks

Revision ID: 0011_add_finish_period
Revises: 0010_merge_heads
Create Date: 2025-12-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0011_add_finish_period"
down_revision = "0010_merge_heads"
branch_labels = None
depends_on = None


FINISH_PERIOD_VALUES = ("AM", "PM")


def upgrade() -> None:
    bind = op.get_bind()
    finish_period_enum = postgresql.ENUM(*FINISH_PERIOD_VALUES, name="finish_period", create_type=False)
    finish_period_enum.create(bind, checkfirst=True)

    op.add_column("system_task_templates", sa.Column("finish_period", finish_period_enum, nullable=True))
    op.add_column("tasks", sa.Column("finish_period", finish_period_enum, nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "finish_period")
    op.drop_column("system_task_templates", "finish_period")

    bind = op.get_bind()
    finish_period_enum = postgresql.ENUM(*FINISH_PERIOD_VALUES, name="finish_period")
    finish_period_enum.drop(bind, checkfirst=True)
