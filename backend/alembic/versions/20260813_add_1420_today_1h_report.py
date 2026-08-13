"""Add the 14:20 today-so-far PrimeFlow 1H report.

Revision ID: 20260813_add_1420_today_1h
Revises: 20260813_rlz_delivery_defaults
"""

from alembic import op


revision = "20260813_add_1420_today_1h"
down_revision = "20260813_rlz_delivery_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The existing 14:20 task-bucket report is sent at 14:10. Give that
    # delivery its actual send-slot identity, freeing 14:20 for today's digest.
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET name = '1H 14:10',
            report_slot = '14:10',
            execution_time = '14:10',
            sort_order = 40,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'ONE_H' AND name = '1H 14:20'
        """
    )
    op.execute(
        """
        INSERT INTO primeflow_report_schedules (
            id, name, report_type, report_slot, execution_time, timezone, weekdays,
            is_active, is_default, backfill_enabled, predecessor_schedule_id,
            grace_period_minutes, retry_count, retry_delays_seconds, sort_order, version
        )
        VALUES (
            gen_random_uuid(), '1H Today 14:20', 'ONE_H', '14:20', '14:20',
            'Europe/Tirane', ARRAY[0,1,2,3,4], true, true, true, NULL,
            30, 3, ARRAY[0,2,5], 50, 1
        )
        ON CONFLICT (report_type, name) DO UPDATE SET
            report_slot = EXCLUDED.report_slot,
            execution_time = EXCLUDED.execution_time,
            timezone = EXCLUDED.timezone,
            weekdays = EXCLUDED.weekdays,
            is_active = true,
            is_default = true,
            backfill_enabled = true,
            grace_period_minutes = EXCLUDED.grace_period_minutes,
            retry_count = EXCLUDED.retry_count,
            retry_delays_seconds = EXCLUDED.retry_delays_seconds,
            sort_order = EXCLUDED.sort_order,
            version = primeflow_report_schedules.version + 1,
            updated_at = now()
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules child
        SET predecessor_schedule_id = parent.id,
            version = child.version + 1,
            updated_at = now()
        FROM primeflow_report_schedules parent
        WHERE child.report_type = 'ONE_H'
          AND parent.report_type = 'ONE_H'
          AND (child.name, parent.name) IN (
            ('1H 14:10', '1H 11:50'),
            ('1H Today 14:20', '1H 14:10'),
            ('1H 16:00', '1H Today 14:20')
          )
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET sort_order = 60, version = version + 1, updated_at = now()
        WHERE report_type = 'ONE_H' AND name = '1H 16:00'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM primeflow_report_schedules
        WHERE report_type = 'ONE_H' AND name = '1H Today 14:20'
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET name = '1H 14:20',
            report_slot = '14:20',
            execution_time = '14:10',
            sort_order = 40,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'ONE_H' AND name = '1H 14:10'
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules child
        SET predecessor_schedule_id = parent.id,
            version = child.version + 1,
            updated_at = now()
        FROM primeflow_report_schedules parent
        WHERE child.report_type = 'ONE_H'
          AND parent.report_type = 'ONE_H'
          AND (child.name, parent.name) = ('1H 16:00', '1H 14:20')
        """
    )
