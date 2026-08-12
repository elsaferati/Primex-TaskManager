"""set M2 automatic delivery time to 13:20

Revision ID: 20260812_set_after_break_send_time_1320
Revises: 20260811_add_morning_report_auto_sent_slots
Create Date: 2026-08-12
"""

from alembic import op
import sqlalchemy as sa


revision = "20260812_set_after_break_send_time_1320"
down_revision = "20260811_add_morning_report_auto_sent_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "after_break_report_settings",
        "send_time",
        existing_type=sa.Time(),
        server_default=sa.text("'13:20:00'"),
    )
    op.execute("UPDATE after_break_report_settings SET send_time = '13:20:00'")


def downgrade() -> None:
    op.execute("UPDATE after_break_report_settings SET send_time = '13:15:00' WHERE send_time = '13:20:00'")
    op.alter_column(
        "after_break_report_settings",
        "send_time",
        existing_type=sa.Time(),
        server_default=sa.text("'13:15:00'"),
    )
