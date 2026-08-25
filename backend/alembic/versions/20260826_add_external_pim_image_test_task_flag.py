"""Add the Graphic Design PIM image test task opt-in flag.

Revision ID: 20260826_pim_image_task
Revises: 20260826_1h_send_times
Create Date: 2026-08-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260826_pim_image_task"
down_revision = "20260826_1h_send_times"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column(
            "external_pim_image_test_task_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("meetings", "external_pim_image_test_task_requested")
