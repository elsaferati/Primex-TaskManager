"""Schedule the PrimeFlow report once per week on Friday at 09:00.

Revision ID: 0106_primeflow_report_friday_0900
Revises: 0105_merge_realization_batches
"""

from __future__ import annotations

from alembic import op


revision = "0106_primeflow_report_friday_0900"
down_revision = "0105_merge_realization_batches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO primeflow_report_schedules (
            id, name, report_slot, execution_time, timezone, weekdays,
            is_active, is_default, backfill_enabled, predecessor_schedule_id,
            grace_period_minutes, retry_count, retry_delays_seconds, sort_order, version
        )
        VALUES (
            gen_random_uuid(), '1H 10:00', '10:00', '09:00', 'Europe/Tirane', ARRAY[4],
            true, true, false, NULL, 30, 3, ARRAY[0,2,5], 10, 1
        )
        ON CONFLICT (name) DO UPDATE SET
            report_slot = EXCLUDED.report_slot,
            execution_time = EXCLUDED.execution_time,
            timezone = EXCLUDED.timezone,
            weekdays = EXCLUDED.weekdays,
            is_active = EXCLUDED.is_active,
            is_default = EXCLUDED.is_default,
            backfill_enabled = EXCLUDED.backfill_enabled,
            predecessor_schedule_id = NULL,
            grace_period_minutes = EXCLUDED.grace_period_minutes,
            retry_count = EXCLUDED.retry_count,
            retry_delays_seconds = EXCLUDED.retry_delays_seconds,
            sort_order = EXCLUDED.sort_order,
            version = primeflow_report_schedules.version + 1
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET is_active = false,
            is_default = false,
            version = version + 1
        WHERE name <> '1H 10:00'
          AND (is_active IS TRUE OR is_default IS TRUE)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO primeflow_report_schedules (
            id, name, report_slot, execution_time, timezone, weekdays,
            is_active, is_default, backfill_enabled, predecessor_schedule_id,
            grace_period_minutes, retry_count, retry_delays_seconds, sort_order, version
        )
        VALUES
            (gen_random_uuid(),'1H 11:00','11:00','10:50','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,NULL,30,3,ARRAY[0,2,5],20,1),
            (gen_random_uuid(),'1H 11:50','11:50','11:40','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,NULL,30,3,ARRAY[0,2,5],30,1),
            (gen_random_uuid(),'1H 14:20','14:20','14:10','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,NULL,30,3,ARRAY[0,2,5],40,1),
            (gen_random_uuid(),'1H 16:00','16:00','15:50','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,NULL,30,3,ARRAY[0,2,5],50,1)
        ON CONFLICT (name) DO UPDATE SET
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
            version = primeflow_report_schedules.version + 1
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = '09:00',
            weekdays = ARRAY[0,1,2,3,4],
            is_active = true,
            is_default = true,
            backfill_enabled = true,
            version = version + 1
        WHERE name = '1H 10:00'
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules child
        SET predecessor_schedule_id = parent.id
        FROM primeflow_report_schedules parent
        WHERE (child.name,parent.name) IN (
            ('1H 11:00','1H 10:00'),('1H 11:50','1H 11:00'),
            ('1H 14:20','1H 11:50'),('1H 16:00','1H 14:20')
        )
        """
    )
