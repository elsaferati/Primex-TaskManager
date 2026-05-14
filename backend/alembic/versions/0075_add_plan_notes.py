"""add plan_notes, plan_note_attachments, tasks.plan_note_origin_id

Revision ID: 0075_add_plan_notes
Revises: 0074_expand_task_title_text
Create Date: 2026-05-14
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0075_add_plan_notes"
down_revision = "0074_expand_task_title_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    ga_note_type_enum = postgresql.ENUM("GA", "KA", name="ga_note_type", create_type=False)
    ga_note_status_enum = postgresql.ENUM("OPEN", "CLOSED", name="ga_note_status", create_type=False)
    ga_note_priority_enum = postgresql.ENUM("NORMAL", "HIGH", name="ga_note_priority", create_type=False)

    op.create_table(
        "plan_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note_type", ga_note_type_enum, nullable=False, server_default="GA"),
        sa.Column("status", ga_note_status_enum, nullable=False, server_default="OPEN"),
        sa.Column("priority", ga_note_priority_enum, nullable=True),
        sa.Column(
            "start_date",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_converted_to_task", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_discussed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("planned_for_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
    )

    op.create_table(
        "plan_note_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["note_id"], ["plan_notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_plan_note_attachments_note_id", "plan_note_attachments", ["note_id"])

    op.add_column(
        "tasks",
        sa.Column("plan_note_origin_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_tasks_plan_note_origin_id_plan_notes",
        "tasks",
        "plan_notes",
        ["plan_note_origin_id"],
        ["id"],
    )
    op.create_index("ix_tasks_plan_note_origin_id", "tasks", ["plan_note_origin_id"])


def downgrade() -> None:
    op.drop_index("ix_tasks_plan_note_origin_id", table_name="tasks")
    op.drop_constraint("fk_tasks_plan_note_origin_id_plan_notes", "tasks", type_="foreignkey")
    op.drop_column("tasks", "plan_note_origin_id")

    op.drop_index("ix_plan_note_attachments_note_id", table_name="plan_note_attachments")
    op.drop_table("plan_note_attachments")
    op.drop_table("plan_notes")
