"""Add self-reported user task preferences and skills profiles.

Revision ID: 0109_user_task_preferences
Revises: 20260903_control_ko_owner
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0109_user_task_preferences"
down_revision = "20260903_control_ko_owner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    rating = postgresql.ENUM("A_PLUS", "A", "B", "C", name="skill_rating", create_type=False)
    rating.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "user_task_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("analysis", rating, nullable=True),
        sa.Column("research", rating, nullable=True),
        sa.Column("problem_solving", rating, nullable=True),
        sa.Column("creativity", rating, nullable=True),
        sa.Column("standards", rating, nullable=True),
        sa.Column("qa", rating, nullable=True),
        sa.Column("management", rating, nullable=True),
        sa.Column("communication", rating, nullable=True),
        sa.Column("fast_tasks", rating, nullable=True),
        sa.Column("above_average", sa.Text(), nullable=True),
        sa.Column("experience", sa.Text(), nullable=True),
        sa.Column("development", sa.Text(), nullable=True),
        sa.Column("ideal_projects", sa.Text(), nullable=True),
        sa.Column("motivation", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_user_task_preferences_user_id"),
    )
    op.create_index("ix_user_task_preferences_user_id", "user_task_preferences", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_task_preferences_user_id", table_name="user_task_preferences")
    op.drop_table("user_task_preferences")
    postgresql.ENUM(name="skill_rating").drop(op.get_bind(), checkfirst=True)
