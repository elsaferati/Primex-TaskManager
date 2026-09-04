"""Add meeting scheduler rejection audit fields.

Revision ID: 20260904_meeting_improvements
Revises: 20260904_calendar_sync
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260904_meeting_improvements"
down_revision = "20260904_calendar_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"]
        for column in inspector.get_columns("meeting_schedule_requests")
    }
    if "rejection_reason" not in columns:
        op.add_column("meeting_schedule_requests", sa.Column("rejection_reason", sa.Text()))
    if "rejected_by_user_id" not in columns:
        op.add_column(
            "meeting_schedule_requests",
            sa.Column(
                "rejected_by_user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
        )
    if "rejected_at" not in columns:
        op.add_column(
            "meeting_schedule_requests",
            sa.Column("rejected_at", sa.DateTime(timezone=True)),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"]
        for column in inspector.get_columns("meeting_schedule_requests")
    }
    for column_name in ("rejected_at", "rejected_by_user_id", "rejection_reason"):
        if column_name in columns:
            op.drop_column("meeting_schedule_requests", column_name)
