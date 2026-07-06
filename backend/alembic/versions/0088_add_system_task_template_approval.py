"""add approval fields to system task templates

Revision ID: 0088_add_system_task_template_approval
Revises: 0087_remove_retired_one_h_report_slots
Create Date: 2026-07-06 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0088_add_system_task_template_approval"
down_revision = "0087_remove_retired_one_h_report_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    approval_status_enum = postgresql.ENUM(
        "pending",
        "approved",
        "rejected",
        name="common_approval_status",
        create_type=False,
    )
    op.add_column(
        "system_task_templates",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "system_task_templates",
        sa.Column(
            "approval_status",
            approval_status_enum,
            server_default="approved",
            nullable=False,
        ),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("approved_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("rejected_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("rejection_reason", sa.String(length=1000), nullable=True),
    )

    op.create_foreign_key(
        "fk_system_task_templates_created_by_user_id_users",
        "system_task_templates",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_system_task_templates_approved_by_user_id_users",
        "system_task_templates",
        "users",
        ["approved_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_system_task_templates_rejected_by_user_id_users",
        "system_task_templates",
        "users",
        ["rejected_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_system_task_templates_created_by_user_id",
        "system_task_templates",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_system_task_templates_approval_status",
        "system_task_templates",
        ["approval_status"],
    )
    op.create_index(
        "ix_system_task_templates_approved_by_user_id",
        "system_task_templates",
        ["approved_by_user_id"],
    )
    op.create_index(
        "ix_system_task_templates_rejected_by_user_id",
        "system_task_templates",
        ["rejected_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_system_task_templates_rejected_by_user_id", table_name="system_task_templates")
    op.drop_index("ix_system_task_templates_approved_by_user_id", table_name="system_task_templates")
    op.drop_index("ix_system_task_templates_approval_status", table_name="system_task_templates")
    op.drop_index("ix_system_task_templates_created_by_user_id", table_name="system_task_templates")
    op.drop_constraint(
        "fk_system_task_templates_rejected_by_user_id_users",
        "system_task_templates",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_system_task_templates_approved_by_user_id_users",
        "system_task_templates",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_system_task_templates_created_by_user_id_users",
        "system_task_templates",
        type_="foreignkey",
    )
    op.drop_column("system_task_templates", "rejection_reason")
    op.drop_column("system_task_templates", "rejected_at")
    op.drop_column("system_task_templates", "rejected_by_user_id")
    op.drop_column("system_task_templates", "approved_at")
    op.drop_column("system_task_templates", "approved_by_user_id")
    op.drop_column("system_task_templates", "approval_status")
    op.drop_column("system_task_templates", "created_by_user_id")
