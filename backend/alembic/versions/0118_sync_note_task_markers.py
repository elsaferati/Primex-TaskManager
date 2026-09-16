"""Make linked notes and task copies use one shared 1H symbol.

Revision ID: 0118_sync_note_task_markers
Revises: 0117_today_print_report_0850
"""

from __future__ import annotations

from alembic import op


revision = "0118_sync_note_task_markers"
down_revision = "0117_today_print_report_0850"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older symbol edits updated the task but not its source note. Preserve an
    # existing note value; otherwise take the newest active linked task value.
    op.execute(
        """
        UPDATE ga_notes AS note
        SET one_h_marker = (
            SELECT task.one_h_marker
            FROM tasks AS task
            WHERE task.ga_note_origin_id = note.id
              AND task.is_active IS TRUE
              AND task.one_h_marker IS NOT NULL
            ORDER BY task.updated_at DESC, task.id DESC
            LIMIT 1
        )
        WHERE note.one_h_marker IS NULL
          AND EXISTS (
              SELECT 1 FROM tasks AS task
              WHERE task.ga_note_origin_id = note.id
                AND task.is_active IS TRUE
                AND task.one_h_marker IS NOT NULL
          )
        """
    )
    op.execute(
        """
        UPDATE plan_notes AS note
        SET one_h_marker = (
            SELECT task.one_h_marker
            FROM tasks AS task
            WHERE task.plan_note_origin_id = note.id
              AND task.is_active IS TRUE
              AND task.one_h_marker IS NOT NULL
            ORDER BY task.updated_at DESC, task.id DESC
            LIMIT 1
        )
        WHERE note.one_h_marker IS NULL
          AND EXISTS (
              SELECT 1 FROM tasks AS task
              WHERE task.plan_note_origin_id = note.id
                AND task.is_active IS TRUE
                AND task.one_h_marker IS NOT NULL
          )
        """
    )
    op.execute(
        """
        UPDATE tasks AS task
        SET one_h_marker = note.one_h_marker
        FROM ga_notes AS note
        WHERE task.ga_note_origin_id = note.id
          AND task.is_active IS TRUE
          AND task.one_h_marker IS DISTINCT FROM note.one_h_marker
        """
    )
    op.execute(
        """
        UPDATE tasks AS task
        SET one_h_marker = note.one_h_marker
        FROM plan_notes AS note
        WHERE task.plan_note_origin_id = note.id
          AND task.is_active IS TRUE
          AND task.one_h_marker IS DISTINCT FROM note.one_h_marker
        """
    )


def downgrade() -> None:
    # This migration reconciles duplicated values and has no schema to undo.
    pass
