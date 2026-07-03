"""Add per-day 1H report slot overrides."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0086_add_task_one_h_report_slot_overrides"
down_revision = "0085_add_task_one_h_report_slot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_one_h_report_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("one_h_report_slot", sa.String(length=5), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("task_id", "report_date", name="uq_task_one_h_report_slot_task_date"),
    )
    op.create_index("ix_task_one_h_report_slots_task_id", "task_one_h_report_slots", ["task_id"])
    op.create_index("ix_task_one_h_report_slots_report_date", "task_one_h_report_slots", ["report_date"])


def downgrade() -> None:
    op.drop_index("ix_task_one_h_report_slots_report_date", table_name="task_one_h_report_slots")
    op.drop_index("ix_task_one_h_report_slots_task_id", table_name="task_one_h_report_slots")
    op.drop_table("task_one_h_report_slots")
