"""track automatic M1 delivery slots

Revision ID: 20260811_add_morning_report_auto_sent_slots
Revises: 20260811_merge_title_strike_head
Create Date: 2026-08-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260811_add_morning_report_auto_sent_slots"
down_revision = "20260811_merge_title_strike_head"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "morning_report_drafts",
        sa.Column(
            "auto_sent_slots",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("morning_report_drafts", "auto_sent_slots")
