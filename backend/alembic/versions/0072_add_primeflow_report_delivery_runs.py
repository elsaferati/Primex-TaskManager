"""Add persistent PrimeFlow 1H report delivery history.

Revision ID: 0072_add_primeflow_report_delivery_runs
Revises: 0071_add_ga_note_discussed
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0072_add_primeflow_report_delivery_runs"
down_revision = "0071_add_ga_note_discussed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "primeflow_report_delivery_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("report_type", sa.String(40), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("report_slot", sa.String(5), nullable=False),
        sa.Column("recipient_group", sa.String(40), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("data_generated_at", sa.DateTime(timezone=True)),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("recipients", sa.Text(), nullable=False),
        sa.Column("body_hash", sa.String(64)),
        sa.Column("gmail_message_id", sa.String(255)),
        sa.Column("gmail_thread_id", sa.String(255)),
        sa.Column("error_code", sa.String(80)),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "report_type", "report_date", "report_slot", "recipient_group",
            name="uq_primeflow_report_delivery_run_key",
        ),
    )
    op.create_index("ix_primeflow_report_delivery_runs_status", "primeflow_report_delivery_runs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_primeflow_report_delivery_runs_status", table_name="primeflow_report_delivery_runs")
    op.drop_table("primeflow_report_delivery_runs")
