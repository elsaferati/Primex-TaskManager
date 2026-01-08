"""add common problems category

Revision ID: 0019_add_common_problems
Revises: 0018_add_task_dependency
Create Date: 2026-01-08
"""

from __future__ import annotations

from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0019_add_common_problems"
down_revision = "0018_add_task_dependency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE common_category ADD VALUE IF NOT EXISTS 'Problems'")


def downgrade() -> None:
    old_enum = postgresql.ENUM(
        "Delays",
        "Absences",
        "Annual Leave",
        "Blocks",
        "External Tasks",
        "Complaints",
        "Requests",
        "Proposals",
        name="common_category_old",
    )
    old_enum.create(op.get_bind(), checkfirst=True)
    op.execute(
        "ALTER TABLE common_entries "
        "ALTER COLUMN category TYPE common_category_old "
        "USING (CASE "
        "WHEN category::text = 'Problems' THEN 'Requests' "
        "ELSE category::text "
        "END)::common_category_old"
    )
    op.execute("DROP TYPE common_category")
    op.execute("ALTER TYPE common_category_old RENAME TO common_category")
