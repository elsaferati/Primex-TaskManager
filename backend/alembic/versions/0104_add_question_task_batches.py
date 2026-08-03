"""group same-day questions into one task

Revision ID: 0104_question_task_batches
Revises: 0103_question_daily_signoffs
Create Date: 2026-07-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0104_question_task_batches"
down_revision = "0103_question_daily_signoffs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("question_batch_date", sa.Date(), nullable=True),
    )
    op.create_index(
        "ix_tasks_question_batch_date",
        "tasks",
        ["question_batch_date"],
        unique=True,
    )
    op.add_column(
        "question_definitions",
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_question_definitions_task_id_tasks",
        "question_definitions",
        "tasks",
        ["task_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_question_definitions_task_id",
        "question_definitions",
        ["task_id"],
    )
    op.execute(
        """
        UPDATE question_definitions AS question
        SET task_id = task.id
        FROM tasks AS task
        WHERE task.question_origin_id = question.id
          AND question.task_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_question_definitions_task_id", table_name="question_definitions")
    op.drop_constraint(
        "fk_question_definitions_task_id_tasks",
        "question_definitions",
        type_="foreignkey",
    )
    op.drop_column("question_definitions", "task_id")
    op.drop_index("ix_tasks_question_batch_date", table_name="tasks")
    op.drop_column("tasks", "question_batch_date")
