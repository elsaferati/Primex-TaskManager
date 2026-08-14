"""Add comments to GA timetable rows.

Revision ID: 20260814_ga_row_comments
Revises: 20260814_ga_slot_format
"""

from alembic import op
import sqlalchemy as sa


revision = "20260814_ga_row_comments"
down_revision = "20260814_ga_slot_format"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ga_time_table_rows",
        sa.Column("comment", sa.Text(), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ga_time_table_rows", "comment")
