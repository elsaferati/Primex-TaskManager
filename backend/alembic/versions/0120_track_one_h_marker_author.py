"""Track whether a 1H symbol was last set by GA.

Revision ID: 0120_track_one_h_marker_author
Revises: 0119_date_task_symbols
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0120_track_one_h_marker_author"
down_revision = "0119_date_task_symbols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("tasks", "ga_notes", "plan_notes"):
        op.add_column(
            table,
            sa.Column("one_h_marker_by_ga", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    for table in ("plan_notes", "ga_notes", "tasks"):
        op.drop_column(table, "one_h_marker_by_ga")
