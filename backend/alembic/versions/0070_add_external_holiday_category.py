"""
Revision ID: 0070_add_external_holiday_category
Revises: 0069_create_external_platform_links
Create Date: 2026-04-03 00:00:00.000000
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0070_add_external_holiday_category"
down_revision = "0069_create_external_platform_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE common_category ADD VALUE IF NOT EXISTS 'External Holiday'")


def downgrade() -> None:
    pass
