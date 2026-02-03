"""make internal note description nullable

Revision ID: 0053_make_internal_note_description_nullable
Revises: 0052_add_internal_note_department_project
Create Date: 2026-02-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0053_make_internal_note_description_nullable"
down_revision = "0052_add_internal_note_department_project"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("internal_notes", "description", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE internal_notes SET description = '' WHERE description IS NULL")
    op.alter_column("internal_notes", "description", existing_type=sa.String(), nullable=False)
