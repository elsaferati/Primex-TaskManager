"""add plan note comment

Revision ID: 0082_add_plan_note_comment
Revises: 0081_add_user_weekly_planner_hidden
Create Date: 2026-06-09 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0082_add_plan_note_comment"
down_revision = "0081_add_user_weekly_planner_hidden"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plan_notes", sa.Column("comment", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("plan_notes", "comment")
