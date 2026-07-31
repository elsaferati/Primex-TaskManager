"""Add weekly planning audit settings, runs, and delivery history.

Revision ID: 0107_weekly_planning_audit
Revises: 0106_primeflow_report_friday_0900
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0107_weekly_planning_audit"
down_revision = "0106_primeflow_report_friday_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weekly_planning_audit_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Europe/Tirane"),
        sa.Column("recipients_to", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("recipients_cc", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("recipients_bcc", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("schedule_config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("recipient_config_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("abbreviation_version", sa.String(length=40), nullable=False, server_default="2026.1"),
        sa.Column("abbreviation_dictionary", postgresql.JSONB(), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "weekly_planning_audit_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("report_type", sa.String(length=50), nullable=False, server_default="weekly_planning_audit"),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("week_end", sa.Date(), nullable=False),
        sa.Column("slot", sa.String(length=5), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True)),
        sa.Column("generated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("trigger_type", sa.String(length=20), nullable=False, server_default="MANUAL"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="GENERATING"),
        sa.Column("included_user_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("excluded_leave_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("critical_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("high_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filename", sa.String(length=255)),
        sa.Column("file_checksum", sa.String(length=64)),
        sa.Column("storage_path", sa.Text()),
        sa.Column("recipients_snapshot", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("recipient_config_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("subject", sa.String(length=500)),
        sa.Column("message_id", sa.String(length=255)),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text()),
        sa.Column("idempotency_key", sa.String(length=180)),
        sa.Column("report_payload", postgresql.JSONB()),
        sa.Column("report_version", sa.String(length=20), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("idempotency_key", name="uq_weekly_planning_audit_run_idempotency"),
    )
    op.create_index("ix_weekly_planning_audit_runs_week_start", "weekly_planning_audit_runs", ["week_start"])
    op.create_index("ix_weekly_planning_audit_runs_slot", "weekly_planning_audit_runs", ["slot"])
    op.create_index("ix_weekly_planning_audit_runs_status", "weekly_planning_audit_runs", ["status"])

    op.create_table(
        "weekly_planning_audit_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "report_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("weekly_planning_audit_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("delivery_type", sa.String(length=20), nullable=False, server_default="INITIAL"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="SENDING"),
        sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("message_id", sa.String(length=255)),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("smtp_response", sa.Text()),
        sa.Column("error_message", sa.Text()),
        sa.Column("attachment_filename", sa.String(length=255)),
        sa.Column("report_checksum", sa.String(length=64)),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_weekly_planning_audit_deliveries_report_run_id",
        "weekly_planning_audit_deliveries",
        ["report_run_id"],
    )
    op.create_index("ix_weekly_planning_audit_deliveries_status", "weekly_planning_audit_deliveries", ["status"])

    op.execute(
        """
        INSERT INTO weekly_planning_audit_settings (
            id, enabled, timezone, recipients_to, recipients_cc, recipients_bcc,
            schedule_config, recipient_config_version, abbreviation_version, retention_days
        )
        VALUES (
            gen_random_uuid(), true, 'Europe/Tirane',
            '["130primex.eu@gmail.com", "info@primexeu.com", "ga@primexeu.com"]'::jsonb,
            '[]'::jsonb, '[]'::jsonb,
            '{"weekday": "friday", "slots": ["09:00", "09:30", "10:00", "10:30", "11:00"]}'::jsonb,
            1, '2026.1', 90
        )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_weekly_planning_audit_deliveries_status", table_name="weekly_planning_audit_deliveries")
    op.drop_index(
        "ix_weekly_planning_audit_deliveries_report_run_id",
        table_name="weekly_planning_audit_deliveries",
    )
    op.drop_table("weekly_planning_audit_deliveries")
    op.drop_index("ix_weekly_planning_audit_runs_status", table_name="weekly_planning_audit_runs")
    op.drop_index("ix_weekly_planning_audit_runs_slot", table_name="weekly_planning_audit_runs")
    op.drop_index("ix_weekly_planning_audit_runs_week_start", table_name="weekly_planning_audit_runs")
    op.drop_table("weekly_planning_audit_runs")
    op.drop_table("weekly_planning_audit_settings")
