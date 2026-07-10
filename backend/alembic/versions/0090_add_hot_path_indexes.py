"""add indexes for task, checklist, and notification hot paths

Revision ID: 0090_add_hot_path_indexes
Revises: 0089_add_ga_time_table_rows
Create Date: 2026-07-10

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0090_add_hot_path_indexes"
down_revision = "0089_add_ga_time_table_rows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_checklists_task_position_created",
        "checklists",
        ["task_id", "position", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_checklists_project_position_created",
        "checklists",
        ["project_id", "position", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_checklists_group_project",
        "checklists",
        ["group_key", "project_id"],
        unique=False,
    )
    op.create_index(
        "ix_checklist_items_checklist_position_id",
        "checklist_items",
        ["checklist_id", "position", "id"],
        unique=False,
    )
    op.create_index(
        "ix_tasks_project_active_created",
        "tasks",
        ["project_id", "is_active", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_notifications_user_created_at",
        "notifications",
        ["user_id", sa.text("created_at DESC")],
        unique=False,
    )
    op.create_index(
        "ix_notifications_user_unread_created_at",
        "notifications",
        ["user_id", sa.text("created_at DESC")],
        unique=False,
        postgresql_where=sa.text("read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_unread_created_at", table_name="notifications")
    op.drop_index("ix_notifications_user_created_at", table_name="notifications")
    op.drop_index("ix_tasks_project_active_created", table_name="tasks")
    op.drop_index("ix_checklist_items_checklist_position_id", table_name="checklist_items")
    op.drop_index("ix_checklists_group_project", table_name="checklists")
    op.drop_index("ix_checklists_project_position_created", table_name="checklists")
    op.drop_index("ix_checklists_task_position_created", table_name="checklists")
