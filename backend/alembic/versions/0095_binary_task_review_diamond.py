"""make task review diamond binary

Revision ID: 0095_binary_review_diamond
Revises: 0094_add_task_reviews
Create Date: 2026-07-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0095_binary_review_diamond"
down_revision = "0094_add_task_reviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_task_review_diamond_score", "task_reviews", type_="check")
    op.execute("UPDATE task_reviews SET diamond_score = CASE WHEN diamond_score > 0 THEN 1 ELSE 0 END")
    op.create_check_constraint(
        "ck_task_review_diamond_score",
        "task_reviews",
        "diamond_score BETWEEN 0 AND 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_task_review_diamond_score", "task_reviews", type_="check")
    op.execute("UPDATE task_reviews SET diamond_score = 1 WHERE diamond_score = 0")
    op.create_check_constraint(
        "ck_task_review_diamond_score",
        "task_reviews",
        "diamond_score BETWEEN 1 AND 5",
    )
