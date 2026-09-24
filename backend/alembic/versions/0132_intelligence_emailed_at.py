"""Remember when a user emails an Intelligence item.

Revision ID: 0132_intelligence_email
Revises: 0131_intelligence_rss
"""

from alembic import op
import sqlalchemy as sa

revision = "0132_intelligence_email"
down_revision = "0131_intelligence_rss"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("intelligence_user_states", sa.Column("emailed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("intelligence_user_states", "emailed_at")
