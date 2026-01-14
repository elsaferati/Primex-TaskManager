"""add entry_date to common_entries

Revision ID: 0032_add_entry_date_common
Revises: 0031_add_project_is_template
Create Date: 2026-01-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0032_add_entry_date_common"
down_revision = "0031_add_project_is_template"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("common_entries", sa.Column("entry_date", sa.Date, nullable=True, index=True))


def downgrade() -> None:
    op.drop_column("common_entries", "entry_date")
