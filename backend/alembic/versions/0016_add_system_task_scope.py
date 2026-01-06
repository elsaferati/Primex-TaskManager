"""add system task scope

Revision ID: 0016_add_system_task_scope
Revises: 0015_task_priority_normal_high
Create Date: 2026-01-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0016_add_system_task_scope"
down_revision = "0015_task_priority_normal_high"
branch_labels = None
depends_on = None


def upgrade() -> None:
    scope_enum = postgresql.ENUM(
        "ALL",
        "DEPARTMENT",
        "GA",
        name="system_task_scope",
        create_type=False,
    )
    scope_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "system_task_templates",
        sa.Column("scope", scope_enum, nullable=True, server_default="ALL"),
    )

    op.execute(
        "UPDATE system_task_templates "
        "SET scope = 'DEPARTMENT' "
        "WHERE department_id IS NOT NULL"
    )
    op.execute(
        "UPDATE system_task_templates "
        "SET scope = 'ALL' "
        "WHERE scope IS NULL"
    )

    op.alter_column(
        "system_task_templates",
        "scope",
        nullable=False,
        server_default="ALL",
    )
    op.create_index("ix_system_task_templates_scope", "system_task_templates", ["scope"])


def downgrade() -> None:
    op.drop_index("ix_system_task_templates_scope", table_name="system_task_templates")
    op.drop_column("system_task_templates", "scope")
    scope_enum = postgresql.ENUM(
        "ALL",
        "DEPARTMENT",
        "GA",
        name="system_task_scope",
        create_type=False,
    )
    scope_enum.drop(op.get_bind(), checkfirst=True)
