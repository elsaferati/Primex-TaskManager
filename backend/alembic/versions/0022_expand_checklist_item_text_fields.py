"""expand checklist item text fields

Revision ID: 0022_expand_checklist_item_text_fields
Revises: 0021_merge_checklist_and_refactor
Create Date: 2025-02-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0022_expand_checklist_item_text_fields"
down_revision = "0021_merge_checklist_and_refactor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("checklist_items", "path", type_=sa.Text(), existing_type=sa.String(), existing_nullable=True)
    op.alter_column("checklist_items", "keyword", type_=sa.Text(), existing_type=sa.String(), existing_nullable=True)
    op.alter_column("checklist_items", "description", type_=sa.Text(), existing_type=sa.String(), existing_nullable=True)
    op.alter_column("checklist_items", "category", type_=sa.Text(), existing_type=sa.String(), existing_nullable=True)
    op.alter_column("checklist_items", "title", type_=sa.Text(), existing_type=sa.String(), existing_nullable=True)
    op.alter_column("checklist_items", "comment", type_=sa.Text(), existing_type=sa.String(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("checklist_items", "comment", type_=sa.String(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("checklist_items", "title", type_=sa.String(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("checklist_items", "category", type_=sa.String(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("checklist_items", "description", type_=sa.String(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("checklist_items", "keyword", type_=sa.String(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("checklist_items", "path", type_=sa.String(), existing_type=sa.Text(), existing_nullable=True)
