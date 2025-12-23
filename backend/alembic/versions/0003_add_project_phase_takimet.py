"""add takimet phase to project_phase_status

Revision ID: 0003_add_project_phase_takimet
Revises: 0002_system_task_templates
Create Date: 2025-12-22
"""

from __future__ import annotations

from alembic import op


revision = "0003_add_project_phase_takimet"
down_revision = "0002_system_task_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE project_phase_status ADD VALUE IF NOT EXISTS 'TAKIMET'")
    op.execute("ALTER TABLE projects ALTER COLUMN current_phase SET DEFAULT 'TAKIMET'")


def downgrade() -> None:
    op.execute("ALTER TABLE projects ALTER COLUMN current_phase SET DEFAULT 'PLANIFIKIMI'")
