"""Add PIKAT E BZ FIN JAV editable weekly report.

Revision ID: 20260903_end_week_bz
Revises: 20260903_control_ko_owner
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260903_end_week_bz"
down_revision = "20260903_control_ko_owner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_tables = set(inspector.get_table_names())

    if "end_week_bz_report_settings" not in existing_tables:
        op.create_table(
            "end_week_bz_report_settings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("send_time", sa.Time(), nullable=False),
            sa.Column("timezone", sa.String(length=80), nullable=False),
            sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), nullable=False),
            sa.Column("recipients", postgresql.JSONB(), nullable=False),
            sa.Column("last_run_date", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "end_week_bz_report_drafts" not in existing_tables:
        op.create_table(
            "end_week_bz_report_drafts",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("report_date", sa.Date(), nullable=False),
            sa.Column("subject", sa.String(length=255), nullable=False),
            sa.Column("recipients", postgresql.JSONB(), nullable=False),
            sa.Column("sections", postgresql.JSONB(), nullable=False),
            sa.Column("generated_snapshot", postgresql.JSONB(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True)),
            sa.Column("gmail_message_id", sa.String(length=255)),
            sa.Column("gmail_thread_id", sa.String(length=255)),
            sa.Column("last_error", sa.Text()),
            sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("report_date", name="uq_end_week_bz_report_draft_date"),
        )
        op.create_index("ix_end_week_bz_report_drafts_report_date", "end_week_bz_report_drafts", ["report_date"])
        op.create_index("ix_end_week_bz_report_drafts_status", "end_week_bz_report_drafts", ["status"])
    else:
        existing_indexes = {item["name"] for item in inspector.get_indexes("end_week_bz_report_drafts")}
        if "ix_end_week_bz_report_drafts_report_date" not in existing_indexes:
            op.create_index("ix_end_week_bz_report_drafts_report_date", "end_week_bz_report_drafts", ["report_date"])
        if "ix_end_week_bz_report_drafts_status" not in existing_indexes:
            op.create_index("ix_end_week_bz_report_drafts_status", "end_week_bz_report_drafts", ["status"])

    op.execute("""
        INSERT INTO end_week_bz_report_settings
            (id, is_active, send_time, timezone, weekdays, recipients)
        SELECT
            gen_random_uuid(), true, '16:30', 'Europe/Tirane', ARRAY[4]::integer[], '{"to": [], "cc": [], "bcc": []}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM end_week_bz_report_settings)
    """)


def downgrade() -> None:
    op.drop_index("ix_end_week_bz_report_drafts_status", table_name="end_week_bz_report_drafts")
    op.drop_index("ix_end_week_bz_report_drafts_report_date", table_name="end_week_bz_report_drafts")
    op.drop_table("end_week_bz_report_drafts")
    op.drop_table("end_week_bz_report_settings")
