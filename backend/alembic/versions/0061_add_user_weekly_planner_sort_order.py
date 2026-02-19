"""add weekly planner user sort order

Revision ID: 0061_add_user_weekly_planner_sort_order
Revises: 0060_add_internal_meeting_sessions
Create Date: 2026-02-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0061_add_user_weekly_planner_sort_order"
down_revision = "0060_add_internal_meeting_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("weekly_planner_sort_order", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "weekly_planner_sort_order")
