"""add_project_total_products

Revision ID: 3be7338d6b6d
Revises: 0034_add_task_user_comments
Create Date: 2026-01-16 09:46:33.778305

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3be7338d6b6d'
down_revision = '0034_add_task_user_comments'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("total_products", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("projects", "total_products")
