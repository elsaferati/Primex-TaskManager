"""Store Outlook categories for imported calendar meetings.

Revision ID: 0111_meeting_categories
Revises: 20260904_merge_meeting_heads
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0111_meeting_categories"
down_revision = "20260904_merge_meeting_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("meetings")}
    if "calendar_categories" not in columns:
        op.add_column(
            "meetings",
            sa.Column("calendar_categories", postgresql.ARRAY(sa.String()), nullable=True),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("meetings")}
    if "calendar_categories" in columns:
        op.drop_column("meetings", "calendar_categories")
