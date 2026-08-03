"""meeting status blank default

Revision ID: 20260803_meeting_status_blank_default
Revises: 20260803_add_meetings_report_settings
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa


revision = "20260803_meeting_status_blank_default"
down_revision = "20260803_add_meetings_report_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE meeting_occurrence_statuses SET status = '' WHERE status = 'planned'")
    op.alter_column("meeting_occurrence_statuses", "status", server_default="")


def downgrade() -> None:
    op.execute("UPDATE meeting_occurrence_statuses SET status = 'planned' WHERE status = ''")
    op.alter_column("meeting_occurrence_statuses", "status", server_default="planned")
