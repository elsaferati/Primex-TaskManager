"""Merge task-skill and meeting-scheduler migration heads.

Revision ID: 20260904_merge_meeting_heads
Revises: 0110_task_skill_category, 20260904_meeting_improvements
"""


revision = "20260904_merge_meeting_heads"
down_revision = (
    "0110_task_skill_category",
    "20260904_meeting_improvements",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
