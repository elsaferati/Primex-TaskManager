"""Seed the default Daily RLZ delivery recipients and schedule.

Revision ID: 20260813_rlz_delivery_defaults
Revises: 20260812_add_daily_rlz_control
"""

from alembic import op


revision = "20260813_rlz_delivery_defaults"
down_revision = "20260812_add_daily_rlz_control"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO primeflow_report_recipients
          (id, email, report_type, recipient_type, is_active, sort_order, is_default)
        VALUES
          (gen_random_uuid(), 'info@primexeu.com', 'RLZ_DAILY_CONTROL', 'TO', true, 10, true),
          (gen_random_uuid(), '313primex.eu@gmail.com', 'RLZ_DAILY_CONTROL', 'TO', true, 20, true)
        ON CONFLICT (report_type, email, recipient_type)
        DO UPDATE SET
          is_active = true,
          is_default = true,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
        """
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = '16:00',
            timezone = 'Europe/Tirane',
            weekdays = ARRAY[0,1,2,3,4],
            is_active = true,
            is_default = true,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'RLZ_DAILY_CONTROL'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM primeflow_report_recipients
        WHERE report_type = 'RLZ_DAILY_CONTROL'
          AND recipient_type = 'TO'
          AND email IN ('info@primexeu.com', '313primex.eu@gmail.com')
          AND is_default IS TRUE
        """
    )
