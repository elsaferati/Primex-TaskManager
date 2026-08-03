"""add std feedback tickets

Revision ID: 20260803_add_std_feedback_tickets
Revises: 20260803_add_meeting_occurrence_statuses
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260803_add_std_feedback_tickets"
down_revision = "20260803_add_meeting_occurrence_statuses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "std_feedback_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("issue_number", sa.Integer(), nullable=True),
        sa.Column("order_ticket_number", sa.String(length=100), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("affected_fields", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("priority", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("reporter_username", sa.String(length=255), nullable=True),
        sa.Column("reporter_email", sa.String(length=255), nullable=True),
        sa.Column("assigned_admin", sa.String(length=255), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("external_id", name="uq_std_feedback_tickets_external_id"),
    )
    op.create_index("ix_std_feedback_tickets_external_id", "std_feedback_tickets", ["external_id"])
    op.create_index("ix_std_feedback_tickets_issue_number", "std_feedback_tickets", ["issue_number"])
    op.create_index("ix_std_feedback_tickets_order_ticket_number", "std_feedback_tickets", ["order_ticket_number"])
    op.create_index("ix_std_feedback_tickets_reported_at", "std_feedback_tickets", ["reported_at"])
    op.create_index("ix_std_feedback_tickets_source_updated_at", "std_feedback_tickets", ["source_updated_at"])
    op.create_index("ix_std_feedback_tickets_status", "std_feedback_tickets", ["status"])


def downgrade() -> None:
    op.drop_index("ix_std_feedback_tickets_status", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_source_updated_at", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_reported_at", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_order_ticket_number", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_issue_number", table_name="std_feedback_tickets")
    op.drop_index("ix_std_feedback_tickets_external_id", table_name="std_feedback_tickets")
    op.drop_table("std_feedback_tickets")
