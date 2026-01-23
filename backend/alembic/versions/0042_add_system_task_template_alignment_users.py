"""add alignment users for system task templates

Revision ID: 0042_add_system_task_template_alignment_users
Revises: 0041_add_alignment_to_system_templates_and_tasks
Create Date: 2026-01-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0042_add_system_task_template_alignment_users"
down_revision = "0041_add_alignment_to_system_templates_and_tasks"
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


def upgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "system_task_template_alignment_users"):
        return

    op.create_table(
        "system_task_template_alignment_users",
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
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("template_id", "user_id", name="uq_system_task_template_alignment_user"),
    )
    op.create_index(
        "ix_system_task_template_alignment_users_template_id",
        "system_task_template_alignment_users",
        ["template_id"],
    )
    op.create_index(
        "ix_system_task_template_alignment_users_user_id",
        "system_task_template_alignment_users",
        ["user_id"],
    )


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "system_task_template_alignment_users"):
        return
    op.drop_index("ix_system_task_template_alignment_users_user_id", table_name="system_task_template_alignment_users")
    op.drop_index(
        "ix_system_task_template_alignment_users_template_id", table_name="system_task_template_alignment_users"
    )
    op.drop_table("system_task_template_alignment_users")

