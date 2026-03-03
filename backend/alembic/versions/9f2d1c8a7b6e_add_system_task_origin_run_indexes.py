"""add system task origin_run_at indexes

Revision ID: 9f2d1c8a7b6e
Revises: 0066_system_task_slot_refactor
Create Date: 2026-03-03 12:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9f2d1c8a7b6e"
down_revision = "0066_system_task_slot_refactor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_tasks_system_template_origin_origin_run_at",
        "tasks",
        ["system_template_origin_id", "origin_run_at"],
        unique=False,
        postgresql_where=sa.text("origin_run_at IS NOT NULL"),
    )
    op.create_index(
        "ix_tasks_assigned_origin_template",
        "tasks",
        ["assigned_to", "origin_run_at", "system_template_origin_id"],
        unique=False,
        postgresql_where=sa.text("system_template_origin_id IS NOT NULL AND origin_run_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_assigned_origin_template", table_name="tasks")
    op.drop_index("ix_tasks_system_template_origin_origin_run_at", table_name="tasks")

