"""add meeting url, recurrence, and participants

Revision ID: 0043_add_meeting_url_recurrence_participants
Revises: 0042_add_system_task_template_alignment_users
Create Date: 2026-01-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0043_add_meeting_url_recurrence_participants"
down_revision = "0042_add_system_task_template_alignment_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add meeting_url column
    op.add_column("meetings", sa.Column("meeting_url", sa.String(length=500), nullable=True))
    
    # Add recurrence fields
    op.add_column("meetings", sa.Column("recurrence_type", sa.String(length=20), nullable=True))
    op.add_column("meetings", sa.Column("recurrence_days_of_week", postgresql.ARRAY(sa.Integer()), nullable=True))
    op.add_column("meetings", sa.Column("recurrence_days_of_month", postgresql.ARRAY(sa.Integer()), nullable=True))
    
    # Create meeting_participants table
    op.create_table(
        "meeting_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("meeting_id", "user_id", name="uq_meeting_participant"),
    )
    op.create_index("ix_meeting_participants_meeting_id", "meeting_participants", ["meeting_id"])
    op.create_index("ix_meeting_participants_user_id", "meeting_participants", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_meeting_participants_user_id", table_name="meeting_participants")
    op.drop_index("ix_meeting_participants_meeting_id", table_name="meeting_participants")
    op.drop_table("meeting_participants")
    op.drop_column("meetings", "recurrence_days_of_month")
    op.drop_column("meetings", "recurrence_days_of_week")
    op.drop_column("meetings", "recurrence_type")
    op.drop_column("meetings", "meeting_url")
