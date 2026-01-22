"""add system task occurrences table and tasks.original_due_date

Revision ID: 0040_add_system_task_occurrences_and_original_due_date
Revises: 0039_system_task_occurrences
Create Date: 2026-01-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0040_add_system_task_occurrences_and_original_due_date"
down_revision = "0039_system_task_occurrences"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = :t
            LIMIT 1
            """
        ),
        {"t": table_name},
    ).fetchone()
    return row is not None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    row = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :t
              AND column_name = :c
            LIMIT 1
            """
        ),
        {"t": table_name, "c": column_name},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()

    # Add reporting-only field for postponed tasks.
    if _table_exists(conn, "tasks") and not _column_exists(conn, "tasks", "original_due_date"):
        op.add_column("tasks", sa.Column("original_due_date", sa.DateTime(timezone=True), nullable=True))

    # Create occurrences table for system/recurring tasks.
    if not _table_exists(conn, "system_task_occurrences"):
        op.create_table(
            "system_task_occurrences",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "template_id",
                sa.dialects.postgresql.UUID(as_uuid=True),
                sa.ForeignKey("system_task_templates.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.dialects.postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("occurrence_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(length=20), server_default=sa.text("'OPEN'"), nullable=False),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("acted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.UniqueConstraint("template_id", "user_id", "occurrence_date", name="uq_system_task_occurrence"),
        )
        op.create_index("ix_system_task_occurrences_template_id", "system_task_occurrences", ["template_id"])
        op.create_index("ix_system_task_occurrences_user_id", "system_task_occurrences", ["user_id"])
        op.create_index("ix_system_task_occurrences_occurrence_date", "system_task_occurrences", ["occurrence_date"])


def downgrade() -> None:
    conn = op.get_bind()

    if _table_exists(conn, "system_task_occurrences"):
        op.drop_index("ix_system_task_occurrences_occurrence_date", table_name="system_task_occurrences")
        op.drop_index("ix_system_task_occurrences_user_id", table_name="system_task_occurrences")
        op.drop_index("ix_system_task_occurrences_template_id", table_name="system_task_occurrences")
        op.drop_table("system_task_occurrences")

    if _table_exists(conn, "tasks") and _column_exists(conn, "tasks", "original_due_date"):
        op.drop_column("tasks", "original_due_date")

