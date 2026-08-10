"""add operational RLZ pulse and append-only daily close history

Revision ID: 20260810_add_realization_pulse
Revises: 20260810_add_meetings_report_auto_sent_slots
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260810_add_realization_pulse"
down_revision = "20260810_add_meetings_report_auto_sent_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "departments",
        sa.Column("realization_mode", sa.String(length=16), nullable=False, server_default="AUTO"),
    )
    op.create_check_constraint(
        "ck_departments_realization_mode",
        "departments",
        "realization_mode IN ('AUTO', 'SEMI_MANUAL', 'MANUAL')",
    )
    op.create_table(
        "realization_daily_close_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "period_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("realization_periods.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "result_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("realization_person_results.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "department_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("suggested_pulse", sa.String(length=10), nullable=False),
        sa.Column("confirmed_pulse", sa.String(length=10), nullable=True),
        sa.Column("daily_comment", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "facts_json",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "supersedes_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("realization_daily_close_events.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("action IN ('CLOSE', 'REOPEN', 'CORRECT')", name="ck_realization_daily_close_action"),
        sa.CheckConstraint("mode IN ('AUTO', 'SEMI_MANUAL', 'MANUAL')", name="ck_realization_daily_close_mode"),
        sa.CheckConstraint("suggested_pulse IN ('+', '++', 'DIAMOND', '?', 'OK')", name="ck_realization_daily_close_suggested_pulse"),
        sa.CheckConstraint("confirmed_pulse IS NULL OR confirmed_pulse IN ('+', '++', 'DIAMOND', '?', 'OK')", name="ck_realization_daily_close_confirmed_pulse"),
        sa.CheckConstraint("action = 'CLOSE' OR NULLIF(BTRIM(reason), '') IS NOT NULL", name="ck_realization_daily_close_change_reason"),
        sa.CheckConstraint("mode = 'AUTO' OR confirmed_pulse IS NOT NULL", name="ck_realization_daily_close_confirmation"),
        sa.CheckConstraint("confirmed_pulse IS NULL OR confirmed_pulse = suggested_pulse OR NULLIF(BTRIM(reason), '') IS NOT NULL", name="ck_realization_daily_close_override_reason"),
    )
    for column in ("period_id", "result_id", "user_id", "department_id", "actor_user_id"):
        op.create_index(
            f"ix_realization_daily_close_events_{column}",
            "realization_daily_close_events",
            [column],
        )
    op.create_index(
        "ix_realization_daily_close_latest",
        "realization_daily_close_events",
        ["period_id", "user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("realization_daily_close_events")
    op.drop_constraint("ck_departments_realization_mode", "departments", type_="check")
    op.drop_column("departments", "realization_mode")
