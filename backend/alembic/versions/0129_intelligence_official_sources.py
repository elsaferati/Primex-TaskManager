"""Add four monitored official news and funding sources.

Revision ID: 0129_intelligence_sources
Revises: 0128_intelligence_linkedin
"""

import json
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0129_intelligence_sources"
down_revision = "0128_intelligence_linkedin"
branch_labels = None
depends_on = None

SOURCES = [
    ("KIESA — Lajme", "https://kiesa.rks-gov.net/page.aspx?id=1,5", ["Business", "Grants", "Events"],
     "Identify Kosovo business announcements, grants and events. Only extract deadlines or amounts stated on the page."),
    ("KIESA — Shpallje", "https://kiesa.rks-gov.net/page.aspx?id=1,134", ["Grants", "Funding", "Events"],
     "Prioritize open calls and deadlines. Distinguish a new call from a beneficiary list or an expired announcement."),
    ("EU Digital — Funding", "https://digital-strategy.ec.europa.eu/en/funding", ["Grants", "Funding", "Technology"],
     "Identify funding calls potentially relevant to Kosovo technology companies. Do not assume Kosovo eligibility."),
    ("EU Digital — News", "https://digital-strategy.ec.europa.eu/en/news", ["Technology", "Regulations", "Business"],
     "Focus on digital policy, AI and technology changes that may affect businesses in Kosovo or the EU."),
]


def upgrade() -> None:
    connection = op.get_bind()
    statement = sa.text("""
        INSERT INTO intelligence_sources
            (id, name, url, type, status, priority, categories, ai_instructions, fetch_interval_minutes)
        SELECT CAST(:id AS uuid), :name, :url, 'WEBSITE', 'ACTIVE', 'NORMAL',
               CAST(:categories AS jsonb), :instructions, 60
        WHERE NOT EXISTS (SELECT 1 FROM intelligence_sources WHERE url = :url)
    """)
    for name, url, categories, instructions in SOURCES:
        connection.execute(statement, {
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, url)), "name": name, "url": url,
            "categories": json.dumps(categories), "instructions": instructions,
        })


def downgrade() -> None:
    # Preserve articles and user bookmarks collected from these sources.
    pass
