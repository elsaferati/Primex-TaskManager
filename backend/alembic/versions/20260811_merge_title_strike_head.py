"""merge title strike field with realization/task-strike branch

Revision ID: 20260811_merge_title_strike_head
Revises: 20260811_merge_realization_strike_heads, 20260810_add_task_strike_event_field
Create Date: 2026-08-11
"""

from __future__ import annotations

from collections.abc import Sequence


revision = "20260811_merge_title_strike_head"
down_revision: str | tuple[str, str] | None = (
    "20260811_merge_realization_strike_heads",
    "20260810_add_task_strike_event_field",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Join the independently added title-strike migration into one head."""


def downgrade() -> None:
    """Split back to the two parent heads without changing schema."""
