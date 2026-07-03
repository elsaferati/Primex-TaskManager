"""Add 1H report slot to tasks."""

from alembic import op
import sqlalchemy as sa


revision = "0085_add_task_one_h_report_slot"
down_revision = "0084_add_file_access_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("one_h_report_slot", sa.String(length=5), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "one_h_report_slot")
