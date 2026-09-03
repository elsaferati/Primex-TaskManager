"""Link tasks to an optional Skills Matrix category.

Revision ID: 0110_task_skill_category
Revises: 0109_user_task_preferences
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0110_task_skill_category"
down_revision = "0109_user_task_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    category = postgresql.ENUM(
        "analysis",
        "research",
        "problem_solving",
        "creativity",
        "standards",
        "qa",
        "management",
        "communication",
        "fast_tasks",
        name="task_skill_category",
        create_type=False,
    )
    category.create(op.get_bind(), checkfirst=True)
    op.add_column("tasks", sa.Column("skill_category", category, nullable=True))
    op.create_index("ix_tasks_skill_category", "tasks", ["skill_category"])


def downgrade() -> None:
    op.drop_index("ix_tasks_skill_category", table_name="tasks")
    op.drop_column("tasks", "skill_category")
    postgresql.ENUM(name="task_skill_category").drop(op.get_bind(), checkfirst=True)
