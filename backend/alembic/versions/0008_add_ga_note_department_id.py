"""add ga_notes department_id

Revision ID: 0008_add_ga_note_department_id
Revises: 0007_add_task_phase
Create Date: 2025-12-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0008_add_ga_note_department_id"
down_revision = "0007_add_task_phase"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ga_notes",
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_ga_notes_department_id_departments",
        "ga_notes",
        "departments",
        ["department_id"],
        ["id"],
    )
    op.execute(
        """
        UPDATE ga_notes
        SET department_id = projects.department_id
        FROM projects
        WHERE ga_notes.project_id = projects.id
          AND ga_notes.department_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_ga_notes_department_id_departments", "ga_notes", type_="foreignkey")
    op.drop_column("ga_notes", "department_id")
