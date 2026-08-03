"""Restore automatic delivery before every PrimeFlow 1H slot.

Revision ID: 0108_restore_primeflow_1h_schedules
Revises: 0107_weekly_planning_audit
"""

from __future__ import annotations

from alembic import op


revision = "0108_restore_primeflow_1h_schedules"
down_revision = "0107_weekly_planning_audit"
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
        VALUES
            (gen_random_uuid(),'1H 10:00','10:00','09:00','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,NULL,30,3,ARRAY[0,2,5],10,1),
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
        UPDATE primeflow_report_schedules child
        SET predecessor_schedule_id = parent.id,
            version = child.version + 1
        FROM primeflow_report_schedules parent
        WHERE (child.name,parent.name) IN (
            ('1H 11:00','1H 10:00'),
            ('1H 11:50','1H 11:00'),
            ('1H 14:20','1H 11:50'),
            ('1H 16:00','1H 14:20')
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET report_slot = '10:00',
            execution_time = '09:00',
            timezone = 'Europe/Tirane',
            weekdays = ARRAY[4],
            is_active = true,
            is_default = true,
            backfill_enabled = false,
            predecessor_schedule_id = NULL,
            grace_period_minutes = 30,
            retry_count = 3,
            retry_delays_seconds = ARRAY[0,2,5],
            sort_order = 10,
            version = version + 1
        WHERE name = '1H 10:00'
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET is_active = false,
            is_default = false,
            predecessor_schedule_id = NULL,
            version = version + 1
        WHERE name IN ('1H 11:00', '1H 11:50', '1H 14:20', '1H 16:00')
        """
    )
