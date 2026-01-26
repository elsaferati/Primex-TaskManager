"""placeholder revision to match existing DB state

Revision ID: 0039_system_task_occurrences
Revises: 0038_add_external_meeting_link_item
Create Date: 2026-01-22
"""

from __future__ import annotations


revision = "0039_system_task_occurrences"
down_revision = "0038_add_external_meeting_link_item"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This file exists to align Alembic history with databases that already point to
    # revision '0039_system_task_occurrences'. The actual changes are introduced in the
    # next revision.
    pass


def downgrade() -> None:
    pass

