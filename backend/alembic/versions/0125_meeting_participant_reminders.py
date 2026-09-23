"""Add configurable reminders for manually assigned meeting participants.

Revision ID: 0125_meeting_reminders
Revises: 0124_one_h_print_snapshots
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0125_meeting_reminders"
down_revision = "0124_one_h_print_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meeting_participants",
        sa.Column("assignment_source", sa.String(length=32), nullable=False, server_default="manual"),
    )
    op.add_column(
        "meeting_participants",
        sa.Column(
            "assigned_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    # Preserve legacy rows while preventing calendar-derived attendees from
    # becoming reminder recipients. A user can explicitly reassign them later.
    op.execute(
        """
        UPDATE meeting_participants
        SET assignment_source = 'calendar_legacy'
        WHERE meeting_id IN (
            SELECT id FROM meetings WHERE calendar_imported IS TRUE
        )
        """
    )
    op.create_index(
        "ix_meeting_participants_assignment_source",
        "meeting_participants",
        ["assignment_source"],
    )
    op.create_check_constraint(
        op.f("ck_meeting_participants_meeting_participant_assignment_source"),
        "meeting_participants",
        "assignment_source IN ('manual', 'calendar_legacy')",
    )
    op.add_column(
        "meetings",
        sa.Column("reminder_minutes_before", sa.Integer(), nullable=True, server_default="15"),
    )
    op.create_table(
        "meeting_reminder_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "meeting_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meetings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("occurrence_starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("minutes_before", sa.Integer(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "meeting_id",
            "user_id",
            "occurrence_starts_at",
            "minutes_before",
            name="uq_meeting_reminder_delivery",
        ),
    )
    op.create_index("ix_meeting_reminder_deliveries_meeting_id", "meeting_reminder_deliveries", ["meeting_id"])
    op.create_index("ix_meeting_reminder_deliveries_user_id", "meeting_reminder_deliveries", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_meeting_reminder_deliveries_user_id", table_name="meeting_reminder_deliveries")
    op.drop_index("ix_meeting_reminder_deliveries_meeting_id", table_name="meeting_reminder_deliveries")
    op.drop_table("meeting_reminder_deliveries")
    op.drop_column("meetings", "reminder_minutes_before")
    op.drop_constraint(
        op.f("ck_meeting_participants_meeting_participant_assignment_source"),
        "meeting_participants",
        type_="check",
    )
    op.drop_index("ix_meeting_participants_assignment_source", table_name="meeting_participants")
    op.drop_column("meeting_participants", "assigned_by_user_id")
    op.drop_column("meeting_participants", "assignment_source")
