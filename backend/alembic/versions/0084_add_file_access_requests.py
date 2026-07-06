"""add file access requests

Revision ID: 0084_add_file_access_requests
Revises: 0083_add_plan_note_next_week
Create Date: 2026-06-25 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0084_add_file_access_requests"
down_revision = "0083_add_plan_note_next_week"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "file_access_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requester_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requester_sam_account_name", sa.String(length=64), nullable=False),
        sa.Column("folder_id", sa.Integer(), nullable=True),
        sa.Column("folder_path", sa.Text(), nullable=True),
        sa.Column("folder_name", sa.String(length=500), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("approver_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["approver_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requester_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_file_access_requests_approver_user_id", "file_access_requests", ["approver_user_id"])
    op.create_index("ix_file_access_requests_folder_id", "file_access_requests", ["folder_id"])
    op.create_index("ix_file_access_requests_requester_user_id", "file_access_requests", ["requester_user_id"])
    op.create_index("ix_file_access_requests_status", "file_access_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_file_access_requests_status", table_name="file_access_requests")
    op.drop_index("ix_file_access_requests_requester_user_id", table_name="file_access_requests")
    op.drop_index("ix_file_access_requests_folder_id", table_name="file_access_requests")
    op.drop_index("ix_file_access_requests_approver_user_id", table_name="file_access_requests")
    op.drop_table("file_access_requests")
