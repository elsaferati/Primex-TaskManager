"""initial

Revision ID: 0001_initial
Revises:
Create Date: 2025-12-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role_enum = sa.Enum("admin", "manager", "staff", name="user_role")
    task_type_enum = sa.Enum("adhoc", "system", "reminder", name="task_type")
    template_recurrence_enum = sa.Enum("daily", "weekly", "monthly", "yearly", name="template_recurrence")
    common_category_enum = sa.Enum(
        "Delays",
        "Absences",
        "Annual Leave",
        "Blocks",
        "External Tasks",
        "Complaints",
        "Requests",
        "Proposals",
        name="common_category",
    )
    common_approval_status_enum = sa.Enum("pending", "approved", "rejected", name="common_approval_status")
    notification_type_enum = sa.Enum(
        "assignment",
        "status_change",
        "overdue",
        "mention",
        "reminder",
        name="notification_type",
    )

    op.create_table(
        "departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    user_role_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("full_name", sa.String(length=200)),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True)),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "boards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_boards_department_id", "boards", ["department_id"])

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("board_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_projects_board_id", "projects", ["board_id"])

    op.create_table(
        "task_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_done", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_task_statuses_department_id", "task_statuses", ["department_id"])

    task_type_enum.create(op.get_bind(), checkfirst=True)
    template_recurrence_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "task_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("board_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True)),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.String(length=4000)),
        sa.Column("recurrence", template_recurrence_enum, nullable=False),
        sa.Column("default_status_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["default_status_id"], ["task_statuses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_task_templates_department_id", "task_templates", ["department_id"])
    op.create_index("ix_task_templates_board_id", "task_templates", ["board_id"])
    op.create_index("ix_task_templates_project_id", "task_templates", ["project_id"])
    op.create_index("ix_task_templates_assigned_to_user_id", "task_templates", ["assigned_to_user_id"])
    op.create_index("ix_task_templates_created_by_user_id", "task_templates", ["created_by_user_id"])

    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("board_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.String(length=8000)),
        sa.Column("task_type", task_type_enum, nullable=False),
        sa.Column("status_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("planned_for", sa.Date(), nullable=True),
        sa.Column("is_carried_over", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("carried_over_from", sa.Date(), nullable=True),
        sa.Column("is_milestone", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("reminder_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("next_reminder_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("overdue_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["status_id"], ["task_statuses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["template_id"], ["task_templates.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_tasks_department_id", "tasks", ["department_id"])
    op.create_index("ix_tasks_board_id", "tasks", ["board_id"])
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_status_id", "tasks", ["status_id"])
    op.create_index("ix_tasks_assigned_to_user_id", "tasks", ["assigned_to_user_id"])
    op.create_index("ix_tasks_created_by_user_id", "tasks", ["created_by_user_id"])
    op.create_index("ix_tasks_planned_for", "tasks", ["planned_for"])
    op.create_index("ix_tasks_next_reminder_at", "tasks", ["next_reminder_at"])
    op.create_index("ix_tasks_template_id", "tasks", ["template_id"])

    op.create_table(
        "task_template_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_key", sa.Date(), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["task_templates.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("template_id", "run_key", name="uq_template_run"),
    )
    op.create_index("ix_task_template_runs_template_id", "task_template_runs", ["template_id"])
    op.create_index("ix_task_template_runs_run_key", "task_template_runs", ["run_key"])
    op.create_index("ix_task_template_runs_task_id", "task_template_runs", ["task_id"])

    common_category_enum.create(op.get_bind(), checkfirst=True)
    common_approval_status_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "common_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("category", common_category_enum, nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.String(length=8000)),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("approval_status", common_approval_status_enum, nullable=False),
        sa.Column("approved_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("rejected_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("rejected_at", sa.DateTime(timezone=True)),
        sa.Column("rejection_reason", sa.String(length=1000)),
        sa.Column("generated_task_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["generated_task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["rejected_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_common_entries_category", "common_entries", ["category"])
    op.create_index("ix_common_entries_approval_status", "common_entries", ["approval_status"])
    op.create_index("ix_common_entries_created_by_user_id", "common_entries", ["created_by_user_id"])
    op.create_index("ix_common_entries_assigned_to_user_id", "common_entries", ["assigned_to_user_id"])
    op.create_index("ix_common_entries_approved_by_user_id", "common_entries", ["approved_by_user_id"])
    op.create_index("ix_common_entries_rejected_by_user_id", "common_entries", ["rejected_by_user_id"])
    op.create_index("ix_common_entries_generated_task_id", "common_entries", ["generated_task_id"])

    notification_type_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", notification_type_enum, nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.String(length=4000)),
        sa.Column("data", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_type", "notifications", ["type"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("before", postgresql.JSONB()),
        sa.Column("after", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])


def downgrade() -> None:
    user_role_enum = sa.Enum("admin", "manager", "staff", name="user_role")
    task_type_enum = sa.Enum("adhoc", "system", "reminder", name="task_type")
    template_recurrence_enum = sa.Enum("daily", "weekly", "monthly", "yearly", name="template_recurrence")
    common_category_enum = sa.Enum(
        "Delays",
        "Absences",
        "Annual Leave",
        "Blocks",
        "External Tasks",
        "Complaints",
        "Requests",
        "Proposals",
        name="common_category",
    )
    common_approval_status_enum = sa.Enum("pending", "approved", "rejected", name="common_approval_status")
    notification_type_enum = sa.Enum(
        "assignment",
        "status_change",
        "overdue",
        "mention",
        "reminder",
        name="notification_type",
    )

    op.drop_index("ix_audit_logs_entity_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_entity_type", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_notifications_type", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
    notification_type_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_common_entries_generated_task_id", table_name="common_entries")
    op.drop_index("ix_common_entries_rejected_by_user_id", table_name="common_entries")
    op.drop_index("ix_common_entries_approved_by_user_id", table_name="common_entries")
    op.drop_index("ix_common_entries_assigned_to_user_id", table_name="common_entries")
    op.drop_index("ix_common_entries_created_by_user_id", table_name="common_entries")
    op.drop_index("ix_common_entries_approval_status", table_name="common_entries")
    op.drop_index("ix_common_entries_category", table_name="common_entries")
    op.drop_table("common_entries")
    common_approval_status_enum.drop(op.get_bind(), checkfirst=True)
    common_category_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_task_template_runs_task_id", table_name="task_template_runs")
    op.drop_index("ix_task_template_runs_run_key", table_name="task_template_runs")
    op.drop_index("ix_task_template_runs_template_id", table_name="task_template_runs")
    op.drop_table("task_template_runs")

    op.drop_index("ix_tasks_template_id", table_name="tasks")
    op.drop_index("ix_tasks_next_reminder_at", table_name="tasks")
    op.drop_index("ix_tasks_planned_for", table_name="tasks")
    op.drop_index("ix_tasks_created_by_user_id", table_name="tasks")
    op.drop_index("ix_tasks_assigned_to_user_id", table_name="tasks")
    op.drop_index("ix_tasks_status_id", table_name="tasks")
    op.drop_index("ix_tasks_project_id", table_name="tasks")
    op.drop_index("ix_tasks_board_id", table_name="tasks")
    op.drop_index("ix_tasks_department_id", table_name="tasks")
    op.drop_table("tasks")

    op.drop_index("ix_task_templates_created_by_user_id", table_name="task_templates")
    op.drop_index("ix_task_templates_assigned_to_user_id", table_name="task_templates")
    op.drop_index("ix_task_templates_project_id", table_name="task_templates")
    op.drop_index("ix_task_templates_board_id", table_name="task_templates")
    op.drop_index("ix_task_templates_department_id", table_name="task_templates")
    op.drop_table("task_templates")
    template_recurrence_enum.drop(op.get_bind(), checkfirst=True)
    task_type_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_task_statuses_department_id", table_name="task_statuses")
    op.drop_table("task_statuses")

    op.drop_index("ix_projects_board_id", table_name="projects")
    op.drop_table("projects")

    op.drop_index("ix_boards_department_id", table_name="boards")
    op.drop_table("boards")

    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    user_role_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_table("departments")
