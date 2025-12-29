"""merge heads after finish period

Revision ID: 0012_merge_heads
Revises: 0009_merge_heads, 0011_add_finish_period
Create Date: 2025-12-29
"""

from __future__ import annotations


revision = "0012_merge_heads"
down_revision = ("0009_merge_heads", "0011_add_finish_period")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
