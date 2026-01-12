"""merge checklist and refactor

Revision ID: 0021_merge_checklist_and_refactor
Revises: 0020_enhance_checklist_items, refactor_phases_and_status
Create Date: 2025-01-15
"""

from __future__ import annotations

from alembic import op


revision = "0021_merge_checklist_and_refactor"
down_revision = ("0020_enhance_checklist_items", "refactor_phases_and_status")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is a merge migration - no schema changes needed
    pass


def downgrade() -> None:
    # This is a merge migration - no schema changes needed
    pass
