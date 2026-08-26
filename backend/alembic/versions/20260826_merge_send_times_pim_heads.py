"""Merge the 1H send-time and PIM image task migration heads.

Revision ID: 20260826_merge_1h_pim_heads
Revises: 20260826_updated_send_times, 20260826_pim_image_task
Create Date: 2026-08-26
"""


revision = "20260826_merge_1h_pim_heads"
down_revision = (
    "20260826_updated_send_times",
    "20260826_pim_image_task",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
