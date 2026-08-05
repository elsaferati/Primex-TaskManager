"""add morning report drafts and settings

Revision ID: 20260805_add_morning_report
Revises: 20260805_external_ticket_workflow
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260805_add_morning_report"
down_revision = "20260805_external_ticket_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "morning_report_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column(
            "recipients",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("""'{"to": [], "cc": [], "bcc": []}'::jsonb"""),
        ),
        sa.Column("sections", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column(
            "generated_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="DRAFT"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gmail_message_id", sa.String(length=255), nullable=True),
        sa.Column("gmail_thread_id", sa.String(length=255), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("report_date", name="uq_morning_report_draft_report_date"),
    )
    op.create_index("ix_morning_report_drafts_report_date", "morning_report_drafts", ["report_date"])
    op.create_index("ix_morning_report_drafts_status", "morning_report_drafts", ["status"])

    op.create_table(
        "morning_report_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("send_time", sa.Time(), nullable=False, server_default=sa.text("'08:00:00'")),
        sa.Column("timezone", sa.String(length=80), nullable=False, server_default="Europe/Tirane"),
        sa.Column(
            "weekdays",
            postgresql.ARRAY(sa.Integer()),
            nullable=False,
            server_default=sa.text("ARRAY[0,1,2,3,4]"),
        ),
        sa.Column(
            "recipients",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("""'{"to": [], "cc": [], "bcc": []}'::jsonb"""),
        ),
        sa.Column("last_run_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute(
        """
        INSERT INTO morning_report_settings (id, is_active, send_time, timezone, weekdays, recipients)
        VALUES (
            gen_random_uuid(),
            true,
            '08:00:00',
            'Europe/Tirane',
            ARRAY[0,1,2,3,4],
            '{"to": ["130primex.eu@gmail.com"], "cc": [], "bcc": []}'::jsonb
        )
        """
    )


def downgrade() -> None:
    op.drop_table("morning_report_settings")
    op.drop_index("ix_morning_report_drafts_status", table_name="morning_report_drafts")
    op.drop_index("ix_morning_report_drafts_report_date", table_name="morning_report_drafts")
    op.drop_table("morning_report_drafts")
