"""Allow legacy and manual participant rows to coexist.

Revision ID: 0126_meeting_participant_source_unique
Revises: 0125_meeting_reminders
"""

from alembic import op


revision = "0126_meeting_participant_source_unique"
down_revision = "0125_meeting_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_meeting_participant", "meeting_participants", type_="unique")
    op.create_unique_constraint(
        op.f("uq_meeting_participants_meeting_participant_source"),
        "meeting_participants",
        ["meeting_id", "user_id", "assignment_source"],
    )


def downgrade() -> None:
    # Remove manual duplicates of preserved legacy rows before restoring the
    # historical two-column uniqueness rule.
    op.execute(
        """
        DELETE FROM meeting_participants AS legacy
        USING meeting_participants AS manual
        WHERE legacy.meeting_id = manual.meeting_id
          AND legacy.user_id = manual.user_id
          AND legacy.assignment_source = 'calendar_legacy'
          AND manual.assignment_source = 'manual'
        """
    )
    op.drop_constraint(
        op.f("uq_meeting_participants_meeting_participant_source"),
        "meeting_participants",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_meeting_participant",
        "meeting_participants",
        ["meeting_id", "user_id"],
    )
