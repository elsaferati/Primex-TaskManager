"""complete the STD external-ticket sync and review workflow

Revision ID: 20260805_external_ticket_workflow
Revises: 20260804_realization_automation
Create Date: 2026-08-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260805_external_ticket_workflow"
down_revision = "20260804_realization_automation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("std_feedback_tickets", sa.Column("dashboard_area", sa.String(length=100)))
    op.add_column("std_feedback_tickets", sa.Column("creator_id", sa.String(length=100)))
    op.add_column("std_feedback_tickets", sa.Column("closed_by", sa.String(length=255)))
    op.add_column("std_feedback_tickets", sa.Column("related_order_id", sa.String(length=100)))
    op.add_column(
        "std_feedback_tickets",
        sa.Column("order_snapshot_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column("std_feedback_tickets", sa.Column("comment_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("std_feedback_tickets", sa.Column("file_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("std_feedback_tickets", sa.Column("is_external", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column(
        "std_feedback_tickets",
        sa.Column("review_status", sa.String(length=30), nullable=False, server_default="PENDING"),
    )
    op.add_column("std_feedback_tickets", sa.Column("review_note", sa.Text()))
    op.add_column("std_feedback_tickets", sa.Column("reviewed_by", postgresql.UUID(as_uuid=True)))
    op.add_column("std_feedback_tickets", sa.Column("reviewed_at", sa.DateTime(timezone=True)))
    op.add_column("std_feedback_tickets", sa.Column("ga_note_id", postgresql.UUID(as_uuid=True)))
    op.add_column("std_feedback_tickets", sa.Column("task_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_std_feedback_tickets_reviewed_by_users", "std_feedback_tickets", "users", ["reviewed_by"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_std_feedback_tickets_ga_note_id_ga_notes", "std_feedback_tickets", "ga_notes", ["ga_note_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_std_feedback_tickets_task_id_tasks", "std_feedback_tickets", "tasks", ["task_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_std_feedback_tickets_is_external", "std_feedback_tickets", ["is_external"])
    op.create_index("ix_std_feedback_tickets_review_status", "std_feedback_tickets", ["review_status"])
    op.create_index("ix_std_feedback_tickets_ga_note_id", "std_feedback_tickets", ["ga_note_id"])
    op.create_index("ix_std_feedback_tickets_task_id", "std_feedback_tickets", ["task_id"])

    op.create_table(
        "std_feedback_sync_state",
        sa.Column("key", sa.String(length=50), primary_key=True),
        sa.Column("after_updated_at", sa.DateTime(timezone=True)),
        sa.Column("after_id", sa.String(length=100)),
        sa.Column("last_successful_sync_at", sa.DateTime(timezone=True)),
        sa.Column("last_sync_error", sa.Text()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute("INSERT INTO std_feedback_sync_state (key) VALUES ('default') ON CONFLICT (key) DO NOTHING")


def downgrade() -> None:
    op.drop_table("std_feedback_sync_state")
    op.drop_index("ix_std_feedback_tickets_task_id", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_ga_note_id", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_review_status", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_is_external", table_name="std_feedback_tickets")
    op.drop_constraint("fk_std_feedback_tickets_task_id_tasks", "std_feedback_tickets", type_="foreignkey")
    op.drop_constraint("fk_std_feedback_tickets_ga_note_id_ga_notes", "std_feedback_tickets", type_="foreignkey")
    op.drop_constraint("fk_std_feedback_tickets_reviewed_by_users", "std_feedback_tickets", type_="foreignkey")
    for column in (
        "task_id", "ga_note_id", "reviewed_at", "reviewed_by", "review_note", "review_status",
        "is_external", "file_count", "comment_count", "order_snapshot_json", "related_order_id",
        "closed_by", "creator_id", "dashboard_area",
    ):
        op.drop_column("std_feedback_tickets", column)
