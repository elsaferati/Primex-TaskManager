"""Make task symbols follow the 16:00 workday rollover.

Revision ID: 0119_date_task_symbols
Revises: 0118_sync_note_task_markers
"""

from alembic import op
import sqlalchemy as sa


revision = "0119_date_task_symbols"
down_revision = "0118_sync_note_task_markers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("one_h_marker_date", sa.Date(), nullable=True))
    op.add_column("ga_notes", sa.Column("one_h_marker_date", sa.Date(), nullable=True))
    op.add_column("plan_notes", sa.Column("one_h_marker_date", sa.Date(), nullable=True))
    op.create_index("ix_tasks_one_h_marker_date", "tasks", ["one_h_marker_date"])
    # Preserve symbols present during deployment for the current workday. New
    # edits use the app's exact Europe/Tirane 16:00 rollover calculation.
    op.execute("UPDATE tasks SET one_h_marker_date = CURRENT_DATE WHERE one_h_marker IS NOT NULL")
    op.execute("UPDATE ga_notes SET one_h_marker_date = CURRENT_DATE WHERE one_h_marker IS NOT NULL")
    op.execute("UPDATE plan_notes SET one_h_marker_date = CURRENT_DATE WHERE one_h_marker IS NOT NULL")


def downgrade() -> None:
    op.drop_index("ix_tasks_one_h_marker_date", table_name="tasks")
    op.drop_column("plan_notes", "one_h_marker_date")
    op.drop_column("ga_notes", "one_h_marker_date")
    op.drop_column("tasks", "one_h_marker_date")
