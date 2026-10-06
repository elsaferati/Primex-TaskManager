"""Store M2 reporting points, manual reorganization and task delivery answers."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0143_m2_reporting_points"
down_revision = "0142_m3_reporting_points"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "m2_reporting_points_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("report_date", sa.Date(), nullable=False, unique=True),
        sa.Column("manual_answers", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("generated_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("gmail_message_id", sa.String(255)),
        sa.Column("last_error", sa.Text()),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("m2_reporting_points_reports")
