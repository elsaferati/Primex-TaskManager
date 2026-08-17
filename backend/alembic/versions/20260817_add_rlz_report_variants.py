"""Add typed Daily RLZ report variants and default schedules.

Revision ID: 20260817_rlz_variants
Revises: 20260814_ga_comment_fmt
"""

from alembic import op
import sqlalchemy as sa


revision = "20260817_rlz_variants"
down_revision = "20260814_ga_comment_fmt"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "primeflow_report_schedules",
        sa.Column("report_variant", sa.String(length=20), nullable=True),
    )
    op.create_index(
        "ix_primeflow_report_schedule_type_variant",
        "primeflow_report_schedules",
        ["report_type", "report_variant"],
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET report_variant = 'PRECHECK',
            execution_time = '16:10',
            timezone = 'Europe/Tirane',
            weekdays = ARRAY[0,1,2,3,4],
            backfill_enabled = false,
            sort_order = 100,
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'RLZ_DAILY_CONTROL'
        """
    )
    op.execute(
        """
        INSERT INTO primeflow_report_schedules
          (id, name, report_type, report_variant, report_slot, execution_time,
           timezone, weekdays, is_active, is_default, backfill_enabled,
           grace_period_minutes, retry_count, retry_delays_seconds, sort_order, version)
        SELECT
          gen_random_uuid(), 'RLZ Daily Precheck 16:10', 'RLZ_DAILY_CONTROL', 'PRECHECK', NULL,
          '16:10', 'Europe/Tirane', ARRAY[0,1,2,3,4], true, true, false,
          30, 3, ARRAY[0,2,5], 100, 1
        WHERE NOT EXISTS (
          SELECT 1 FROM primeflow_report_schedules
          WHERE report_type = 'RLZ_DAILY_CONTROL' AND report_variant = 'PRECHECK'
        )
        """
    )
    op.execute(
        """
        INSERT INTO primeflow_report_schedules
          (id, name, report_type, report_variant, report_slot, execution_time,
           timezone, weekdays, is_active, is_default, backfill_enabled,
           grace_period_minutes, retry_count, retry_delays_seconds, sort_order, version)
        VALUES
          (gen_random_uuid(), 'RLZ Daily Final 16:30', 'RLZ_DAILY_CONTROL', 'FINAL', NULL,
           '16:30', 'Europe/Tirane', ARRAY[0,1,2,3,4], true, true, false,
           30, 3, ARRAY[0,2,5], 110, 1),
          (gen_random_uuid(), 'RLZ Daily Correction 17:05', 'RLZ_DAILY_CONTROL', 'CORRECTION', NULL,
           '17:05', 'Europe/Tirane', ARRAY[0,1,2,3,4], true, true, false,
           30, 3, ARRAY[0,2,5], 120, 1)
        ON CONFLICT (report_type, name) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM primeflow_report_schedules WHERE report_type = 'RLZ_DAILY_CONTROL' "
        "AND report_variant IN ('FINAL', 'CORRECTION')"
    )
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = '16:00',
            report_variant = NULL, sort_order = 100, version = version + 1
        WHERE report_type = 'RLZ_DAILY_CONTROL'
        """
    )
    op.drop_index(
        "ix_primeflow_report_schedule_type_variant",
        table_name="primeflow_report_schedules",
    )
    op.drop_column("primeflow_report_schedules", "report_variant")
