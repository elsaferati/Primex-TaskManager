"""add ga department

Revision ID: 0051_add_ga_department
Revises: 0050_add_weekly_planner_legend_entries
Create Date: 2026-02-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid


revision = "0051_add_ga_department"
down_revision = "0050_add_weekly_planner_legend_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert GA department if it doesn't exist
    op.execute(
        """
        INSERT INTO departments (id, name, code, created_at)
        SELECT gen_random_uuid(), 'GA', 'GA', now()
        WHERE NOT EXISTS (
            SELECT 1 FROM departments WHERE code = 'GA'
        )
        """
    )


def downgrade() -> None:
    # Remove GA department
    op.execute(
        """
        DELETE FROM departments WHERE code = 'GA'
        """
    )
