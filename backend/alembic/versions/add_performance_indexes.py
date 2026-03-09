"""add performance indexes for department queries

Revision ID: add_performance_indexes
Revises: ('9f2d1c8a7b6e', '0067_system_task_app_timezone_defaults')
Create Date: 2026-03-07 10:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "add_performance_indexes"
down_revision = ("9f2d1c8a7b6e", "0067_system_task_app_timezone_defaults")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # tasks.department_id — most impactful: every kanban query filters on this
    op.create_index(
        "ix_tasks_department_id",
        "tasks",
        ["department_id"],
        unique=False,
        postgresql_if_not_exists=True,
    )
    # tasks.(department_id, is_active) — the standard active-task-per-dept query
    op.create_index(
        "ix_tasks_department_id_is_active",
        "tasks",
        ["department_id", "is_active"],
        unique=False,
        postgresql_if_not_exists=True,
    )
    # tasks.assigned_to — user-filtered queries
    op.create_index(
        "ix_tasks_assigned_to",
        "tasks",
        ["assigned_to"],
        unique=False,
        postgresql_if_not_exists=True,
    )
    # tasks.status — include_done filtering
    op.create_index(
        "ix_tasks_status",
        "tasks",
        ["status"],
        unique=False,
        postgresql_if_not_exists=True,
    )
    # tasks.completed_at — DONE task age filtering
    op.create_index(
        "ix_tasks_completed_at",
        "tasks",
        ["completed_at"],
        unique=False,
        postgresql_if_not_exists=True,
    )
    # projects.department_id — every project list query filters on this
    op.create_index(
        "ix_projects_department_id",
        "projects",
        ["department_id"],
        unique=False,
        postgresql_if_not_exists=True,
    )
    # projects.(department_id, is_template, completed_at) — active non-template projects per dept
    op.create_index(
        "ix_projects_dept_template_completed",
        "projects",
        ["department_id", "is_template", "completed_at"],
        unique=False,
        postgresql_if_not_exists=True,
    )
    # system_task_templates.(scope, department_id, is_active) — template lookup queries
    op.create_index(
        "ix_stt_scope_dept_active",
        "system_task_templates",
        ["scope", "department_id", "is_active"],
        unique=False,
        postgresql_if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_stt_scope_dept_active", table_name="system_task_templates")
    op.drop_index("ix_projects_dept_template_completed", table_name="projects")
    op.drop_index("ix_projects_department_id", table_name="projects")
    op.drop_index("ix_tasks_completed_at", table_name="tasks")
    op.drop_index("ix_tasks_status", table_name="tasks")
    op.drop_index("ix_tasks_assigned_to", table_name="tasks")
    op.drop_index("ix_tasks_department_id_is_active", table_name="tasks")
    op.drop_index("ix_tasks_department_id", table_name="tasks")
