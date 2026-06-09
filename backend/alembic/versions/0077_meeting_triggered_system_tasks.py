"""add meeting-triggered system task fields

Revision ID: 0077_meeting_triggered_system_tasks
Revises: 0076_add_checklist_item_original
Create Date: 2026-06-02 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0077_meeting_triggered_system_tasks"
down_revision = "0076_add_checklist_item_original"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("system_task_templates", sa.Column("trigger_type", sa.String(length=50), nullable=True))
    op.create_index(
        op.f("ix_system_task_templates_trigger_type"),
        "system_task_templates",
        ["trigger_type"],
        unique=False,
    )

    op.add_column("tasks", sa.Column("meeting_origin_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("tasks", sa.Column("meeting_occurrence_date", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("meeting_system_task_kind", sa.String(length=50), nullable=True))
    op.create_foreign_key(
        "fk_tasks_meeting_origin_id_meetings",
        "tasks",
        "meetings",
        ["meeting_origin_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_tasks_meeting_origin_id"), "tasks", ["meeting_origin_id"], unique=False)
    op.create_index(op.f("ix_tasks_meeting_system_task_kind"), "tasks", ["meeting_system_task_kind"], unique=False)

    op.drop_index("uq_tasks_template_slot_origin_run", table_name="tasks")
    op.create_index(
        "uq_tasks_template_slot_origin_run",
        "tasks",
        ["system_template_origin_id", "system_task_slot_id", "origin_run_at"],
        unique=True,
        postgresql_where=sa.text("origin_run_at IS NOT NULL AND meeting_origin_id IS NULL"),
    )

    op.execute("DROP INDEX IF EXISTS uq_tasks_system_template_user_date")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_tasks_system_template_user_date
        ON tasks (system_template_origin_id, assigned_to, immutable_date(start_date))
        WHERE system_template_origin_id IS NOT NULL
          AND meeting_origin_id IS NULL
        """
    )
    op.create_index(
        "uq_tasks_meeting_system_task",
        "tasks",
        ["meeting_origin_id", "meeting_occurrence_date", "assigned_to", "meeting_system_task_kind"],
        unique=True,
        postgresql_where=sa.text("meeting_origin_id IS NOT NULL AND meeting_system_task_kind IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_tasks_meeting_system_task", table_name="tasks")
    op.drop_index("uq_tasks_template_slot_origin_run", table_name="tasks")
    op.create_index(
        "uq_tasks_template_slot_origin_run",
        "tasks",
        ["system_template_origin_id", "system_task_slot_id", "origin_run_at"],
        unique=True,
        postgresql_where=sa.text("origin_run_at IS NOT NULL"),
    )
    op.execute("DROP INDEX IF EXISTS uq_tasks_system_template_user_date")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_tasks_system_template_user_date
        ON tasks (system_template_origin_id, assigned_to, immutable_date(start_date))
        WHERE system_template_origin_id IS NOT NULL
        """
    )

    op.drop_index(op.f("ix_tasks_meeting_system_task_kind"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_meeting_origin_id"), table_name="tasks")
    op.drop_constraint("fk_tasks_meeting_origin_id_meetings", "tasks", type_="foreignkey")
    op.drop_column("tasks", "meeting_system_task_kind")
    op.drop_column("tasks", "meeting_occurrence_date")
    op.drop_column("tasks", "meeting_origin_id")

    op.drop_index(op.f("ix_system_task_templates_trigger_type"), table_name="system_task_templates")
    op.drop_column("system_task_templates", "trigger_type")
