"""add external meetings checklist

Revision ID: 0036_add_external_meetings_checklist
Revises: 0035_add_task_daily_products
Create Date: 2026-01-15
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0036_add_external_meetings_checklist"
down_revision = "0035_add_task_daily_products"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    checklists_table = sa.table(
        "checklists",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("title", sa.String),
        sa.column("task_id", postgresql.UUID(as_uuid=True)),
        sa.column("project_id", postgresql.UUID(as_uuid=True)),
        sa.column("note", sa.Text),
        sa.column("default_owner", sa.String),
        sa.column("default_time", sa.String),
        sa.column("group_key", sa.String),
        sa.column("columns", postgresql.JSONB),
        sa.column("position", sa.Integer),
    )
    checklist_items_table = sa.table(
        "checklist_items",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("checklist_id", postgresql.UUID(as_uuid=True)),
        sa.column("item_type", sa.String),
        sa.column("position", sa.Integer),
        sa.column("title", sa.Text),
        sa.column("day", sa.Text),
        sa.column("owner", sa.Text),
        sa.column("time", sa.Text),
        sa.column("is_checked", sa.Boolean),
    )

    template = {
        "title": "TAKIMET EXTERNE-CHECKLISTA",
        "note": None,
        "default_owner": None,
        "default_time": None,
        "group_key": "external",
        "columns": [
            {"key": "check", "label": "", "width": "48px"},
            {"key": "topic", "label": "PIKAT"},
        ],
        "rows": [
            {"nr": 1, "topic": "Konfirmo takimin me GA/KA"},
            {"nr": 2, "topic": "Emërtimi i Takimit: EMRI I KLIENTIT_TITULLI I TAKIMIT_PrimEx_DATA"},
            {
                "nr": 3,
                "topic": "(SHIKO FOTON NE ATTACHMENT) opsionet e qasjes në një takim në, ku caktohet kush lejohet të hyjë direkt, kush pranon pjesëmarrësit dhe nëse kërkohet verifikim para casjes",
            },
            {"nr": 4, "topic": "Përfshirja e Pjesëmarrësve nga PrimEx:"},
            {"nr": 5, "topic": "Shto pjesëmarrësit e tjerë:"},
            {"nr": 6, "topic": "Cakto datën dhe orën në kalendarin Teams"},
            {"nr": 7, "topic": "Koha e takimit: Takimi : 1h 30min"},
            {
                "nr": 8,
                "topic": "Përgatitja: Një ditë para takimit: përgatiten prezantimet për takim. M1 MBL 08:05 diskutohet dhe paraqiten te prbml 93 nje dite para takimit testimet.",
            },
            {"nr": 9, "topic": "A eshte bere accept takimi nga pjesmarresit?"},
            {"nr": 10, "topic": "Pas perfundimit te takimit, ndahen te gjitha detyrat?"},
            {
                "nr": 11,
                "topic": "Takimet te cilat nuk e kemi linkun edhe kur nuk i dergojm ne linkun me marr prej email edhe me vendos ne calendar",
            },
        ],
    }

    existing_id = conn.execute(
        sa.text(
            """
            SELECT id
            FROM checklists
            WHERE title = :title
              AND group_key = :group_key
              AND task_id IS NULL
              AND project_id IS NULL
            """
        ),
        {"title": template["title"], "group_key": template["group_key"]},
    ).fetchone()

    if existing_id:
        checklist_id = existing_id[0]
        has_items = conn.execute(
            sa.text(
                """
                SELECT 1
                FROM checklist_items
                WHERE checklist_id = :checklist_id
                LIMIT 1
                """
            ),
            {"checklist_id": checklist_id},
        ).fetchone()
        if has_items:
            return
    else:
        checklist_id = uuid.uuid4()
        op.bulk_insert(
            checklists_table,
            [
                {
                    "id": checklist_id,
                    "title": template["title"],
                    "task_id": None,
                    "project_id": None,
                    "note": template["note"],
                    "default_owner": template["default_owner"],
                    "default_time": template["default_time"],
                    "group_key": template["group_key"],
                    "columns": template["columns"],
                    "position": 0,
                }
            ],
        )

    item_rows = []
    for row in template["rows"]:
        item_rows.append(
            {
                "id": uuid.uuid4(),
                "checklist_id": checklist_id,
                "item_type": "CHECKBOX",
                "position": row["nr"],
                "title": row["topic"],
                "day": None,
                "owner": None,
                "time": None,
                "is_checked": False,
            }
        )

    if item_rows:
        op.bulk_insert(checklist_items_table, item_rows)


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            DELETE FROM checklist_items
            WHERE checklist_id IN (
                SELECT id FROM checklists
                WHERE group_key = 'external'
                  AND task_id IS NULL
                  AND project_id IS NULL
            )
            """
        )
    )
    conn.execute(
        sa.text(
            """
            DELETE FROM checklists
            WHERE group_key = 'external'
              AND task_id IS NULL
              AND project_id IS NULL
            """
        )
    )
