"""Add formatting to GA timetable row comments.

Revision ID: 20260814_ga_comment_fmt
Revises: 20260814_ga_row_comments
"""

from alembic import op
import sqlalchemy as sa


revision = "20260814_ga_comment_fmt"
down_revision = "20260814_ga_row_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ga_time_table_rows",
        sa.Column("comment_background_color", sa.String(length=7), server_default="#FFFFFF", nullable=False),
    )
    op.add_column(
        "ga_time_table_rows",
        sa.Column("comment_text_color", sa.String(length=7), server_default="#0F172A", nullable=False),
    )
    op.add_column(
        "ga_time_table_rows",
        sa.Column("comment_is_bold", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "ga_time_table_rows",
        sa.Column("comment_is_italic", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ga_time_table_rows", "comment_is_italic")
    op.drop_column("ga_time_table_rows", "comment_is_bold")
    op.drop_column("ga_time_table_rows", "comment_text_color")
    op.drop_column("ga_time_table_rows", "comment_background_color")
