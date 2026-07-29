"""merge question tasks into one shared task

Revision ID: 0102_merge_question_tasks
Revises: 0101_add_question_tasks
Create Date: 2026-07-28
"""

from __future__ import annotations

from alembic import op


revision = "0102_merge_question_tasks"
down_revision = "0101_add_question_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        WITH ranked AS (
            SELECT
                task.id,
                task.question_origin_id,
                task.assigned_to,
                first_value(task.id) OVER (
                    PARTITION BY task.question_origin_id
                    ORDER BY task.created_at, task.id
                ) AS keeper_id
            FROM tasks AS task
            WHERE task.question_origin_id IS NOT NULL
        ),
        assignees AS (
            SELECT ranked.keeper_id AS task_id, task_assignee.user_id
            FROM ranked
            JOIN task_assignees AS task_assignee ON task_assignee.task_id = ranked.id
            UNION
            SELECT ranked.keeper_id AS task_id, ranked.assigned_to AS user_id
            FROM ranked
            WHERE ranked.assigned_to IS NOT NULL
        )
        INSERT INTO task_assignees (task_id, user_id, created_at)
        SELECT assignees.task_id, assignees.user_id, now()
        FROM assignees
        ON CONFLICT (task_id, user_id) DO NOTHING
        """
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                task.id,
                first_value(task.id) OVER (
                    PARTITION BY task.question_origin_id
                    ORDER BY task.created_at, task.id
                ) AS keeper_id
            FROM tasks AS task
            WHERE task.question_origin_id IS NOT NULL
        )
        DELETE FROM tasks
        USING ranked
        WHERE tasks.id = ranked.id
          AND ranked.id <> ranked.keeper_id
        """
    )
    op.execute(
        """
        UPDATE tasks
        SET assigned_to = NULL,
            department_id = NULL,
            fast_task_group_id = question_origin_id
        WHERE question_origin_id IS NOT NULL
        """
    )

    op.drop_constraint("uq_tasks_question_origin_user", "tasks", type_="unique")
    op.create_unique_constraint("uq_tasks_question_origin", "tasks", ["question_origin_id"])

    op.execute(
        """
        UPDATE tasks AS task
        SET status = CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM task_assignees AS assigned
                    WHERE assigned.task_id = task.id
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM task_assignees AS assigned
                    WHERE assigned.task_id = task.id
                      AND NOT EXISTS (
                          SELECT 1
                          FROM question_user_statuses AS response
                          WHERE response.question_id = task.question_origin_id
                            AND response.user_id = assigned.user_id
                      )
                )
                    THEN 'DONE'
                ELSE 'TODO'
            END,
            completed_at = CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM task_assignees AS assigned
                    WHERE assigned.task_id = task.id
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM task_assignees AS assigned
                    WHERE assigned.task_id = task.id
                      AND NOT EXISTS (
                          SELECT 1
                          FROM question_user_statuses AS response
                          WHERE response.question_id = task.question_origin_id
                            AND response.user_id = assigned.user_id
                      )
                )
                    THEN now()
                ELSE NULL
            END
        WHERE task.question_origin_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("uq_tasks_question_origin", "tasks", type_="unique")
    op.create_unique_constraint(
        "uq_tasks_question_origin_user",
        "tasks",
        ["question_origin_id", "assigned_to"],
    )
