"""merge heads

Revision ID: 0009_merge_heads
Revises: 0007_task_assignees, 0008_add_ga_note_department_id
Create Date: 2025-12-24 00:00:00.000000
"""

from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision = "0009_merge_heads"
down_revision = ("0007_task_assignees", "0008_add_ga_note_department_id")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
