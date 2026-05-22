"""add checklist item original field

Revision ID: 0076_add_checklist_item_original
Revises: 0075_add_plan_notes
Create Date: 2026-05-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0076_add_checklist_item_original"
down_revision = "0075_add_plan_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checklist_items", sa.Column("original", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("checklist_items", "original")
