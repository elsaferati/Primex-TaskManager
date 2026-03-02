"""system task instances refactor

Revision ID: 0066_system_task_instances_refactor
Revises: ('0065_add_task_confirmation_assignee', 'd4c7f6b8a9c1')
Create Date: 2026-03-02 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0066_system_task_instances_refactor"
down_revision = ("0065_add_task_confirmation_assignee", "d4c7f6b8a9c1")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("system_task_templates", sa.Column("timezone", sa.String(length=64), nullable=True))
    op.add_column("system_task_templates", sa.Column("start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("system_task_templates", sa.Column("due_time", sa.Time(), nullable=True))
    op.add_column("system_task_templates", sa.Column("interval", sa.Integer(), nullable=True))
    op.add_column("system_task_templates", sa.Column("lookahead_days", sa.Integer(), nullable=True))
    op.add_column("system_task_templates", sa.Column("recurrence_kind", sa.String(length=50), nullable=True))
    op.add_column("system_task_templates", sa.Column("byweekday", postgresql.ARRAY(sa.Integer()), nullable=True))
    op.add_column("system_task_templates", sa.Column("bymonthday", sa.Integer(), nullable=True))
    op.add_column("system_task_templates", sa.Column("effective_from", sa.Date(), nullable=True))
    op.add_column("system_task_templates", sa.Column("effective_to", sa.Date(), nullable=True))

    op.add_column("system_task_template_assignees", sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "system_task_template_assignees",
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column(
        "system_task_template_assignees",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_system_task_template_assignees_template_user_active",
        "system_task_template_assignees",
        ["template_id", "user_id", "active"],
        unique=False,
    )

    op.add_column("tasks", sa.Column("origin_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("system_outcome", sa.String(length=20), server_default="OPEN", nullable=True),
    )
    op.create_index(
        "uq_tasks_system_template_user_origin_run_at",
        "tasks",
        ["system_template_origin_id", "assigned_to", "origin_run_at"],
        unique=True,
        postgresql_where=sa.text("origin_run_at is not null"),
    )

    op.execute(
        """
        update system_task_templates
        set
            timezone = coalesce(timezone, 'Europe/Tirane'),
            due_time = coalesce(due_time, time '09:00:00'),
            lookahead_days = coalesce(lookahead_days, 30),
            interval = coalesce(interval, 1),
            start_at = coalesce(start_at, date_trunc('day', created_at) + time '09:00:00'),
            recurrence_kind = case
                when frequency = 'DAILY' then 'DAILY'
                when frequency = 'WEEKLY' then 'WEEKLY'
                when frequency = 'MONTHLY' then 'MONTHLY'
                when frequency = 'YEARLY' then 'YEARLY'
                when frequency = '3_MONTHS' then 'MONTHLY'
                when frequency = '6_MONTHS' then 'MONTHLY'
                else 'DAILY'
            end,
            interval = case
                when frequency = '3_MONTHS' then 3
                when frequency = '6_MONTHS' then 6
                when frequency = 'YEARLY' then 12
                else coalesce(interval, 1)
            end,
            byweekday = case
                when frequency = 'WEEKLY' then coalesce(days_of_week, array[day_of_week])
                else null
            end,
            bymonthday = case
                when frequency in ('MONTHLY', '3_MONTHS', '6_MONTHS', 'YEARLY') then day_of_month
                else null
            end
        """
    )

    op.execute(
        """
        insert into system_task_template_assignees (
            template_id, user_id, created_at, next_run_at, active, updated_at
        )
        select
            t.id,
            unnest(t.assignee_ids),
            now(),
            null,
            true,
            now()
        from system_task_templates t
        where t.assignee_ids is not null
        on conflict (template_id, user_id) do nothing
        """
    )

    op.execute(
        """
        insert into system_task_template_assignees (
            template_id, user_id, created_at, next_run_at, active, updated_at
        )
        select
            t.id,
            t.default_assignee_id,
            now(),
            null,
            true,
            now()
        from system_task_templates t
        where t.assignee_ids is null
          and t.default_assignee_id is not null
        on conflict (template_id, user_id) do nothing
        """
    )


def downgrade() -> None:
    op.drop_index("uq_tasks_system_template_user_origin_run_at", table_name="tasks")
    op.drop_column("tasks", "system_outcome")
    op.drop_column("tasks", "origin_run_at")

    op.drop_index("ix_system_task_template_assignees_template_user_active", table_name="system_task_template_assignees")
    op.drop_column("system_task_template_assignees", "updated_at")
    op.drop_column("system_task_template_assignees", "active")
    op.drop_column("system_task_template_assignees", "next_run_at")

    op.drop_column("system_task_templates", "effective_to")
    op.drop_column("system_task_templates", "effective_from")
    op.drop_column("system_task_templates", "bymonthday")
    op.drop_column("system_task_templates", "byweekday")
    op.drop_column("system_task_templates", "recurrence_kind")
    op.drop_column("system_task_templates", "lookahead_days")
    op.drop_column("system_task_templates", "interval")
    op.drop_column("system_task_templates", "due_time")
    op.drop_column("system_task_templates", "start_at")
    op.drop_column("system_task_templates", "timezone")
