"""Link Microsoft TAK EXT meetings to an automatic preparation TAK INT.

Revision ID: 0112_calendar_pre_meeting
Revises: 0111_meeting_categories
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0112_calendar_pre_meeting"
down_revision = "0111_meeting_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("pre_external_meeting_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_meetings_pre_external_meeting_id_meetings",
        "meetings",
        "meetings",
        ["pre_external_meeting_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_meetings_pre_external_meeting_id",
        "meetings",
        ["pre_external_meeting_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_meetings_pre_external_meeting_id", table_name="meetings")
    op.drop_constraint(
        "fk_meetings_pre_external_meeting_id_meetings",
        "meetings",
        type_="foreignkey",
    )
    op.drop_column("meetings", "pre_external_meeting_id")
