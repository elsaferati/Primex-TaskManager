"""add ga note attachments

Revision ID: 0058_add_ga_note_attachments
Revises: 5a37ccaaf5a8
Create Date: 2026-02-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0058_add_ga_note_attachments"
down_revision = "5a37ccaaf5a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ga_note_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["ga_notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_ga_note_attachments_note_id", "ga_note_attachments", ["note_id"])


def downgrade() -> None:
    op.drop_index("ix_ga_note_attachments_note_id", table_name="ga_note_attachments")
    op.drop_table("ga_note_attachments")
