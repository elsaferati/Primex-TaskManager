"""Align weekday 1H delivery times and keep both afternoon reports.

Revision ID: 20260826_1h_send_times
Revises: 20260826_ga_slot_order
Create Date: 2026-08-26
"""

from alembic import op


revision = "20260826_1h_send_times"
down_revision = "20260826_ga_slot_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = CASE name
                WHEN '1H 11:00' THEN '11:00'::time
                WHEN '1H 11:50' THEN '11:50'::time
                WHEN '1H 14:10' THEN '14:20'::time
                WHEN '1H Today 14:20' THEN '14:20'::time
                ELSE execution_time
            END,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'ONE_H'
          AND name IN ('1H 11:00', '1H 11:50', '1H 14:10', '1H Today 14:20')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = CASE name
                WHEN '1H 11:00' THEN '10:50'::time
                WHEN '1H 11:50' THEN '11:40'::time
                WHEN '1H 14:10' THEN '14:10'::time
                WHEN '1H Today 14:20' THEN '14:20'::time
                ELSE execution_time
            END,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'ONE_H'
          AND name IN ('1H 11:00', '1H 11:50', '1H 14:10', '1H Today 14:20')
        """
    )
