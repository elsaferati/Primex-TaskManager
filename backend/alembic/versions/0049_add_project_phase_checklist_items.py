"""add project phase checklist items

Revision ID: 0049_add_project_phase_checklist_items
Revises: 0048_add_daily_report_ga_entries
Create Date: 2026-02-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0049_add_project_phase_checklist_items"
down_revision = "0048_add_daily_report_ga_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_phase_checklist_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phase_key", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("is_checked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_project_phase_checklist_items_project_phase",
        "project_phase_checklist_items",
        ["project_id", "phase_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_project_phase_checklist_items_project_phase", table_name="project_phase_checklist_items")
    op.drop_table("project_phase_checklist_items")
