"""expand task title text

Revision ID: 0074_expand_task_title_text
Revises: 0073_add_gd_development_template, 7967947b79d2
Create Date: 2026-05-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0074_expand_task_title_text"
down_revision = ("0073_add_gd_development_template", "7967947b79d2")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "tasks",
        "title",
        type_=sa.Text(),
        existing_type=sa.String(length=255),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE tasks
        SET title = LEFT(title, 255)
        WHERE length(title) > 255
        """
    )
    op.alter_column(
        "tasks",
        "title",
        type_=sa.String(length=255),
        existing_type=sa.Text(),
        existing_nullable=False,
    )
