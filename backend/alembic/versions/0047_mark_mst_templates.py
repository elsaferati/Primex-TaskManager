"""mark MST seed projects as templates

Revision ID: 0047_mark_mst_templates
Revises: 0046_project_planner_exclusions
Create Date: 2026-02-02
"""

from __future__ import annotations

from alembic import op


revision = "0047_mark_mst_templates"
down_revision = "0046_project_planner_exclusions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE projects
        SET is_template = TRUE
        WHERE title = 'MST'
          AND (project_type = 'MST' OR project_type IS NULL)
          AND department_id IN (
              SELECT id FROM departments WHERE code IN ('PCM', 'GD')
          )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE projects
        SET is_template = FALSE
        WHERE title = 'MST'
          AND (project_type = 'MST' OR project_type IS NULL)
          AND department_id IN (
              SELECT id FROM departments WHERE code IN ('PCM', 'GD')
          )
        """
    )
