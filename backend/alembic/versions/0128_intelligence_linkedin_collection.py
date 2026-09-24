"""Track asynchronous collection of LinkedIn sources.

Revision ID: 0128_intelligence_linkedin
Revises: 0127_intelligence_module
"""

from alembic import op
import sqlalchemy as sa

revision = "0128_intelligence_linkedin"
down_revision = "0127_intelligence_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("intelligence_sources", sa.Column("last_started_at", sa.DateTime(timezone=True)))
    op.add_column("intelligence_sources", sa.Column("pending_snapshot_id", sa.String(80)))
    op.add_column("intelligence_sources", sa.Column("last_error", sa.String(500)))


def downgrade() -> None:
    op.drop_column("intelligence_sources", "last_error")
    op.drop_column("intelligence_sources", "pending_snapshot_id")
    op.drop_column("intelligence_sources", "last_started_at")
