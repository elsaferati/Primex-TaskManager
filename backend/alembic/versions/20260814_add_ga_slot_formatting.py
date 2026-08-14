"""Add per-entry formatting to the GA timetable.

Revision ID: 20260814_ga_slot_format
Revises: 20260813_add_1420_today_1h
"""

from alembic import op
import sqlalchemy as sa


revision = "20260814_ga_slot_format"
down_revision = "20260813_add_1420_today_1h"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ga_time_slot_templates",
        sa.Column("background_color", sa.String(length=7), server_default="#FFFFFF", nullable=False),
    )
    op.add_column(
        "ga_time_slot_templates",
        sa.Column("text_color", sa.String(length=7), server_default="#0F172A", nullable=False),
    )
    op.add_column(
        "ga_time_slot_templates",
        sa.Column("is_bold", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "ga_time_slot_templates",
        sa.Column("is_italic", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ga_time_slot_templates", "is_italic")
    op.drop_column("ga_time_slot_templates", "is_bold")
    op.drop_column("ga_time_slot_templates", "text_color")
    op.drop_column("ga_time_slot_templates", "background_color")
