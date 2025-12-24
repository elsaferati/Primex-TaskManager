"""add task assignees

Revision ID: 0007_task_assignees
Revises: 0006_merge_heads
Create Date: 2025-12-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0007_task_assignees"
down_revision = "0006_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_assignees",
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_task_assignees_task_id", "task_assignees", ["task_id"])
    op.create_index("idx_task_assignees_user_id", "task_assignees", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_task_assignees_user_id", table_name="task_assignees")
    op.drop_index("idx_task_assignees_task_id", table_name="task_assignees")
    op.drop_table("task_assignees")
