"""add ga time table rows

Revision ID: 0089_add_ga_time_table_rows
Revises: 0088_add_system_task_template_approval
Create Date: 2026-07-08 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0089_add_ga_time_table_rows"
down_revision = "0088_add_system_task_template_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ga_time_table_rows",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("nr_label", sa.String(length=20), server_default="", nullable=False),
        sa.Column("label", sa.String(length=60), server_default="", nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("is_special", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ga_time_table_rows_sort_order"), "ga_time_table_rows", ["sort_order"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ga_time_table_rows_sort_order"), table_name="ga_time_table_rows")
    op.drop_table("ga_time_table_rows")
