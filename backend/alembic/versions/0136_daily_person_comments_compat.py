"""Recognize the alternate deployed person-comments revision ID.

Both 0136 IDs previously identified the same table migration. Keep the original
ID and its descendants intact while recognizing databases stamped with the
alternate ID. The table already exists at either revision, so no DDL is needed.
"""

revision = "0136_daily_person_comments"
down_revision = "0136_person_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
