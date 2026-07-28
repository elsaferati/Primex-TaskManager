"""add task reviews

Revision ID: 0094_add_task_reviews
Revises: 0093_dev_tasks_planning
Create Date: 2026-07-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0094_add_task_reviews"
down_revision = "0093_dev_tasks_planning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewee_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reviewer_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("diamond_score", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("is_sample", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("task_title_snapshot", sa.Text(), nullable=False),
        sa.Column("project_title_snapshot", sa.String(length=200), nullable=True),
        sa.Column("reviewee_name_snapshot", sa.String(length=100), nullable=False),
        sa.Column("reviewer_name_snapshot", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("diamond_score = 1", name="ck_task_review_diamond_score"),
        sa.ForeignKeyConstraint(["reviewee_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "reviewee_user_id", name="uq_task_review_task_reviewee"),
    )
    op.create_index("ix_task_reviews_task_id", "task_reviews", ["task_id"])
    op.create_index("ix_task_reviews_reviewee_user_id", "task_reviews", ["reviewee_user_id"])
    op.create_index("ix_task_reviews_reviewer_user_id", "task_reviews", ["reviewer_user_id"])
    op.create_index("ix_task_reviews_is_sample", "task_reviews", ["is_sample"])


def downgrade() -> None:
    op.drop_table("task_reviews")
