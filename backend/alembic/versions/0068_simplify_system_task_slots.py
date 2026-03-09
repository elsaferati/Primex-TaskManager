"""simplify system task slots to direct per-user assignment

Revision ID: 0068_simplify_system_task_slots
Revises: 0067_system_task_app_timezone_defaults
Create Date: 2026-03-09 11:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0068_simplify_system_task_slots"
down_revision = "0067_system_task_app_timezone_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM system_task_template_assignee_slots slot
        USING (
            SELECT id
            FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY template_id, primary_user_id
                        ORDER BY created_at ASC, id ASC
                    ) AS row_num
                FROM system_task_template_assignee_slots
            ) ranked
            WHERE ranked.row_num > 1
        ) duplicates
        WHERE slot.id = duplicates.id
        """
    )
    op.drop_column("system_task_template_assignee_slots", "zv1_user_id")
    op.drop_column("system_task_template_assignee_slots", "zv2_user_id")
    op.create_index(
        "uq_system_task_template_slots_template_primary",
        "system_task_template_assignee_slots",
        ["template_id", "primary_user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_system_task_template_slots_template_primary",
        table_name="system_task_template_assignee_slots",
    )
    op.add_column(
        "system_task_template_assignee_slots",
        sa.Column("zv2_user_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "system_task_template_assignee_slots",
        sa.Column("zv1_user_id", sa.UUID(), nullable=True),
    )
