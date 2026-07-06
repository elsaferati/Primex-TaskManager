"""Remove retired 1H report slots."""

from alembic import op


revision = "0087_remove_retired_one_h_report_slots"
down_revision = "0086_add_task_one_h_report_slot_overrides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE tasks SET one_h_report_slot = NULL WHERE one_h_report_slot IN ('08:50', '16:00')")
    op.execute("DELETE FROM task_one_h_report_slots WHERE one_h_report_slot IN ('08:50', '16:00')")


def downgrade() -> None:
    pass
