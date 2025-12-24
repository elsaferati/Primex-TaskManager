"""add phase to tasks

Revision ID: 0007_add_task_phase
Revises: 0006_merge_heads
Create Date: 2025-12-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0007_add_task_phase"
down_revision = "0006_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    phase_enum = postgresql.ENUM(
        "TAKIMET",
        "PLANIFIKIMI",
        "ZHVILLIMI",
        "TESTIMI",
        "DOKUMENTIMI",
        "MBYLLUR",
        name="project_phase_status",
        create_type=False,
    )
    op.add_column(
        "tasks",
        sa.Column("phase", phase_enum, nullable=False, server_default="TAKIMET"),
    )
    op.execute(
        """
        UPDATE tasks
        SET phase = projects.current_phase
        FROM projects
        WHERE tasks.project_id = projects.id
        """
    )


def downgrade() -> None:
    op.drop_column("tasks", "phase")
