"""Allow multiple comments in each GA timetable comment cell.

Revision ID: 20260824_ga_comment_lists
Revises: 20260817_full_note_titles
"""

from alembic import op
from sqlalchemy.dialects import postgresql
import sqlalchemy as sa


revision = "20260824_ga_comment_lists"
down_revision = "20260817_full_note_titles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ga_time_table_rows",
        sa.Column(
            "comments",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("ga_time_table_rows", "comments")
