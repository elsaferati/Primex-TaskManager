"""add project type to projects

Revision ID: 0027_add_project_type
Revises: refactor_phases_and_status
Create Date: 2026-01-09 13:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0027_add_project_type"
down_revision = "refactor_phases_and_status"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("project_type", sa.String(length=20), nullable=True))


def downgrade():
    op.drop_column("projects", "project_type")
