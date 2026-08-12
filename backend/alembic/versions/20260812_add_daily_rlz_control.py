"""Daily Report to weekly RLZ compliance and typed report scheduling.

Revision ID: 20260812_add_daily_rlz_control
Revises: 20260812_add_tomorrow_print_report
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260812_add_daily_rlz_control"
down_revision = "20260812_add_tomorrow_print_report"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_daily_rlz_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_date", sa.Date(), nullable=False),
        sa.Column("reason_code", sa.String(40)),
        sa.Column("comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "user_id", "day_date", name="uq_task_daily_rlz_state_task_user_day"),
        sa.CheckConstraint(
            "reason_code IS NULL OR reason_code IN ('TOOK_LONGER','OTHER_URGENCY','WAITING_CLIENT','PRIORITY_CHANGE',"
            "'TECHNICAL_PROBLEM','MISSING_INFORMATION','REQUEST_CHANGE','NEW_REQUESTS','ABSENCE','OTHER')",
            name="ck_task_daily_rlz_state_reason_code",
        ),
    )
    op.create_index("ix_task_daily_rlz_state_task_id", "task_daily_rlz_states", ["task_id"])
    op.create_index("ix_task_daily_rlz_state_user_id", "task_daily_rlz_states", ["user_id"])
    op.create_index("ix_task_daily_rlz_state_day_date", "task_daily_rlz_states", ["day_date"])
    op.create_index("ix_task_daily_rlz_state_user_day", "task_daily_rlz_states", ["user_id", "day_date"])

    op.add_column("primeflow_report_schedules", sa.Column("report_type", sa.String(40), nullable=False, server_default="ONE_H"))
    op.alter_column("primeflow_report_schedules", "report_slot", existing_type=sa.String(5), nullable=True)
    op.drop_constraint("uq_primeflow_report_schedule_name", "primeflow_report_schedules", type_="unique")
    op.create_unique_constraint("uq_primeflow_report_schedule_type_name", "primeflow_report_schedules", ["report_type", "name"])
    op.add_column("primeflow_report_recipients", sa.Column("report_type", sa.String(40), nullable=False, server_default="ONE_H"))
    op.drop_constraint("uq_primeflow_report_recipient_email_type", "primeflow_report_recipients", type_="unique")
    op.create_unique_constraint("uq_primeflow_report_recipient_type_email_kind", "primeflow_report_recipients", ["report_type", "email", "recipient_type"])
    op.execute("""
        INSERT INTO primeflow_report_schedules
          (id, name, report_type, report_slot, execution_time, timezone, weekdays, is_active,
           is_default, backfill_enabled, grace_period_minutes, retry_count, retry_delays_seconds, sort_order, version)
        VALUES
          (gen_random_uuid(), 'RLZ Daily Control 16:00', 'RLZ_DAILY_CONTROL', NULL, '16:00',
           'Europe/Tirane', ARRAY[0,1,2,3,4], true, true, false, 30, 3, ARRAY[0,2,5], 100, 1)
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM primeflow_report_schedules WHERE report_type = 'RLZ_DAILY_CONTROL'")
    op.drop_constraint("uq_primeflow_report_recipient_type_email_kind", "primeflow_report_recipients", type_="unique")
    op.drop_column("primeflow_report_recipients", "report_type")
    op.create_unique_constraint("uq_primeflow_report_recipient_email_type", "primeflow_report_recipients", ["email", "recipient_type"])
    op.drop_constraint("uq_primeflow_report_schedule_type_name", "primeflow_report_schedules", type_="unique")
    op.drop_column("primeflow_report_schedules", "report_type")
    op.alter_column("primeflow_report_schedules", "report_slot", existing_type=sa.String(5), nullable=False)
    op.create_unique_constraint("uq_primeflow_report_schedule_name", "primeflow_report_schedules", ["name"])
    op.drop_table("task_daily_rlz_states")
