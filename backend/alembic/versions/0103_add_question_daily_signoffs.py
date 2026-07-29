"""add question sign-offs that are active for their calendar day

Revision ID: 0103_question_daily_signoffs
Revises: 0102_merge_question_tasks
Create Date: 2026-07-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0103_question_daily_signoffs"
down_revision = "0102_merge_question_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "question_daily_signoffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["question_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("question_id", "user_id", name="uq_question_daily_signoff"),
    )
    op.create_index("ix_question_daily_signoffs_question_id", "question_daily_signoffs", ["question_id"])
    op.create_index("ix_question_daily_signoffs_user_id", "question_daily_signoffs", ["user_id"])
    op.create_index("ix_question_daily_signoffs_signed_at", "question_daily_signoffs", ["signed_at"])


def downgrade() -> None:
    op.drop_index("ix_question_daily_signoffs_signed_at", table_name="question_daily_signoffs")
    op.drop_index("ix_question_daily_signoffs_user_id", table_name="question_daily_signoffs")
    op.drop_index("ix_question_daily_signoffs_question_id", table_name="question_daily_signoffs")
    op.drop_table("question_daily_signoffs")
