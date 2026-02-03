"""add done status to internal notes

Revision ID: 0054_add_internal_note_done_fields
Revises: 0053_make_internal_note_description_nullable
Create Date: 2026-02-03
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0054_add_internal_note_done_fields"
down_revision = "0053_make_internal_note_description_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "internal_notes",
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("internal_notes", sa.Column("done_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "internal_notes",
        sa.Column("done_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_internal_notes_done_by_user_id",
        "internal_notes",
        "users",
        ["done_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_internal_notes_done_by_user_id", "internal_notes", type_="foreignkey")
    op.drop_column("internal_notes", "done_by_user_id")
    op.drop_column("internal_notes", "done_at")
    op.drop_column("internal_notes", "is_done")
