"""add persistent ordering to GA timetable entries

Revision ID: 20260826_ga_slot_order
Revises: 20260824_today_print_report
Create Date: 2026-08-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260826_ga_slot_order"
down_revision = "20260824_today_print_report"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ga_time_slot_templates",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id, day_of_week, start_time, end_time
                    ORDER BY created_at, id
                )::integer - 1 AS position
            FROM ga_time_slot_templates
        )
        UPDATE ga_time_slot_templates AS entry
        SET sort_order = ranked.position
        FROM ranked
        WHERE entry.id = ranked.id
        """
    )


def downgrade() -> None:
    op.drop_column("ga_time_slot_templates", "sort_order")
