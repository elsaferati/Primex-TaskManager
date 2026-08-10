"""separate title and description strike events

Revision ID: 20260810_add_task_strike_event_field
Revises: 20260810_add_task_strike_events
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa


revision = "20260810_add_task_strike_event_field"
down_revision = "20260810_add_task_strike_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "task_strike_events",
        sa.Column("field_name", sa.String(length=20), nullable=False, server_default="DESCRIPTION"),
    )


def downgrade() -> None:
    op.drop_column("task_strike_events", "field_name")
