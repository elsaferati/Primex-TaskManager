"""move Development tasks out of Meetings

Revision ID: 0093_dev_tasks_planning
Revises: 0092_reconcile_ga_tasks
Create Date: 2026-07-22
"""

from __future__ import annotations

from alembic import op


revision = "0093_dev_tasks_planning"
down_revision = "0092_reconcile_ga_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tasks AS task
        SET phase = 'PLANNING'
        FROM projects AS project, departments AS department
        WHERE task.project_id = project.id
          AND project.department_id = department.id
          AND task.phase = 'MEETINGS'
          AND (
              UPPER(TRIM(COALESCE(department.code, ''))) = 'DEV'
              OR UPPER(TRIM(COALESCE(department.name, ''))) = 'DEVELOPMENT'
          )
        """
    )


def downgrade() -> None:
    # This is a data repair; the former hidden phase cannot be inferred safely.
    pass
