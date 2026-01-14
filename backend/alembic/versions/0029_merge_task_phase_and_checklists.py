"""merge task phase and meeting checklists heads

Revision ID: 0029_merge_task_phase_and_checklists
Revises: 0026_set_task_phase_from_project, 0028_add_meeting_checklists
Create Date: 2026-01-13
"""

from __future__ import annotations


revision = "0029_merge_task_phase_and_checklists"
down_revision = ("0026_set_task_phase_from_project", "0028_add_meeting_checklists")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is a merge migration - no schema changes needed.
    pass


def downgrade() -> None:
    # This is a merge migration - no schema changes needed.
    pass
