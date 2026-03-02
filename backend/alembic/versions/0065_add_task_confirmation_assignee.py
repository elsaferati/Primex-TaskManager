"""add task confirmation assignee

Revision ID: 0065_add_task_confirmation_assignee
Revises: 0064_add_ga_time_slot_templates
Create Date: 2026-02-27 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0065_add_task_confirmation_assignee"
down_revision = "0064_add_ga_time_slot_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("confirmation_assignee_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_tasks_confirmation_assignee_id_users",
        "tasks",
        "users",
        ["confirmation_assignee_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_tasks_confirmation_assignee_id"),
        "tasks",
        ["confirmation_assignee_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_confirmation_assignee_id"), table_name="tasks")
    op.drop_constraint("fk_tasks_confirmation_assignee_id_users", "tasks", type_="foreignkey")
    op.drop_column("tasks", "confirmation_assignee_id")
