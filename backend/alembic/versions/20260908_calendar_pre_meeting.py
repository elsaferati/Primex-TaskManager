"""Restore the deployed calendar pre-meeting revision marker.

Revision ID: 0112_calendar_pre_meeting
Revises: 0111_meeting_categories

Some deployed databases were stamped with this revision, but its migration
file was not retained in the repository.  There is no corresponding model
change after ``0111_meeting_categories``, so this compatibility revision is
intentionally schema-neutral.  Keeping the marker in the graph lets Alembic
recognize those databases while preserving a valid upgrade path for new ones.
"""


revision = "0112_calendar_pre_meeting"
down_revision = "0111_meeting_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
