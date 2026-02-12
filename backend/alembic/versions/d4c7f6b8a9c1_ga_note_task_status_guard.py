"""ga note task status guard

Revision ID: d4c7f6b8a9c1
Revises: b1c2d3e4f5a6, cc189303e478, e25782cf9a3b
Create Date: 2026-02-12
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "d4c7f6b8a9c1"
down_revision = ("b1c2d3e4f5a6", "cc189303e478", "e25782cf9a3b")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tasks
        SET status = 'TODO'
        WHERE ga_note_origin_id IS NOT NULL
          AND (
            status IS NULL
            OR btrim(status) = ''
            OR status NOT IN ('TODO', 'IN_PROGRESS', 'DONE')
          )
        """
    )
    op.create_check_constraint(
        "ck_tasks_ga_note_status_valid",
        "tasks",
        "ga_note_origin_id IS NULL OR status IN ('TODO', 'IN_PROGRESS', 'DONE')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tasks_ga_note_status_valid", "tasks", type_="check")
