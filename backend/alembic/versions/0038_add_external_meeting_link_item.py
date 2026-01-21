"""add external meeting checklist link item

Revision ID: 0038_add_external_meeting_link_item
Revises: 0037_add_external_meeting_9_subpoints
Create Date: 2026-01-21
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op


revision = "0038_add_external_meeting_link_item"
down_revision = "0037_add_external_meeting_9_subpoints"
branch_labels = None
depends_on = None


def _normalize_title(title: str | None) -> str:
    return (title or "").strip().lower()


def upgrade() -> None:
    conn = op.get_bind()

    checklist_row = conn.execute(
        sa.text(
            """
            SELECT id
            FROM checklists
            WHERE group_key = 'external'
              AND task_id IS NULL
              AND project_id IS NULL
            ORDER BY position NULLS LAST, id
            LIMIT 1
            """
        )
    ).fetchone()

    if not checklist_row:
        return

    checklist_id = checklist_row[0]
    wanted_title = "A eshte derguar linku i takimit ne Teams ne grupin PX GRUPI TAKIMET EXT - LINQET?"

    rows = conn.execute(
        sa.text(
            """
            SELECT id, position, title
            FROM checklist_items
            WHERE checklist_id = :checklist_id
              AND item_type = 'CHECKBOX'
              AND title IS NOT NULL
            """
        ),
        {"checklist_id": checklist_id},
    ).fetchall()

    target_row = None
    wanted_key = _normalize_title(wanted_title)
    for row in rows:
        if _normalize_title(row[2]) == wanted_key:
            target_row = row
            break

    if not target_row:
        conn.execute(
            sa.text(
                """
                UPDATE checklist_items
                SET position = position + 1
                WHERE checklist_id = :checklist_id
                  AND position >= 7
                """
            ),
            {"checklist_id": checklist_id},
        )
        conn.execute(
            sa.text(
                """
                INSERT INTO checklist_items (id, checklist_id, item_type, position, title, is_checked)
                VALUES (:id, :checklist_id, :item_type, :position, :title, :is_checked)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "checklist_id": str(checklist_id),
                "item_type": "CHECKBOX",
                "position": 7,
                "title": wanted_title,
                "is_checked": False,
            },
        )
        return

    item_id = target_row[0]
    position = target_row[1]
    if position is None:
        position = 0

    if position > 7:
        conn.execute(
            sa.text(
                """
                UPDATE checklist_items
                SET position = position + 1
                WHERE checklist_id = :checklist_id
                  AND position >= 7
                  AND position < :current_pos
                  AND id != :item_id
                """
            ),
            {"checklist_id": checklist_id, "current_pos": position, "item_id": item_id},
        )
        conn.execute(
            sa.text(
                """
                UPDATE checklist_items
                SET position = 7
                WHERE id = :item_id
                """
            ),
            {"item_id": item_id},
        )
    elif 0 < position < 7:
        conn.execute(
            sa.text(
                """
                UPDATE checklist_items
                SET position = position - 1
                WHERE checklist_id = :checklist_id
                  AND position > :current_pos
                  AND position <= 7
                  AND id != :item_id
                """
            ),
            {"checklist_id": checklist_id, "current_pos": position, "item_id": item_id},
        )
        conn.execute(
            sa.text(
                """
                UPDATE checklist_items
                SET position = 7
                WHERE id = :item_id
                """
            ),
            {"item_id": item_id},
        )


def downgrade() -> None:
    conn = op.get_bind()

    checklist_row = conn.execute(
        sa.text(
            """
            SELECT id
            FROM checklists
            WHERE group_key = 'external'
              AND task_id IS NULL
              AND project_id IS NULL
            ORDER BY position NULLS LAST, id
            LIMIT 1
            """
        )
    ).fetchone()
    if not checklist_row:
        return
    checklist_id = checklist_row[0]

    wanted_title = "A eshte derguar linku i takimit ne Teams ne grupin PX GRUPI TAKIMET EXT - LINQET?"
    row = conn.execute(
        sa.text(
            """
            SELECT id, position
            FROM checklist_items
            WHERE checklist_id = :checklist_id
              AND item_type = 'CHECKBOX'
              AND lower(title) = lower(:title)
            LIMIT 1
            """
        ),
        {"checklist_id": checklist_id, "title": wanted_title},
    ).fetchone()

    if not row:
        return

    item_id, position = row
    conn.execute(
        sa.text(
            """
            DELETE FROM checklist_items
            WHERE id = :item_id
            """
        ),
        {"item_id": item_id},
    )

    if position is None:
        return

    conn.execute(
        sa.text(
            """
            UPDATE checklist_items
            SET position = position - 1
            WHERE checklist_id = :checklist_id
              AND position > :deleted_pos
            """
        ),
        {"checklist_id": checklist_id, "deleted_pos": position},
    )
