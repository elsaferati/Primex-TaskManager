"""add task deadline important flag

Revision ID: 0072_add_task_deadline_important
Revises: 0071_add_ga_note_discussed
Create Date: 2026-04-20
"""

from alembic import op
import sqlalchemy as sa


revision = "0072_add_task_deadline_important"
down_revision = "0071_add_ga_note_discussed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column(
            "is_deadline_important",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("tasks", "is_deadline_important")
