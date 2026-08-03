"""add dashboard query indexes

Revision ID: 20260803_dashboard_query_indexes
Revises: 20260803_meeting_status_blank_default
Create Date: 2026-08-03

"""

from __future__ import annotations

from alembic import op


revision = "20260803_dashboard_query_indexes"
down_revision = "20260803_meeting_status_blank_default"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Department dashboard task list and its assignee-based department fallback.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_department_active_created "
        "ON tasks (department_id, is_active, created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_task_assignees_user_task "
        "ON task_assignees (user_id, task_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_department_active_id "
        "ON users (department_id, is_active, id)"
    )

    # GA/KA and PX JAV task batches are filtered by origin and active state.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_ga_note_active_created "
        "ON tasks (ga_note_origin_id, is_active, created_at) "
        "WHERE ga_note_origin_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_plan_note_active_created "
        "ON tasks (plan_note_origin_id, is_active, created_at) "
        "WHERE plan_note_origin_id IS NOT NULL"
    )

    # Note lists filter by department/project and immediately order by recency.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_ga_notes_department_updated_created "
        "ON ga_notes (department_id, updated_at DESC, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_ga_notes_project_updated_created "
        "ON ga_notes (project_id, updated_at DESC, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_plan_notes_department_created "
        "ON plan_notes (department_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_plan_notes_project_created "
        "ON plan_notes (project_id, created_at DESC)"
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_projects_department_template_created "
        "ON projects (department_id, is_template, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_projects_department_template_created")
    op.execute("DROP INDEX IF EXISTS ix_plan_notes_project_created")
    op.execute("DROP INDEX IF EXISTS ix_plan_notes_department_created")
    op.execute("DROP INDEX IF EXISTS ix_ga_notes_project_updated_created")
    op.execute("DROP INDEX IF EXISTS ix_ga_notes_department_updated_created")
    op.execute("DROP INDEX IF EXISTS ix_tasks_plan_note_active_created")
    op.execute("DROP INDEX IF EXISTS ix_tasks_ga_note_active_created")
    op.execute("DROP INDEX IF EXISTS ix_users_department_active_id")
    op.execute("DROP INDEX IF EXISTS ix_task_assignees_user_task")
    op.execute("DROP INDEX IF EXISTS ix_tasks_department_active_created")
