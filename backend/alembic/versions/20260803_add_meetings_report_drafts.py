"""add meetings report drafts

Revision ID: 20260803_add_meetings_report_drafts
Revises: 0108_restore_primeflow_1h_schedules
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260803_add_meetings_report_drafts"
down_revision = "0108_restore_primeflow_1h_schedules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meetings_report_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("tomorrow_date", sa.Date(), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("sections", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generated_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gmail_message_id", sa.String(length=255), nullable=True),
        sa.Column("gmail_thread_id", sa.String(length=255), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("report_date", name="uq_meetings_report_draft_report_date"),
    )
    op.create_index("ix_meetings_report_drafts_report_date", "meetings_report_drafts", ["report_date"])
    op.create_index("ix_meetings_report_drafts_status", "meetings_report_drafts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_meetings_report_drafts_status", table_name="meetings_report_drafts")
    op.drop_index("ix_meetings_report_drafts_report_date", table_name="meetings_report_drafts")
    op.drop_table("meetings_report_drafts")
