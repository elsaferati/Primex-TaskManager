"""Restore complete note content in linked task titles.

Revision ID: 20260817_full_note_titles
Revises: 20260817_1h_slot_1550
"""

from alembic import op


revision = "20260817_full_note_titles"
down_revision = "20260817_1h_slot_1550"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tasks AS task
        SET title = BTRIM(REPLACE(REPLACE(note.content, CHR(13) || CHR(10), CHR(10)), CHR(13), CHR(10)))
        FROM ga_notes AS note
        WHERE task.ga_note_origin_id = note.id
          AND NULLIF(BTRIM(note.content), '') IS NOT NULL
          AND task.title IS DISTINCT FROM BTRIM(REPLACE(REPLACE(note.content, CHR(13) || CHR(10), CHR(10)), CHR(13), CHR(10)))
        """
    )
    op.execute(
        """
        UPDATE tasks AS task
        SET title = BTRIM(REPLACE(REPLACE(note.content, CHR(13) || CHR(10), CHR(10)), CHR(13), CHR(10)))
        FROM plan_notes AS note
        WHERE task.plan_note_origin_id = note.id
          AND NULLIF(BTRIM(note.content), '') IS NOT NULL
          AND task.title IS DISTINCT FROM BTRIM(REPLACE(REPLACE(note.content, CHR(13) || CHR(10), CHR(10)), CHR(13), CHR(10)))
        """
    )


def downgrade() -> None:
    # Reducing titles again would irreversibly discard note content.
    pass
