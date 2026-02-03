"""add internal notes

Revision ID: 0051_add_internal_notes
Revises: 0050_add_weekly_planner_legend_entries
Create Date: 2026-02-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0051_add_internal_notes"
down_revision = "0050_add_weekly_planner_legend_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "internal_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=8000), nullable=False),
        sa.Column("from_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_department_id"], ["departments.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_internal_notes_to_department_id", "internal_notes", ["to_department_id"])
    op.create_index("ix_internal_notes_to_user_id", "internal_notes", ["to_user_id"])
    op.create_index("ix_internal_notes_from_user_id", "internal_notes", ["from_user_id"])


def downgrade() -> None:
    op.drop_index("ix_internal_notes_from_user_id", table_name="internal_notes")
    op.drop_index("ix_internal_notes_to_user_id", table_name="internal_notes")
    op.drop_index("ix_internal_notes_to_department_id", table_name="internal_notes")
    op.drop_table("internal_notes")
