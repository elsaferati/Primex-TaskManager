"""enforce that every review awards one diamond

Revision ID: 0096_review_has_diamond
Revises: 0095_binary_review_diamond
Create Date: 2026-07-27
"""

from __future__ import annotations

from alembic import op


revision = "0096_review_has_diamond"
down_revision = "0095_binary_review_diamond"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A row without a diamond is not a review. Removing these rows puts the
    # task/user pair back into the "Not reviewed" queue.
    op.execute("DELETE FROM task_reviews WHERE diamond_score = 0")
    op.execute("UPDATE task_reviews SET diamond_score = 1")
    op.drop_constraint("ck_task_review_diamond_score", "task_reviews", type_="check")
    op.create_check_constraint(
        "ck_task_review_diamond_score",
        "task_reviews",
        "diamond_score = 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_task_review_diamond_score", "task_reviews", type_="check")
    op.create_check_constraint(
        "ck_task_review_diamond_score",
        "task_reviews",
        "diamond_score BETWEEN 0 AND 1",
    )
