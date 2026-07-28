"""PrimeFlow 1H management configuration and snapshots.

Revision ID: 0073_add_primeflow_report_management
Revises: 0072_add_primeflow_report_delivery_runs
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0073_add_primeflow_report_management"
down_revision = "0072_add_primeflow_report_delivery_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "primeflow_report_recipients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("recipient_type", sa.String(3), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", "recipient_type", name="uq_primeflow_report_recipient_email_type"),
    )
    op.create_table(
        "primeflow_report_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("report_slot", sa.String(5), nullable=False),
        sa.Column("execution_time", sa.Time(), nullable=False),
        sa.Column("timezone", sa.String(80), nullable=False),
        sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("backfill_enabled", sa.Boolean(), nullable=False),
        sa.Column("predecessor_schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("primeflow_report_schedules.id", ondelete="SET NULL")),
        sa.Column("grace_period_minutes", sa.Integer(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("retry_delays_seconds", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("name", name="uq_primeflow_report_schedule_name"),
    )
    op.add_column("primeflow_report_delivery_runs", sa.Column("trigger_type", sa.String(30), server_default="SCHEDULED", nullable=False))
    op.add_column("primeflow_report_delivery_runs", sa.Column("triggered_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")))
    op.add_column("primeflow_report_delivery_runs", sa.Column("manual_reason", sa.Text()))
    op.add_column("primeflow_report_delivery_runs", sa.Column("source_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("primeflow_report_delivery_runs.id", ondelete="SET NULL")))
    op.add_column("primeflow_report_delivery_runs", sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("primeflow_report_schedules.id", ondelete="SET NULL")))
    op.add_column("primeflow_report_delivery_runs", sa.Column("schedule_version", sa.Integer()))
    op.add_column("primeflow_report_delivery_runs", sa.Column("scheduled_execution_time", sa.DateTime(timezone=True)))
    op.create_table(
        "primeflow_report_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("primeflow_report_delivery_runs.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("normalized_report_json", postgresql.JSONB(), nullable=False),
        sa.Column("plain_text_body", sa.Text(), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("content_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute("""
      INSERT INTO primeflow_report_recipients
        (id,email,recipient_type,is_active,sort_order,is_default)
      VALUES
        (gen_random_uuid(),'130primex.eu@gmail.com','TO',true,10,true),
        (gen_random_uuid(),'ga@primexeu.com','TO',true,20,true)
      ON CONFLICT (email,recipient_type) DO NOTHING
    """)
    op.execute("""
      INSERT INTO primeflow_report_schedules
        (id,name,report_slot,execution_time,timezone,weekdays,is_active,is_default,backfill_enabled,
         grace_period_minutes,retry_count,retry_delays_seconds,sort_order,version)
      VALUES
        (gen_random_uuid(),'1H 10:00','10:00','09:00','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,30,3,ARRAY[0,2,5],10,1),
        (gen_random_uuid(),'1H 11:00','11:00','10:50','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,30,3,ARRAY[0,2,5],20,1),
        (gen_random_uuid(),'1H 11:50','11:50','11:40','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,30,3,ARRAY[0,2,5],30,1),
        (gen_random_uuid(),'1H 14:20','14:20','14:10','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,30,3,ARRAY[0,2,5],40,1),
        (gen_random_uuid(),'1H 16:00','16:00','15:50','Europe/Tirane',ARRAY[0,1,2,3,4],true,true,true,30,3,ARRAY[0,2,5],50,1)
      ON CONFLICT (name) DO NOTHING
    """)
    op.execute("""
      UPDATE primeflow_report_schedules child SET predecessor_schedule_id = parent.id
      FROM primeflow_report_schedules parent
      WHERE (child.name,parent.name) IN (
        ('1H 11:00','1H 10:00'),('1H 11:50','1H 11:00'),
        ('1H 14:20','1H 11:50'),('1H 16:00','1H 14:20')
      )
    """)


def downgrade() -> None:
    op.drop_table("primeflow_report_snapshots")
    for column in ("scheduled_execution_time", "schedule_version", "schedule_id", "source_run_id", "manual_reason", "triggered_by_user_id", "trigger_type"):
        op.drop_column("primeflow_report_delivery_runs", column)
    op.drop_table("primeflow_report_schedules")
    op.drop_table("primeflow_report_recipients")
