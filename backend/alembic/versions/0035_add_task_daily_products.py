"""add task daily_products column

Revision ID: 0035_add_task_daily_products
Revises: 3be7338d6b6d
Create Date: 2026-01-16 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0035_add_task_daily_products"
down_revision = "3be7338d6b6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("daily_products", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "daily_products")
