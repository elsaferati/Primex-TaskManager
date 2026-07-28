"""sync question edit counts with recorded history

Revision ID: 0100_sync_question_edit_counts
Revises: 0099_question_edit_history
Create Date: 2026-07-28
"""

from __future__ import annotations

from alembic import op


revision = "0100_sync_question_edit_counts"
down_revision = "0099_question_edit_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE question_definitions AS question
        SET edit_count = (
            SELECT COUNT(*)
            FROM question_edit_events AS event
            WHERE event.question_id = question.id
        )
        """
    )


def downgrade() -> None:
    pass
