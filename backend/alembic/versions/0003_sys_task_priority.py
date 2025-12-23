"""add priority to system task templates

Revision ID: 0003_sys_task_priority
Revises: 0002_system_task_templates
Create Date: 2025-12-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = "0003_sys_task_priority"
down_revision = "0002_system_task_templates"
branch_labels = None
depends_on = None


TASK_PRIORITY_VALUES = ("LOW", "MEDIUM", "HIGH", "URGENT")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"]: column for column in inspector.get_columns("system_task_templates")}

    task_priority_enum = postgresql.ENUM(*TASK_PRIORITY_VALUES, name="task_priority", create_type=False)
    task_priority_enum.create(bind, checkfirst=True)

    if "priority" not in columns:
        op.add_column(
            "system_task_templates",
            sa.Column("priority", task_priority_enum, nullable=True, server_default="MEDIUM"),
        )
    else:
        op.execute(
            "ALTER TABLE system_task_templates "
            "ALTER COLUMN priority TYPE task_priority "
            "USING priority::text::task_priority"
        )
        op.execute(
            "ALTER TABLE system_task_templates "
            "ALTER COLUMN priority SET DEFAULT 'MEDIUM'"
        )

    op.execute(
        "ALTER TABLE system_task_templates "
        "DROP CONSTRAINT IF EXISTS system_task_templates_priority_check"
    )
    op.create_check_constraint(
        "system_task_templates_priority_check",
        "system_task_templates",
        "priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')",
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE system_task_templates "
        "DROP CONSTRAINT IF EXISTS system_task_templates_priority_check"
    )
    op.execute(
        "ALTER TABLE system_task_templates "
        "ALTER COLUMN priority DROP DEFAULT"
    )
