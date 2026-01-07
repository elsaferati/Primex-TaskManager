"""add task dependency

Revision ID: 0018_add_task_dependency
Revises: 0017_add_system_task_days_of_week
Create Date: 2026-01-07
"""

from __future__ import annotations

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0018_add_task_dependency"
down_revision = "0017_add_system_task_days_of_week"
branch_labels = None
depends_on = None

VS_VL_META_PREFIX = "VS_VL_META:"


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("dependency_task_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_tasks_dependency_task_id", "tasks", ["dependency_task_id"])
    op.create_foreign_key(
        "fk_tasks_dependency_task_id_tasks",
        "tasks",
        "tasks",
        ["dependency_task_id"],
        ["id"],
        ondelete="SET NULL",
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, internal_notes FROM tasks WHERE internal_notes LIKE :prefix"),
        {"prefix": f"{VS_VL_META_PREFIX}%"},
    )
    for row in rows:
        notes = row.internal_notes
        if not notes:
            continue
        payload = notes[len(VS_VL_META_PREFIX) :]
        try:
            meta = json.loads(payload)
        except Exception:
            continue
        dependency_value = meta.get("dependency_task_id")
        if not dependency_value:
            continue
        try:
            dependency_uuid = uuid.UUID(str(dependency_value))
        except Exception:
            continue
        exists = conn.execute(
            sa.text("SELECT 1 FROM tasks WHERE id = :id"),
            {"id": dependency_uuid},
        ).scalar()
        if not exists:
            continue
        conn.execute(
            sa.text(
                "UPDATE tasks SET dependency_task_id = :dep "
                "WHERE id = :id AND dependency_task_id IS NULL"
            ),
            {"dep": dependency_uuid, "id": row.id},
        )


def downgrade() -> None:
    op.drop_constraint("fk_tasks_dependency_task_id_tasks", "tasks", type_="foreignkey")
    op.drop_index("ix_tasks_dependency_task_id", table_name="tasks")
    op.drop_column("tasks", "dependency_task_id")
