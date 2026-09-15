"""Move the Today 1H SHTYPI email to 08:50.

Revision ID: 0117_today_print_report_0850
Revises: 0116_add_note_one_h_marker
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0117_today_print_report_0850"
down_revision = "0116_add_note_one_h_marker"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE today_print_report_settings SET send_time = '08:50'::time")
    op.alter_column(
        "today_print_report_settings",
        "send_time",
        existing_type=sa.Time(),
        server_default=sa.text("'08:50:00'"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute("UPDATE today_print_report_settings SET send_time = '09:00'::time")
    op.alter_column(
        "today_print_report_settings",
        "send_time",
        existing_type=sa.Time(),
        server_default=sa.text("'09:00:00'"),
        existing_nullable=False,
    )
