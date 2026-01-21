"""add external meeting checklist 9.1 and 9.2

Revision ID: 0037_add_external_meeting_9_subpoints
Revises: 0036_add_external_meetings_checklist
Create Date: 2026-01-20
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op


revision = "0037_add_external_meeting_9_subpoints"
down_revision = "0036_add_external_meetings_checklist"
branch_labels = None
depends_on = None


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

    wanted_titles = [
        "9.1. DY DITE TOLERANCE, NESE NUK PRANOHET RIDERGOHET EMAIL APO SI?",
        "9.2. FILLIMISHT I DERGON KA REMINDER, NE VETEM E NJOFTOJME KA",
    ]

    existing = conn.execute(
        sa.text(
            """
            SELECT title
            FROM checklist_items
            WHERE checklist_id = :checklist_id
              AND item_type = 'CHECKBOX'
              AND title IS NOT NULL
            """
        ),
        {"checklist_id": checklist_id},
    ).fetchall()

    existing_titles = {str(r[0]).strip() for r in existing}
    missing = [t for t in wanted_titles if t not in existing_titles]
    if not missing:
        return

    # Insert after the "9" item: shift everything at/after position 10 down by 2.
    # (External checklist uses integer positions; this keeps ordering stable.)
    conn.execute(
        sa.text(
            """
            UPDATE checklist_items
            SET position = position + 2
            WHERE checklist_id = :checklist_id
              AND position >= 10
            """
        ),
        {"checklist_id": checklist_id},
    )

    # Place them at positions 10 and 11.
    inserts = []
    for i, title in enumerate(wanted_titles):
        if title not in missing:
            continue
        inserts.append(
            {
                "id": str(uuid.uuid4()),
                "checklist_id": str(checklist_id),
                "item_type": "CHECKBOX",
                "position": 10 + i,
                "title": title,
                "is_checked": False,
            }
        )

    if inserts:
        conn.execute(
            sa.text(
                """
                INSERT INTO checklist_items (id, checklist_id, item_type, position, title, is_checked)
                VALUES (:id, :checklist_id, :item_type, :position, :title, :is_checked)
                """
            ),
            inserts,
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

    conn.execute(
        sa.text(
            """
            DELETE FROM checklist_items
            WHERE checklist_id = :checklist_id
              AND title IN (
                '9.1. DY DITE TOLERANCE, NESE NUK PRANOHET RIDERGOHET EMAIL APO SI?',
                '9.2. FILLIMISHT I DERGON KA REMINDER, NE VETEM E NJOFTOJME KA'
              )
            """
        ),
        {"checklist_id": checklist_id},
    )

    # Pull positions back up (best-effort).
    conn.execute(
        sa.text(
            """
            UPDATE checklist_items
            SET position = position - 2
            WHERE checklist_id = :checklist_id
              AND position >= 12
            """
        ),
        {"checklist_id": checklist_id},
    )

