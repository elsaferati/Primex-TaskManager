"""Update the first/final 1H and tomorrow Shtypi send times.

Revision ID: 20260826_updated_send_times
Revises: 20260826_1h_send_times
Create Date: 2026-08-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260826_updated_send_times"
down_revision = "20260826_1h_send_times"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = CASE name
                WHEN '1H 10:00' THEN '10:00'::time
                WHEN '1H 15:50' THEN '16:00'::time
                ELSE execution_time
            END,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'ONE_H'
          AND name IN ('1H 10:00', '1H 15:50')
        """
    )
    op.execute("UPDATE tasks SET one_h_report_slot = '16:00' WHERE one_h_report_slot = '15:50'")
    op.execute(
        "UPDATE task_one_h_report_slots SET one_h_report_slot = '16:00' "
        "WHERE one_h_report_slot = '15:50'"
    )
    op.execute(
        "UPDATE primeflow_report_schedules SET name = '1H 16:00', report_slot = '16:00' "
        "WHERE report_type = 'ONE_H' AND name = '1H 15:50'"
    )
    op.execute("UPDATE tomorrow_print_report_settings SET send_time = '16:30'::time")
    op.alter_column(
        "tomorrow_print_report_settings",
        "send_time",
        existing_type=sa.Time(),
        server_default=sa.text("'16:30:00'"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = CASE name
                WHEN '1H 10:00' THEN '09:00'::time
                WHEN '1H 16:00' THEN '15:50'::time
                ELSE execution_time
            END,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'ONE_H'
          AND name IN ('1H 10:00', '1H 16:00')
        """
    )
    op.execute("UPDATE tasks SET one_h_report_slot = '15:50' WHERE one_h_report_slot = '16:00'")
    op.execute(
        "UPDATE task_one_h_report_slots SET one_h_report_slot = '15:50' "
        "WHERE one_h_report_slot = '16:00'"
    )
    op.execute(
        "UPDATE primeflow_report_schedules SET name = '1H 15:50', report_slot = '15:50' "
        "WHERE report_type = 'ONE_H' AND name = '1H 16:00'"
    )
    op.execute("UPDATE tomorrow_print_report_settings SET send_time = '16:20'::time")
    op.alter_column(
        "tomorrow_print_report_settings",
        "send_time",
        existing_type=sa.Time(),
        server_default=sa.text("'16:20:00'"),
        existing_nullable=False,
    )
