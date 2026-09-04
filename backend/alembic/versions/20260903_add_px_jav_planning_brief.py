"""Add optional structured planning brief to PX JAV notes.

Revision ID: 20260903_px_jav_brief
Revises: 0109_user_task_preferences
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260903_px_jav_brief"
down_revision = "0109_user_task_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("plan_notes")}
    if "planning_brief" not in columns:
        op.add_column("plan_notes", sa.Column("planning_brief", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("plan_notes")}
    if "planning_brief" in columns:
        op.drop_column("plan_notes", "planning_brief")
