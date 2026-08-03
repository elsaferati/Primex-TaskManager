"""add meetings report settings

Revision ID: 20260803_add_meetings_report_settings
Revises: 20260803_add_meetings_report_recipients
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260803_add_meetings_report_settings"
down_revision = "20260803_add_meetings_report_recipients"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meetings_report_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("send_time", sa.Time(), nullable=False, server_default=sa.text("'16:30:00'")),
        sa.Column("timezone", sa.String(length=80), nullable=False, server_default="Europe/Tirane"),
        sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), nullable=False, server_default=sa.text("ARRAY[0,1,2,3,4]")),
        sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default=sa.text("""'{"to": [], "cc": [], "bcc": []}'::jsonb""")),
        sa.Column("last_run_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("meetings_report_settings")
