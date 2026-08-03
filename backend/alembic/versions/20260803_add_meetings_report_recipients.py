"""add meetings report recipients

Revision ID: 20260803_add_meetings_report_recipients
Revises: 20260803_add_std_feedback_tickets
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260803_add_meetings_report_recipients"
down_revision = "20260803_add_std_feedback_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings_report_drafts",
        sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default=sa.text("""'{"to": [], "cc": [], "bcc": []}'::jsonb""")),
    )


def downgrade() -> None:
    op.drop_column("meetings_report_drafts", "recipients")
