"""set system task default timezone to app timezone and backfill legacy values

Revision ID: 0067_system_task_app_timezone_defaults
Revises: 0066_system_task_slot_refactor
Create Date: 2026-03-04 10:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0067_system_task_app_timezone_defaults"
down_revision = "0066_system_task_slot_refactor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "system_task_templates",
        "timezone",
        existing_type=sa.String(length=64),
        existing_nullable=False,
        server_default="Europe/Budapest",
    )
    op.execute(
        """
        UPDATE system_task_templates
        SET timezone = 'Europe/Budapest'
        WHERE timezone IS NULL
           OR timezone IN ('Europe/Tirane', 'Europe/Pristina', 'Europe/Belgrade')
        """
    )


def downgrade() -> None:
    op.alter_column(
        "system_task_templates",
        "timezone",
        existing_type=sa.String(length=64),
        existing_nullable=False,
        server_default="Europe/Tirane",
    )
    op.execute(
        """
        UPDATE system_task_templates
        SET timezone = 'Europe/Tirane'
        WHERE timezone = 'Europe/Budapest'
        """
    )
