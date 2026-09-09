"""Merge the calendar-link and Open Tasks baseline migration branches.

Revision ID: 0114_merge_0113_heads
Revises: 0113_calendar_pre_meeting_link, 0113_open_task_baselines
"""

from __future__ import annotations


revision = "0114_merge_0113_heads"
down_revision = (
    "0113_calendar_pre_meeting_link",
    "0113_open_task_baselines",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
