"""Track daily automatic delivery separately from manual M2/M3 sends."""
from alembic import op
import sqlalchemy as sa

revision = "0144_reporting_points_auto_send"
down_revision = "0143_m2_reporting_points"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("m2_reporting_points_reports", "m3_reporting_points_reports"):
        op.add_column(table, sa.Column("auto_sent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for table in ("m3_reporting_points_reports", "m2_reporting_points_reports"):
        op.drop_column(table, "auto_sent_at")
