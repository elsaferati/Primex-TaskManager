"""Seed an official EU trade RSS feed to exercise the generic collector.

Revision ID: 0131_intelligence_rss
Revises: 0130_retry_eu_news
"""

import json
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0131_intelligence_rss"
down_revision = "0130_retry_eu_news"
branch_labels = None
depends_on = None

FEED_URL = "https://policy.trade.ec.europa.eu/node/2/rss_en"


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        INSERT INTO intelligence_sources
            (id, name, url, type, status, priority, categories, ai_instructions, fetch_interval_minutes)
        SELECT CAST(:id AS uuid), :name, :url, 'RSS', 'ACTIVE', 'NORMAL',
               CAST(:categories AS jsonb), :instructions, 60
        WHERE NOT EXISTS (SELECT 1 FROM intelligence_sources WHERE url = :url)
    """), {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, FEED_URL)),
        "name": "EU Trade — News",
        "url": FEED_URL,
        "categories": json.dumps(["Business", "Tenders", "Regulations"]),
        "instructions": "Highlight EU trade policy, tenders, and business changes potentially relevant to Kosovo. Do not assume eligibility or invent deadlines.",
    })


def downgrade() -> None:
    # Keep collected articles and any user reading/bookmark state.
    pass
