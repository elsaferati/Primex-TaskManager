"""legacy baseline revision (compatibility)

This revision exists to support databases that already have an Alembic
version of `57e9452f55a2` stamped/applied from an older migration history.
It is treated as equivalent to the schema state after `0054_add_internal_note_done_fields`.

Revision ID: 57e9452f55a2
Revises: 0054_add_internal_note_done_fields
Create Date: 2026-02-04
"""

from __future__ import annotations


revision = "57e9452f55a2"
down_revision = "0054_add_internal_note_done_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Compatibility no-op.
    pass


def downgrade() -> None:
    # Compatibility no-op.
    pass

