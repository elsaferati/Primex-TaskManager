"""add the 1H SHTYPI email report

Revision ID: 20260812_add_tomorrow_print_report
Revises: 20260812_set_after_break_send_time_1320
Create Date: 2026-08-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260812_add_tomorrow_print_report"
down_revision = "20260812_set_after_break_send_time_1320"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tomorrow_print_report_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("send_time", sa.Time(), nullable=False, server_default=sa.text("'16:20:00'")),
        sa.Column("timezone", sa.String(length=80), nullable=False, server_default="Europe/Tirane"),
        sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), nullable=False, server_default=sa.text("ARRAY[0,1,2,3,4]")),
        sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default=sa.text("'{\"to\": [], \"cc\": [], \"bcc\": []}'::jsonb")),
        sa.Column("last_run_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "tomorrow_print_report_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default=sa.text("'{\"to\": [], \"cc\": [], \"bcc\": []}'::jsonb")),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="PENDING"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gmail_message_id", sa.String(length=255), nullable=True),
        sa.Column("gmail_thread_id", sa.String(length=255), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("delivery_date", name="uq_tomorrow_print_report_delivery_date"),
    )
    op.create_index("ix_tomorrow_print_report_deliveries_delivery_date", "tomorrow_print_report_deliveries", ["delivery_date"])
    op.create_index("ix_tomorrow_print_report_deliveries_target_date", "tomorrow_print_report_deliveries", ["target_date"])
    op.create_index("ix_tomorrow_print_report_deliveries_status", "tomorrow_print_report_deliveries", ["status"])
    op.execute(
        """
        INSERT INTO tomorrow_print_report_settings (id, is_active, send_time, timezone, weekdays, recipients)
        VALUES (gen_random_uuid(), true, '16:20:00', 'Europe/Tirane', ARRAY[0,1,2,3,4],
                '{"to": ["130primex.eu@gmail.com"], "cc": [], "bcc": []}'::jsonb)
        """
    )


def downgrade() -> None:
    op.drop_index("ix_tomorrow_print_report_deliveries_status", table_name="tomorrow_print_report_deliveries")
    op.drop_index("ix_tomorrow_print_report_deliveries_target_date", table_name="tomorrow_print_report_deliveries")
    op.drop_index("ix_tomorrow_print_report_deliveries_delivery_date", table_name="tomorrow_print_report_deliveries")
    op.drop_table("tomorrow_print_report_deliveries")
    op.drop_table("tomorrow_print_report_settings")
