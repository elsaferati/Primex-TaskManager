"""reconcile GA-note task instances

Revision ID: 0092_reconcile_ga_tasks
Revises: 0091_add_question_library
Create Date: 2026-07-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0092_reconcile_ga_tasks"
down_revision = "0091_add_question_library"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()

    # GA task copies use ga_note_origin_id as their logical group.  Generic
    # fast_task_group_id values were introduced by old edit paths and are the
    # main source of duplicate/replaced copies.
    op.execute(
        """
        UPDATE tasks
        SET fast_task_group_id = NULL
        WHERE ga_note_origin_id IS NOT NULL
          AND fast_task_group_id IS NOT NULL
        """
    )

    # Older GA tasks could store several people on one Task row. Materialize
    # every missing note/person pair before normalizing TaskAssignee rows, or
    # those secondary assignees would lose the task during this migration.
    legacy_memberships = (
        connection.execute(
            sa.text(
                """
                SELECT source_task_id, user_id
                FROM (
                    SELECT DISTINCT ON (t.ga_note_origin_id, ta.user_id)
                        t.id AS source_task_id,
                        t.ga_note_origin_id,
                        ta.user_id
                    FROM tasks AS t
                    JOIN task_assignees AS ta ON ta.task_id = t.id
                    WHERE t.ga_note_origin_id IS NOT NULL
                      AND t.is_active IS TRUE
                      AND NOT EXISTS (
                          SELECT 1
                          FROM tasks AS existing
                          WHERE existing.ga_note_origin_id = t.ga_note_origin_id
                            AND existing.assigned_to = ta.user_id
                            AND existing.is_active IS TRUE
                      )
                    ORDER BY
                        t.ga_note_origin_id,
                        ta.user_id,
                        (t.assigned_to = ta.user_id) DESC,
                        t.created_at ASC,
                        t.id ASC
                ) AS missing
                """
            )
        )
        .mappings()
        .all()
    )

    for membership in legacy_memberships:
        new_task_id = connection.execute(sa.text("SELECT gen_random_uuid()" )).scalar_one()
        connection.execute(
            sa.text(
                """
                INSERT INTO tasks (
                    id, title, description, internal_notes, project_id,
                    dependency_task_id, department_id, assigned_to,
                    confirmation_assignee_id, created_by, ga_note_origin_id,
                    plan_note_origin_id, system_template_origin_id, origin_run_at,
                    system_task_slot_id, meeting_origin_id, meeting_occurrence_date,
                    meeting_system_task_kind, fast_task_group_id, status, priority,
                    finish_period, phase, progress_percentage, daily_products,
                    start_date, due_date, original_due_date, completed_at,
                    is_deadline_important, is_bllok, is_1h_report,
                    one_h_report_slot, is_r1, is_personal, fast_task_order,
                    is_active, created_at, updated_at
                )
                SELECT
                    :new_task_id, t.title, t.description, t.internal_notes,
                    t.project_id, t.dependency_task_id,
                    COALESCE(u.department_id, t.department_id), :user_id,
                    t.confirmation_assignee_id, t.created_by, t.ga_note_origin_id,
                    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                    t.status, t.priority, t.finish_period, t.phase,
                    t.progress_percentage, t.daily_products, t.start_date,
                    t.due_date, t.original_due_date, t.completed_at,
                    t.is_deadline_important, t.is_bllok, t.is_1h_report,
                    t.one_h_report_slot, t.is_r1, t.is_personal,
                    t.fast_task_order, TRUE, t.created_at, t.updated_at
                FROM tasks AS t
                JOIN users AS u ON u.id = :user_id
                WHERE t.id = :source_task_id
                """
            ),
            {
                "new_task_id": new_task_id,
                "source_task_id": membership["source_task_id"],
                "user_id": membership["user_id"],
            },
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO task_assignees (task_id, user_id, created_at)
                VALUES (:task_id, :user_id, now())
                ON CONFLICT (task_id, user_id) DO NOTHING
                """
            ),
            {"task_id": new_task_id, "user_id": membership["user_id"]},
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO task_alignment_users (id, task_id, user_id, created_at)
                SELECT gen_random_uuid(), :new_task_id, user_id, created_at
                FROM task_alignment_users
                WHERE task_id = :source_task_id
                ON CONFLICT ON CONSTRAINT uq_task_alignment_user DO NOTHING
                """
            ),
            {
                "new_task_id": new_task_id,
                "source_task_id": membership["source_task_id"],
            },
        )
        # User comments are personal execution state and follow that person's
        # new independent copy.
        connection.execute(
            sa.text(
                """
                UPDATE task_user_comments
                SET task_id = :new_task_id
                WHERE task_id = :source_task_id
                  AND user_id = :user_id
                """
            ),
            {
                "new_task_id": new_task_id,
                "source_task_id": membership["source_task_id"],
                "user_id": membership["user_id"],
            },
        )

    # Recover ownerless legacy rows when they have exactly one explicit owner.
    op.execute(
        """
        WITH single_owner AS (
            SELECT task_id, (array_agg(user_id ORDER BY user_id))[1] AS user_id
            FROM task_assignees
            GROUP BY task_id
            HAVING count(*) = 1
        )
        UPDATE tasks AS t
        SET assigned_to = so.user_id
        FROM single_owner AS so
        WHERE t.id = so.task_id
          AND t.ga_note_origin_id IS NOT NULL
          AND t.is_active IS TRUE
          AND t.assigned_to IS NULL
        """
    )

    # Ownerless rows cannot be independent user instances. Preserve them as
    # inactive history instead of deleting them.
    op.execute(
        """
        UPDATE tasks
        SET is_active = FALSE
        WHERE ga_note_origin_id IS NOT NULL
          AND is_active IS TRUE
          AND assigned_to IS NULL
        """
    )

    # Keep one active row per note/person. Prefer a row that already had one
    # matching TaskAssignee; this avoids selecting a formerly multi-assignee
    # representative row over the person's original independent copy.
    op.execute(
        """
        WITH assignee_shape AS (
            SELECT
                t.id,
                t.ga_note_origin_id,
                t.assigned_to,
                t.created_at,
                count(ta.user_id) AS assignee_count,
                count(ta.user_id) FILTER (WHERE ta.user_id = t.assigned_to) AS owner_matches
            FROM tasks AS t
            LEFT JOIN task_assignees AS ta ON ta.task_id = t.id
            WHERE t.ga_note_origin_id IS NOT NULL
              AND t.is_active IS TRUE
              AND t.assigned_to IS NOT NULL
            GROUP BY t.id
        ), ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY ga_note_origin_id, assigned_to
                    ORDER BY
                        (assignee_count = 1 AND owner_matches = 1) DESC,
                        created_at ASC,
                        id ASC
                ) AS copy_rank
            FROM assignee_shape
        )
        UPDATE tasks AS t
        SET is_active = FALSE
        FROM ranked AS r
        WHERE t.id = r.id
          AND r.copy_rank > 1
        """
    )

    # Active GA copies expose one membership owner. Other workflow participants
    # belong in alignment/confirmation tables and must not be interpreted as GA
    # assignee membership.
    op.execute(
        """
        DELETE FROM task_assignees AS ta
        USING tasks AS t
        WHERE ta.task_id = t.id
          AND t.ga_note_origin_id IS NOT NULL
          AND t.is_active IS TRUE
        """
    )
    op.execute(
        """
        INSERT INTO task_assignees (task_id, user_id)
        SELECT id, assigned_to
        FROM tasks
        WHERE ga_note_origin_id IS NOT NULL
          AND is_active IS TRUE
          AND assigned_to IS NOT NULL
        ON CONFLICT (task_id, user_id) DO NOTHING
        """
    )

    # Conversion state is derived from active independent copies.
    op.execute(
        """
        UPDATE ga_notes AS n
        SET is_converted_to_task = EXISTS (
            SELECT 1
            FROM tasks AS t
            WHERE t.ga_note_origin_id = n.id
              AND t.is_active IS TRUE
              AND t.assigned_to IS NOT NULL
        )
        """
    )

    op.create_index(
        "ix_tasks_ga_note_origin_active",
        "tasks",
        ["ga_note_origin_id", "is_active"],
        unique=False,
    )
    op.create_index(
        "uq_tasks_active_ga_note_assignee",
        "tasks",
        ["ga_note_origin_id", "assigned_to"],
        unique=True,
        postgresql_where=sa.text(
            "ga_note_origin_id IS NOT NULL AND assigned_to IS NOT NULL AND is_active IS TRUE"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_tasks_active_ga_note_assignee", table_name="tasks")
    op.drop_index("ix_tasks_ga_note_origin_active", table_name="tasks")
    # Data reconciliation is intentionally not reversed.
