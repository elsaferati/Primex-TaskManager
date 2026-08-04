"""add indexes for authenticated shell and dashboard counts

Revision ID: 20260804_performance_hot_paths
Revises: 20260804_add_after_break_report
Create Date: 2026-08-04

"""

from __future__ import annotations

from alembic import op


revision = "20260804_performance_hot_paths"
down_revision = "20260804_add_after_break_report"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Both indexes are deliberately partial: they cover the two global count
    # queries without adding maintenance cost to completed or inactive tasks.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_open_active_count "
        "ON tasks (id) WHERE is_active IS TRUE AND status <> 'DONE'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_waiting_confirmation_active_assignee "
        "ON tasks (confirmation_assignee_id) "
        "WHERE is_active IS TRUE AND status = 'WAITING_CONFIRMATION'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tasks_waiting_confirmation_active_assignee")
    op.execute("DROP INDEX IF EXISTS ix_tasks_open_active_count")
