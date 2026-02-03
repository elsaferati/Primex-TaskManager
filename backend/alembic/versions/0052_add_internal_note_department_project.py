"""add department and project to internal notes

Revision ID: 0052_add_internal_note_department_project
Revises: 0051_add_internal_notes
Create Date: 2026-02-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0052_add_internal_note_department_project"
down_revision = "0051_add_internal_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("internal_notes", sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("internal_notes", sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.execute("UPDATE internal_notes SET department_id = to_department_id")
    op.alter_column("internal_notes", "department_id", nullable=False)

    op.create_foreign_key(
        "fk_internal_notes_department_id",
        "internal_notes",
        "departments",
        ["department_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_internal_notes_project_id",
        "internal_notes",
        "projects",
        ["project_id"],
        ["id"],
    )
    op.create_index("ix_internal_notes_department_id", "internal_notes", ["department_id"])
    op.create_index("ix_internal_notes_project_id", "internal_notes", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_internal_notes_project_id", table_name="internal_notes")
    op.drop_index("ix_internal_notes_department_id", table_name="internal_notes")
    op.drop_constraint("fk_internal_notes_project_id", "internal_notes", type_="foreignkey")
    op.drop_constraint("fk_internal_notes_department_id", "internal_notes", type_="foreignkey")
    op.drop_column("internal_notes", "project_id")
    op.drop_column("internal_notes", "department_id")
