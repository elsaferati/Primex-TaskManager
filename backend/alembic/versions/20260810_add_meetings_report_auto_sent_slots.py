"""track automatic M3 delivery slots

Revision ID: 20260810_add_meetings_report_auto_sent_slots
Revises: 20260805_add_morning_report
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260810_add_meetings_report_auto_sent_slots"
down_revision = "20260805_add_morning_report"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings_report_drafts",
        sa.Column(
            "auto_sent_slots",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("meetings_report_drafts", "auto_sent_slots")
