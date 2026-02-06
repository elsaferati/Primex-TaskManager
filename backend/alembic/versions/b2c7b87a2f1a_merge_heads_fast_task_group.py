"""merge heads (fast task group)

Revision ID: b2c7b87a2f1a
Revises: 0056_merge_heads, 8c3c0a9ad5a1
Create Date: 2026-02-06

"""

from __future__ import annotations


# revision identifiers, used by Alembic.
revision = "b2c7b87a2f1a"
down_revision = ("0056_merge_heads", "8c3c0a9ad5a1")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge revision: no schema changes.
    pass


def downgrade() -> None:
    # Merge revision: no schema changes.
    pass

