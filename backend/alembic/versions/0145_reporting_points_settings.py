"""Independent editable delivery settings for the M2 and M3 reporting points."""
from datetime import time

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0145_reporting_points_settings"
down_revision = "0144_reporting_points_auto_send"
branch_labels = None
depends_on = None


def upgrade():
    table = op.create_table(
        "reporting_points_settings",
        sa.Column("report_type", sa.String(2), primary_key=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("send_time", sa.Time(), nullable=False),
        sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("recipients", postgresql.JSONB(), nullable=False),
        sa.Column("manual_recipients", postgresql.JSONB(), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.bulk_insert(table, [
        {"report_type": name, "is_active": True, "send_time": send_time,
         "weekdays": [0, 1, 2, 3, 4], "recipients": {"to": ["ga@primexeu.com", "info@primexeu.com"], "cc": [], "bcc": []}}
        for name, send_time in (("M2", time(12, 15)), ("M3", time(16, 20)))
    ])


def downgrade():
    op.drop_table("reporting_points_settings")
