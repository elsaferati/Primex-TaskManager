"""add meeting_type to meetings

Revision ID: 0059_add_meeting_type
Revises: 6abe5fa77fac
Create Date: 2026-02-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0059_add_meeting_type"
down_revision = "6abe5fa77fac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("meeting_type", sa.String(length=20), nullable=False, server_default=sa.text("'external'")),
    )
    op.execute("UPDATE meetings SET meeting_type = 'external' WHERE meeting_type IS NULL")


def downgrade() -> None:
    op.drop_column("meetings", "meeting_type")
