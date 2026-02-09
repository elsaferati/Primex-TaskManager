"""merge weekly snapshot head

Revision ID: 5a37ccaaf5a8
Revises: 0057_add_weekly_planner_snapshots, b2c7b87a2f1a
Create Date: 2026-02-09 10:46:09.806369

"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "5a37ccaaf5a8"
down_revision = ("0057_add_weekly_planner_snapshots", "b2c7b87a2f1a")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
