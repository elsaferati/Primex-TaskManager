"""set task phase from project

Revision ID: 0026_set_task_phase_from_project
Revises: 0025_fix_vs_vl_task_phases
Create Date: 2025-02-01
"""

from __future__ import annotations

from alembic import op


revision = "0026_set_task_phase_from_project"
down_revision = "0025_fix_vs_vl_task_phases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tasks
        SET phase = projects.current_phase
        FROM projects
        WHERE tasks.project_id = projects.id
        """
    )


def downgrade() -> None:
    pass
