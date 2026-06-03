"""add ga note updated_at ordering support

Revision ID: 0078_add_ga_note_updated_at_order
Revises: 0077_meeting_triggered_system_tasks
Create Date: 2026-06-03 00:00:00.000000

"""
from __future__ import annotations

from alembic import op


revision = "0078_add_ga_note_updated_at_order"
down_revision = "0077_meeting_triggered_system_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE ga_notes "
        "ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ga_notes_updated_at ON ga_notes (updated_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_ga_notes_updated_at")
    op.execute("ALTER TABLE ga_notes DROP COLUMN IF EXISTS updated_at")
