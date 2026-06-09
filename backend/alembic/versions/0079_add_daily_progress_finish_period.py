"""add daily progress finish period snapshot

Revision ID: 0079_add_daily_progress_finish_period
Revises: 0078_add_ga_note_updated_at_order
Create Date: 2026-06-05 00:00:00.000000

"""
from __future__ import annotations

from alembic import op


revision = "0079_add_daily_progress_finish_period"
down_revision = "0078_add_ga_note_updated_at_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE task_daily_progress ADD COLUMN IF NOT EXISTS finish_period VARCHAR(50)")


def downgrade() -> None:
    op.execute("ALTER TABLE task_daily_progress DROP COLUMN IF EXISTS finish_period")
