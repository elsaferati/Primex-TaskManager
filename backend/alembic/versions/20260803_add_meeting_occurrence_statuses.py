"""add meeting occurrence statuses

Revision ID: 20260803_add_meeting_occurrence_statuses
Revises: 20260803_add_meetings_report_drafts
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260803_add_meeting_occurrence_statuses"
down_revision = "20260803_add_meetings_report_drafts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meeting_occurrence_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("occurrence_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("checked_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("meeting_id", "occurrence_date", name="uq_meeting_occurrence_status_date"),
    )
    op.create_index("ix_meeting_occurrence_statuses_meeting_id", "meeting_occurrence_statuses", ["meeting_id"])
    op.create_index("ix_meeting_occurrence_statuses_occurrence_date", "meeting_occurrence_statuses", ["occurrence_date"])


def downgrade() -> None:
    op.drop_index("ix_meeting_occurrence_statuses_occurrence_date", table_name="meeting_occurrence_statuses")
    op.drop_index("ix_meeting_occurrence_statuses_meeting_id", table_name="meeting_occurrence_statuses")
    op.drop_table("meeting_occurrence_statuses")
