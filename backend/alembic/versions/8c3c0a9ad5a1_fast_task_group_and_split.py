"""fast_task_group_id_and_split_fast_tasks

Revision ID: 8c3c0a9ad5a1
Revises: 57e9452f55a2
Create Date: 2026-02-06

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "8c3c0a9ad5a1"
down_revision = "57e9452f55a2"
branch_labels = None
depends_on = None


FAST_TASK_WHERE_SQL = """
    project_id IS NULL
    AND dependency_task_id IS NULL
    AND system_template_origin_id IS NULL
    AND ga_note_origin_id IS NULL
"""


def _column_exists(connection, *, table: str, column: str) -> bool:
    return (
        connection.execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = :table
                  AND column_name = :column
                """
            ),
            {"table": table, "column": column},
        ).scalar()
        is not None
    )


def _index_exists(connection, *, table: str, index: str) -> bool:
    return (
        connection.execute(
            sa.text(
                """
                SELECT 1
                FROM pg_indexes
                WHERE tablename = :table
                  AND indexname = :index
                """
            ),
            {"table": table, "index": index},
        ).scalar()
        is not None
    )


def upgrade() -> None:
    connection = op.get_bind()

    # Ensure UUID generator is available for data migration inserts.
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')

    if not _column_exists(connection, table="tasks", column="fast_task_group_id"):
        op.add_column(
            "tasks",
            sa.Column("fast_task_group_id", postgresql.UUID(as_uuid=True), nullable=True),
        )

    if not _index_exists(connection, table="tasks", index="idx_tasks_fast_task_group_id"):
        op.create_index(
            "idx_tasks_fast_task_group_id",
            "tasks",
            ["fast_task_group_id"],
        )

    # Backfill group id for existing fast tasks.
    op.execute(
        sa.text(
            f"""
            UPDATE tasks
            SET fast_task_group_id = id
            WHERE fast_task_group_id IS NULL
              AND {FAST_TASK_WHERE_SQL}
            """
        )
    )

    # Split existing multi-assignee fast tasks into per-user rows.
    rows = (
        connection.execute(
            sa.text(
                f"""
                SELECT
                    t.id AS task_id,
                    t.assigned_to AS assigned_to,
                    t.fast_task_group_id AS group_id,
                    ARRAY_AGG(ta.user_id ORDER BY ta.user_id) AS assignees
                FROM tasks t
                JOIN task_assignees ta ON ta.task_id = t.id
                WHERE t.fast_task_group_id IS NOT NULL
                  AND {FAST_TASK_WHERE_SQL}
                GROUP BY t.id
                HAVING COUNT(*) > 1
                """
            )
        )
        .mappings()
        .all()
    )

    for row in rows:
        task_id = row["task_id"]
        assigned_to = row["assigned_to"]
        assignees = list(row["assignees"] or [])
        if len(assignees) <= 1:
            continue

        primary_user_id = assigned_to if assigned_to in assignees else assignees[0]

        # Ensure the original task is the primary user's copy.
        connection.execute(
            sa.text("UPDATE tasks SET assigned_to = :uid WHERE id = :tid"),
            {"uid": primary_user_id, "tid": task_id},
        )
        connection.execute(
            sa.text(
                """
                DELETE FROM task_assignees
                WHERE task_id = :tid AND user_id != :uid
                """
            ),
            {"tid": task_id, "uid": primary_user_id},
        )

        alignment_user_ids = (
            connection.execute(
                sa.text("SELECT user_id FROM task_alignment_users WHERE task_id = :tid"),
                {"tid": task_id},
            )
            .scalars()
            .all()
        )

        # Create one clone per remaining assignee.
        for user_id in assignees:
            if user_id == primary_user_id:
                continue

            new_task_id = connection.execute(sa.text("SELECT gen_random_uuid()")).scalar()

            connection.execute(
                sa.text(
                    """
                    INSERT INTO tasks (
                        id,
                        title,
                        description,
                        internal_notes,
                        project_id,
                        dependency_task_id,
                        department_id,
                        assigned_to,
                        created_by,
                        ga_note_origin_id,
                        system_template_origin_id,
                        fast_task_group_id,
                        status,
                        priority,
                        finish_period,
                        phase,
                        progress_percentage,
                        daily_products,
                        start_date,
                        due_date,
                        original_due_date,
                        completed_at,
                        is_bllok,
                        is_1h_report,
                        is_r1,
                        is_personal,
                        is_active,
                        created_at,
                        updated_at
                    )
                    SELECT
                        :new_id,
                        title,
                        description,
                        internal_notes,
                        project_id,
                        dependency_task_id,
                        department_id,
                        :user_id,
                        created_by,
                        ga_note_origin_id,
                        system_template_origin_id,
                        fast_task_group_id,
                        status,
                        priority,
                        finish_period,
                        phase,
                        progress_percentage,
                        daily_products,
                        start_date,
                        due_date,
                        original_due_date,
                        completed_at,
                        is_bllok,
                        is_1h_report,
                        is_r1,
                        is_personal,
                        is_active,
                        created_at,
                        updated_at
                    FROM tasks
                    WHERE id = :src_id
                    """
                ),
                {"new_id": new_task_id, "user_id": user_id, "src_id": task_id},
            )

            connection.execute(
                sa.text(
                    """
                    INSERT INTO task_assignees (task_id, user_id, created_at)
                    VALUES (:tid, :uid, now())
                    """
                ),
                {"tid": new_task_id, "uid": user_id},
            )

            # Copy alignment users.
            for alignment_user_id in alignment_user_ids:
                connection.execute(
                    sa.text(
                        """
                        INSERT INTO task_alignment_users (id, task_id, user_id, created_at)
                        VALUES (gen_random_uuid(), :tid, :uid, now())
                        ON CONFLICT ON CONSTRAINT uq_task_alignment_user DO NOTHING
                        """
                    ),
                    {"tid": new_task_id, "uid": alignment_user_id},
                )

            # Move user-specific comment to the cloned task, if any.
            connection.execute(
                sa.text(
                    """
                    UPDATE task_user_comments
                    SET task_id = :new_tid
                    WHERE task_id = :old_tid AND user_id = :uid
                    """
                ),
                {"new_tid": new_task_id, "old_tid": task_id, "uid": user_id},
            )


def downgrade() -> None:
    connection = op.get_bind()

    # Best-effort downgrade: drop index + column. Does not attempt to merge split tasks back.
    if _index_exists(connection, table="tasks", index="idx_tasks_fast_task_group_id"):
        op.drop_index("idx_tasks_fast_task_group_id", table_name="tasks")
    if _column_exists(connection, table="tasks", column="fast_task_group_id"):
        op.drop_column("tasks", "fast_task_group_id")

