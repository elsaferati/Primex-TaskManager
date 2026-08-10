"""track individual task checklist strike events for 1H reports

Revision ID: 20260810_add_task_strike_events
Revises: 20260810_add_realization_pulse
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260810_add_task_strike_events"
down_revision = "20260810_add_realization_pulse"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_strike_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("point_key", sa.String(length=64), nullable=False),
        sa.Column("point_text", sa.Text(), nullable=False),
        sa.Column("action", sa.String(length=12), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_task_strike_events_task_id", "task_strike_events", ["task_id"])
    op.create_index("ix_task_strike_events_actor_user_id", "task_strike_events", ["actor_user_id"])
    op.create_index("ix_task_strike_events_point_key", "task_strike_events", ["point_key"])
    op.create_index("ix_task_strike_events_occurred_at", "task_strike_events", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("task_strike_events")
