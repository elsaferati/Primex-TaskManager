"""Rename the final 1H report slot from 16:00 to 15:50.

Revision ID: 20260817_1h_slot_1550
Revises: 20260817_daily_approvals
"""

from alembic import op


revision = "20260817_1h_slot_1550"
down_revision = "20260817_daily_approvals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE tasks SET one_h_report_slot = '15:50' WHERE one_h_report_slot = '16:00'")
    op.execute(
        "UPDATE task_one_h_report_slots "
        "SET one_h_report_slot = '15:50' WHERE one_h_report_slot = '16:00'"
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET name = CASE WHEN name = '1H 16:00' THEN '1H 15:50' ELSE name END,
            report_slot = '15:50',
            execution_time = '15:50'
        WHERE report_type = 'ONE_H' AND report_slot = '16:00'
        """
    )


def downgrade() -> None:
    op.execute("UPDATE tasks SET one_h_report_slot = '16:00' WHERE one_h_report_slot = '15:50'")
    op.execute(
        "UPDATE task_one_h_report_slots "
        "SET one_h_report_slot = '16:00' WHERE one_h_report_slot = '15:50'"
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET name = CASE WHEN name = '1H 15:50' THEN '1H 16:00' ELSE name END,
            report_slot = '16:00',
            execution_time = '15:50'
        WHERE report_type = 'ONE_H' AND report_slot = '15:50'
        """
    )
