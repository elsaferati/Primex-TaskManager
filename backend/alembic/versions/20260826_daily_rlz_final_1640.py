"""Move the scheduled Daily Realization FINAL report to 16:40."""

from alembic import op

revision = "20260826_daily_rlz_final_1640"
down_revision = "20260826_daily_rlz_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = '16:40',
            name = 'RLZ Daily Final 16:40',
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'RLZ_DAILY_CONTROL' AND report_variant = 'FINAL'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE primeflow_report_schedules
        SET execution_time = '16:30',
            name = 'RLZ Daily Final 16:30',
            version = version + 1,
            updated_at = now()
        WHERE report_type = 'RLZ_DAILY_CONTROL' AND report_variant = 'FINAL'
        """
    )
