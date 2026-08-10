"""Merge Realization review and task strike migration heads.

Revision ID: 20260811_merge_realization_strike_heads
Revises: 20260811_add_realization_review_answers, 20260810_add_task_strike_events
Create Date: 2026-08-11
"""

from __future__ import annotations

from collections.abc import Sequence


revision = "20260811_merge_realization_strike_heads"
down_revision: str | tuple[str, str] | None = (
    "20260811_add_realization_review_answers",
    "20260810_add_task_strike_events",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Join the two schema branches; both parent migrations own their changes."""


def downgrade() -> None:
    """Split back to the two parent heads without changing either schema."""
