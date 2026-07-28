"""add question edit history

Revision ID: 0099_question_edit_history
Revises: 0098_question_edit_count
Create Date: 2026-07-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0099_question_edit_history"
down_revision = "0098_question_edit_count"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "question_edit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_full_name", sa.String(length=100), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["question_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_question_edit_events_question_id", "question_edit_events", ["question_id"])
    op.create_index("ix_question_edit_events_user_id", "question_edit_events", ["user_id"])
    op.create_index("ix_question_edit_events_edited_at", "question_edit_events", ["edited_at"])


def downgrade() -> None:
    op.drop_index("ix_question_edit_events_edited_at", table_name="question_edit_events")
    op.drop_index("ix_question_edit_events_user_id", table_name="question_edit_events")
    op.drop_index("ix_question_edit_events_question_id", table_name="question_edit_events")
    op.drop_table("question_edit_events")
