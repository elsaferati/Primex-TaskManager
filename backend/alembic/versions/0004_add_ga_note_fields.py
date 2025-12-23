"""add ga note type, status, priority

Revision ID: 0004_add_ga_note_fields
Revises: 0003_add_project_phase_takimet
Create Date: 2025-12-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0004_add_ga_note_fields"
down_revision = "0003_add_project_phase_takimet"
branch_labels = None
depends_on = None


def upgrade() -> None:
    ga_note_type_enum = postgresql.ENUM("GA", "KA", name="ga_note_type", create_type=False)
    ga_note_status_enum = postgresql.ENUM("OPEN", "CLOSED", name="ga_note_status", create_type=False)
    ga_note_priority_enum = postgresql.ENUM(
        "LOW",
        "MEDIUM",
        "HIGH",
        "URGENT",
        name="ga_note_priority",
        create_type=False,
    )
    ga_note_type_enum.create(op.get_bind(), checkfirst=True)
    ga_note_status_enum.create(op.get_bind(), checkfirst=True)
    ga_note_priority_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "ga_notes",
        sa.Column("note_type", ga_note_type_enum, nullable=False, server_default="GA"),
    )
    op.add_column(
        "ga_notes",
        sa.Column("status", ga_note_status_enum, nullable=False, server_default="OPEN"),
    )
    op.add_column(
        "ga_notes",
        sa.Column("priority", ga_note_priority_enum, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ga_notes", "priority")
    op.drop_column("ga_notes", "status")
    op.drop_column("ga_notes", "note_type")
    ga_note_priority_enum = postgresql.ENUM(
        "LOW",
        "MEDIUM",
        "HIGH",
        "URGENT",
        name="ga_note_priority",
        create_type=False,
    )
    ga_note_status_enum = postgresql.ENUM("OPEN", "CLOSED", name="ga_note_status", create_type=False)
    ga_note_type_enum = postgresql.ENUM("GA", "KA", name="ga_note_type", create_type=False)
    ga_note_priority_enum.drop(op.get_bind(), checkfirst=True)
    ga_note_status_enum.drop(op.get_bind(), checkfirst=True)
    ga_note_type_enum.drop(op.get_bind(), checkfirst=True)
