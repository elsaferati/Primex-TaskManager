"""Link automatically paired external and internal meetings.

Revision ID: 20260824_paired_meetings
Revises: 20260824_ga_comment_lists
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260824_paired_meetings"
down_revision = "20260824_ga_comment_lists"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("paired_external_meeting_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_meetings_paired_external_meeting_id_meetings",
        "meetings",
        "meetings",
        ["paired_external_meeting_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_meetings_paired_external_meeting_id",
        "meetings",
        ["paired_external_meeting_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_meetings_paired_external_meeting_id", table_name="meetings")
    op.drop_constraint(
        "fk_meetings_paired_external_meeting_id_meetings",
        "meetings",
        type_="foreignkey",
    )
    op.drop_column("meetings", "paired_external_meeting_id")
