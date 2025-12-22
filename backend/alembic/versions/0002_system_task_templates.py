"""add system task templates table

Revision ID: 0002_system_task_templates
Revises: 0001_initial
Create Date: 2025-12-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0002_system_task_templates"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    frequency_type_enum = postgresql.ENUM(
        "DAILY",
        "WEEKLY",
        "MONTHLY",
        "YEARLY",
        "3_MONTHS",
        "6_MONTHS",
        name="frequency_type",
        create_type=False,
    )
    frequency_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "system_task_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("default_assignee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("frequency", frequency_type_enum, nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("month_of_year", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["default_assignee_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_system_task_templates_department_id", "system_task_templates", ["department_id"])
    op.create_index("ix_system_task_templates_default_assignee_id", "system_task_templates", ["default_assignee_id"])


def downgrade() -> None:
    op.drop_index("ix_system_task_templates_default_assignee_id", table_name="system_task_templates")
    op.drop_index("ix_system_task_templates_department_id", table_name="system_task_templates")
    op.drop_table("system_task_templates")
    frequency_type_enum = postgresql.ENUM(
        "DAILY",
        "WEEKLY",
        "MONTHLY",
        "YEARLY",
        "3_MONTHS",
        "6_MONTHS",
        name="frequency_type",
        create_type=False,
    )
    frequency_type_enum.drop(op.get_bind(), checkfirst=True)
