"""add is_personal to tasks

Revision ID: 0033_add_task_is_personal
Revises: 0032_add_entry_date_common
Create Date: 2026-01-15 09:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0033_add_task_is_personal"
down_revision = "0032_add_entry_date_common"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("is_personal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("tasks", "is_personal")
