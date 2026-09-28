"""Retry EU Digital News after adding the official-listing fallback.

Revision ID: 0130_retry_eu_news
Revises: 0129_intelligence_sources
"""

from alembic import op
import sqlalchemy as sa

revision = "0130_retry_eu_news"
down_revision = "0129_intelligence_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        UPDATE intelligence_sources
        SET last_started_at = NULL, last_error = NULL
        WHERE type = 'WEBSITE' AND status = 'ACTIVE'
          AND url = 'https://digital-strategy.ec.europa.eu/en/news'
    """))


def downgrade() -> None:
    # Do not restore a stale check timestamp after the retry.
    pass
