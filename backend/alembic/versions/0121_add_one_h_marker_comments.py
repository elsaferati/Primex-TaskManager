"""Add optional comments to 1H symbols.

Revision ID: 0121_add_one_h_marker_comments
Revises: 0120_track_one_h_marker_author
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0121_add_one_h_marker_comments"
down_revision = "0120_track_one_h_marker_author"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("tasks", "ga_notes", "plan_notes"):
        op.add_column(table, sa.Column("one_h_marker_comment", sa.Text(), nullable=True))


def downgrade() -> None:
    for table in ("plan_notes", "ga_notes", "tasks"):
        op.drop_column(table, "one_h_marker_comment")
