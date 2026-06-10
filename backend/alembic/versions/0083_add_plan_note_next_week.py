"""add plan note next week flag

Revision ID: 0083_add_plan_note_next_week
Revises: 0082_add_plan_note_comment
Create Date: 2026-06-09 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0083_add_plan_note_next_week"
down_revision = "0082_add_plan_note_comment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plan_notes",
        sa.Column("next_week", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("plan_notes", "next_week")
