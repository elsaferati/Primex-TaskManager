"""add gd development template

Revision ID: 0073_add_gd_development_template
Revises: e1f4c8a7b2d9
Create Date: 2026-05-05
"""

import uuid

import sqlalchemy as sa
from alembic import op


revision = "0073_add_gd_development_template"
down_revision = "e1f4c8a7b2d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    department_ids = bind.execute(
        sa.text(
            """
            SELECT d.id
            FROM departments d
            WHERE d.name = 'Graphic Design'
              AND NOT EXISTS (
                  SELECT 1
                  FROM projects p
                  WHERE p.department_id = d.id
                    AND p.is_template = TRUE
                    AND p.project_type = 'GD_DEVELOPMENT'
              )
            """
        )
    ).scalars()

    for department_id in department_ids:
        bind.execute(
            sa.text(
                """
                INSERT INTO projects (
                    id,
                    title,
                    description,
                    department_id,
                    project_type,
                    current_phase,
                    status,
                    progress_percentage,
                    is_template
                ) VALUES (
                    :id,
                    :title,
                    :description,
                    :department_id,
                    :project_type,
                    :current_phase,
                    :status,
                    :progress_percentage,
                    :is_template
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "title": "DEV TEMPLATE",
                "description": "Graphic Design development-style template with phases: Meetings, Planning, Development, Testing, Documentation.",
                "department_id": str(department_id),
                "project_type": "GD_DEVELOPMENT",
                "current_phase": "MEETINGS",
                "status": "IN_PROGRESS",
                "progress_percentage": 0,
                "is_template": True,
            },
        )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM projects
        WHERE is_template = TRUE
          AND project_type = 'GD_DEVELOPMENT'
          AND title = 'DEV TEMPLATE'
        """
    )
