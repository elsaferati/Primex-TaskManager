"""
Revision ID: 0069_create_external_platform_links
Revises: e1f4c8a7b2d9
Create Date: 2026-04-02 00:00:00.000000
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0069_create_external_platform_links"
down_revision = "e1f4c8a7b2d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_platform_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("href", sa.String(length=1000), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_external_platform_links_is_active"), "external_platform_links", ["is_active"], unique=False)
    op.create_index(op.f("ix_external_platform_links_sort_order"), "external_platform_links", ["sort_order"], unique=False)

    links_table = sa.table(
        "external_platform_links",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("label", sa.String(length=120)),
        sa.column("href", sa.String(length=1000)),
        sa.column("description", sa.String(length=500)),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        links_table,
        [
            {
                "id": uuid.uuid4(),
                "label": "Passguard",
                "href": "https://passguard.primexeu.com/",
                "description": "VaultGuard Dashboard",
                "sort_order": 0,
                "is_active": True,
            }
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_external_platform_links_sort_order"), table_name="external_platform_links")
    op.drop_index(op.f("ix_external_platform_links_is_active"), table_name="external_platform_links")
    op.drop_table("external_platform_links")
