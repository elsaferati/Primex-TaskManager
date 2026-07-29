"""add question tasks

Revision ID: 0101_add_question_tasks
Revises: 0100_sync_question_edit_counts
Create Date: 2026-07-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0101_add_question_tasks"
down_revision = "0100_sync_question_edit_counts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("question_origin_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_tasks_question_origin_id_question_definitions",
        "tasks",
        "question_definitions",
        ["question_origin_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tasks_question_origin_id", "tasks", ["question_origin_id"])
    op.create_unique_constraint(
        "uq_tasks_question_origin_user",
        "tasks",
        ["question_origin_id", "assigned_to"],
    )

    op.execute(
        """
        WITH candidates AS (
            SELECT
                question.id AS question_id,
                question.text AS question_text,
                question.guidance AS question_guidance,
                question.created_by_user_id,
                question.created_at,
                app_user.id AS user_id,
                app_user.department_id
            FROM question_definitions AS question
            CROSS JOIN users AS app_user
            WHERE question.created_at >= now() - interval '24 hours'
              AND app_user.is_active IS TRUE
              AND (
                  CASE
                      WHEN cardinality(regexp_split_to_array(btrim(app_user.full_name), '\\s+')) = 1
                          THEN upper(left(btrim(app_user.full_name), 1))
                      ELSE upper(
                          left((regexp_split_to_array(btrim(app_user.full_name), '\\s+'))[1], 1)
                          || left(
                              (regexp_split_to_array(btrim(app_user.full_name), '\\s+'))[
                                  cardinality(regexp_split_to_array(btrim(app_user.full_name), '\\s+'))
                              ],
                              1
                          )
                      )
                  END
              ) NOT IN ('GA', 'KA')
        ),
        inserted AS (
            INSERT INTO tasks (
                id,
                title,
                description,
                department_id,
                assigned_to,
                created_by,
                question_origin_id,
                fast_task_group_id,
                status,
                priority,
                phase,
                progress_percentage,
                start_date,
                due_date,
                is_deadline_important,
                is_r1,
                is_active,
                created_at,
                updated_at
            )
            SELECT
                gen_random_uuid(),
                'PYETJE E RE: ' || candidate.question_text,
                COALESCE(
                    candidate.question_guidance,
                    'Përgjigju me ✓ ose X te faqja Pyetje për Barazim.'
                ),
                candidate.department_id,
                candidate.user_id,
                candidate.created_by_user_id,
                candidate.question_id,
                candidate.question_id,
                'TODO',
                'NORMAL',
                'MEETINGS',
                0,
                candidate.created_at,
                CASE
                    WHEN EXTRACT(
                        HOUR FROM candidate.created_at AT TIME ZONE 'Europe/Budapest'
                    ) >= 12
                        THEN candidate.created_at + interval '24 hours'
                    ELSE (
                        date_trunc(
                            'day',
                            candidate.created_at AT TIME ZONE 'Europe/Budapest'
                        ) + interval '1 day' - interval '1 microsecond'
                    ) AT TIME ZONE 'Europe/Budapest'
                END,
                TRUE,
                TRUE,
                TRUE,
                candidate.created_at,
                candidate.created_at
            FROM candidates AS candidate
            ON CONFLICT (question_origin_id, assigned_to) DO NOTHING
            RETURNING id, assigned_to
        )
        INSERT INTO task_assignees (task_id, user_id, created_at)
        SELECT inserted.id, inserted.assigned_to, now()
        FROM inserted
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM tasks WHERE question_origin_id IS NOT NULL")
    op.drop_constraint("uq_tasks_question_origin_user", "tasks", type_="unique")
    op.drop_index("ix_tasks_question_origin_id", table_name="tasks")
    op.drop_constraint(
        "fk_tasks_question_origin_id_question_definitions",
        "tasks",
        type_="foreignkey",
    )
    op.drop_column("tasks", "question_origin_id")
