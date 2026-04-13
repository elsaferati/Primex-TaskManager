"""system task slot refactor with task-origin scheduling

Revision ID: 0066_system_task_slot_refactor
Revises: 0065_add_task_confirmation_assignee, d4c7f6b8a9c1
Create Date: 2026-03-03 14:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0066_system_task_slot_refactor"
down_revision = ("0065_add_task_confirmation_assignee", "d4c7f6b8a9c1")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "system_task_templates",
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Europe/Tirane"),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("due_time", sa.Time(), nullable=False, server_default="09:00:00"),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("lookahead", sa.Integer(), nullable=False, server_default="14"),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("interval", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("apply_from", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("duration_days", sa.Integer(), nullable=False, server_default="1"),
    )

    op.create_table(
        "system_task_template_assignee_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("primary_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("zv1_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("zv2_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["template_id"], ["system_task_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["primary_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["zv1_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["zv2_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_slots_template_primary",
        "system_task_template_assignee_slots",
        ["template_id", "primary_user_id"],
        unique=False,
    )
    op.create_index(
        "idx_slots_next_run_at",
        "system_task_template_assignee_slots",
        ["next_run_at"],
        unique=False,
    )

    op.add_column("tasks", sa.Column("origin_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("system_task_slot_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_tasks_system_task_slot_id",
        "tasks",
        "system_task_template_assignee_slots",
        ["system_task_slot_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tasks_system_task_slot_id", "tasks", ["system_task_slot_id"], unique=False)
    op.create_index(
        "uq_tasks_template_slot_origin_run",
        "tasks",
        ["system_template_origin_id", "system_task_slot_id", "origin_run_at"],
        unique=True,
        postgresql_where=sa.text("origin_run_at IS NOT NULL"),
    )

    op.execute(
        """
        INSERT INTO system_task_template_assignee_slots (
            id,
            template_id,
            primary_user_id,
            zv1_user_id,
            zv2_user_id,
            next_run_at,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            t.id,
            assignee_uid,
            NULL,
            NULL,
            (
                CASE
                    WHEN timezone(COALESCE(t.timezone, 'Europe/Tirane'), now())::time > COALESCE(t.due_time, time '09:00')
                        THEN ((timezone(COALESCE(t.timezone, 'Europe/Tirane'), now())::date + interval '1 day') + COALESCE(t.due_time, time '09:00'))
                    ELSE (timezone(COALESCE(t.timezone, 'Europe/Tirane'), now())::date + COALESCE(t.due_time, time '09:00'))
                END
            ) AT TIME ZONE COALESCE(t.timezone, 'Europe/Tirane'),
            true,
            now(),
            now()
        FROM system_task_templates t
        CROSS JOIN LATERAL (
            SELECT unnest(
                CASE
                    WHEN COALESCE(array_length(t.assignee_ids, 1), 0) > 0 THEN t.assignee_ids
                    WHEN t.default_assignee_id IS NOT NULL THEN ARRAY[t.default_assignee_id]
                    ELSE ARRAY[]::uuid[]
                END
            ) AS assignee_uid
        ) assignees
        """
    )


def downgrade() -> None:
    op.drop_index("uq_tasks_template_slot_origin_run", table_name="tasks")
    op.drop_index("ix_tasks_system_task_slot_id", table_name="tasks")
    op.drop_constraint("fk_tasks_system_task_slot_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "system_task_slot_id")
    op.drop_column("tasks", "origin_run_at")

    op.drop_index("idx_slots_next_run_at", table_name="system_task_template_assignee_slots")
    op.drop_index("idx_slots_template_primary", table_name="system_task_template_assignee_slots")
    op.drop_table("system_task_template_assignee_slots")

    op.drop_column("system_task_templates", "duration_days")
    op.drop_column("system_task_templates", "apply_from")
    op.drop_column("system_task_templates", "interval")
    op.drop_column("system_task_templates", "lookahead")
    op.drop_column("system_task_templates", "due_time")
    op.drop_column("system_task_templates", "timezone")
