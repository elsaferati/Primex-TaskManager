"""create meetings table

Revision ID: 0005_create_meetings
Revises: 0004_add_ga_note_fields
Create Date: 2025-12-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0005_create_meetings"
down_revision = "0004_add_ga_note_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meetings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("platform", sa.String(length=100)),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_meetings_department_id", "meetings", ["department_id"])
    op.create_index("ix_meetings_project_id", "meetings", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_meetings_project_id", table_name="meetings")
    op.drop_index("ix_meetings_department_id", table_name="meetings")
    op.drop_table("meetings")
