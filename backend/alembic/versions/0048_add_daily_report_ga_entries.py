"""add daily report ga entries

Revision ID: 0048_add_daily_report_ga_entries
Revises: 0047_mark_mst_templates
Create Date: 2026-02-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0048_add_daily_report_ga_entries"
down_revision = "0047_mark_mst_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_report_ga_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("content", sa.String(length=8000), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "department_id", "entry_date", name="uq_daily_report_ga_entry"),
    )
    op.create_index("ix_daily_report_ga_entries_user_id", "daily_report_ga_entries", ["user_id"])
    op.create_index("ix_daily_report_ga_entries_department_id", "daily_report_ga_entries", ["department_id"])
    op.create_index("ix_daily_report_ga_entries_entry_date", "daily_report_ga_entries", ["entry_date"])


def downgrade() -> None:
    op.drop_index("ix_daily_report_ga_entries_entry_date", table_name="daily_report_ga_entries")
    op.drop_index("ix_daily_report_ga_entries_department_id", table_name="daily_report_ga_entries")
    op.drop_index("ix_daily_report_ga_entries_user_id", table_name="daily_report_ga_entries")
    op.drop_table("daily_report_ga_entries")
