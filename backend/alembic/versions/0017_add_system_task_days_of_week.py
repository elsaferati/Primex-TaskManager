"""add system task days of week

Revision ID: 0017_add_system_task_days_of_week
Revises: 0016_add_system_task_scope
Create Date: 2026-01-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0017_add_system_task_days_of_week"
down_revision = "0016_add_system_task_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "system_task_templates",
        sa.Column("days_of_week", postgresql.ARRAY(sa.Integer()), nullable=True),
    )
    op.execute(
        "UPDATE system_task_templates "
        "SET days_of_week = ARRAY[day_of_week] "
        "WHERE day_of_week IS NOT NULL"
    )
    op.create_index("ix_system_task_templates_days_of_week", "system_task_templates", ["days_of_week"], postgresql_using="gin")


def downgrade() -> None:
    op.drop_index("ix_system_task_templates_days_of_week", table_name="system_task_templates", postgresql_using="gin")
    op.drop_column("system_task_templates", "days_of_week")
