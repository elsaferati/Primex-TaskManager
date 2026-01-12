"""add meeting checklists

Revision ID: 0028_add_meeting_checklists
Revises: 0027_add_project_type
Create Date: 2026-01-12
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0028_add_meeting_checklists"
down_revision = "0027_add_project_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checklists", sa.Column("note", sa.Text(), nullable=True))
    op.add_column("checklists", sa.Column("default_owner", sa.String(length=150), nullable=True))
    op.add_column("checklists", sa.Column("default_time", sa.String(length=50), nullable=True))
    op.add_column("checklists", sa.Column("group_key", sa.String(length=50), nullable=True))
    op.add_column("checklists", sa.Column("columns", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("checklists", sa.Column("position", sa.Integer(), nullable=True))

    op.add_column("checklist_items", sa.Column("day", sa.Text(), nullable=True))
    op.add_column("checklist_items", sa.Column("owner", sa.Text(), nullable=True))
    op.add_column("checklist_items", sa.Column("time", sa.Text(), nullable=True))

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

    templates = [
        {
            "title": "TAK BORD/GA",
            "note": None,
            "default_owner": "DV",
            "default_time": "8:00",
            "group_key": "board",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "topic", "label": "M1 PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {"nr": 1, "topic": "MUNGESA/VONESA? A KEMI NDONJE MUNGESE QE E PRISH PLANIN?"},
                {"nr": 2, "topic": "A KA NDRYSHIME TE PLANIT/PRIORITETEVE?"},
                {"nr": 3, "topic": "KUSH ME CKA VAZHDON?"},
                {"nr": 4, "topic": "EMAIL PX? primex.eu@gmail.com (KONTROLLO EDHE SPAM)"},
                {"nr": 5, "topic": "EMAIL INFO PX? (KONTROLLO EDHE SPAM)"},
                {"nr": 6, "topic": "EMAIL HF? (KONTROLLO EDHE SPAM)"},
                {"nr": 7, "topic": "KOMENTET SHENIME GA"},
                {"nr": 8, "topic": "KOMENTET BORD"},
            ],
        },
        {
            "title": "ORDERS 08:05",
            "note": "!!! MOS HARRO, SEND/RECEIVE MENJEHERE PAS HAPJES SE OUTLOOK! poczta.zenbox.pl",
            "default_owner": "DM",
            "default_time": "8:05",
            "group_key": "staff",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "topic", "label": "M1 PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {"nr": 1, "topic": "PIKAT NGA TEAMS DJE DHE SOT (!08:05-08:45 ORDERS HC)"},
                {
                    "nr": 2,
                    "topic": "A KA DET TE REJA DHE TAKIM TE RI NGA TAKIMI DHE A JANE SHPERNDARE DETYRAT? NESE PO, KERKO DATE???",
                },
                {"nr": 3, "topic": "CKA KEMI ME PERGADIT NGA PREZANTIMET SOT DHE NESER?"},
                {"nr": 4, "topic": "A ESHTE PRANUAR TAKIMI NGA TE GJITHE PARTICIPANTET?"},
                {"nr": 5, "topic": "A JANE VENDOSUR NE VEND PREZANTIMET NE CANVA/FILES?"},
                {
                    "nr": 6,
                    "topic": "A KEMI POROSI TE RE PER INTERLINE, CILI PRODUKT ESHTE, A ESHTE KRIJUAR ZO DHE TE PERCILLET PRODHIMI?",
                },
                {"nr": 7, "topic": "DISKUTOHEN EMAILAT E REJA"},
            ],
        },
        {
            "title": "PERMBLEDHJA M1",
            "note": None,
            "default_owner": "LM/DM",
            "default_time": "8:15",
            "group_key": "staff",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "day", "label": "DITA", "width": "90px"},
                {"key": "topic", "label": "M1 PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {
                    "nr": 1,
                    "day": "E HENE",
                    "topic": "A ESHTE BERE KONTROLLI I TRANSFERIT TE THIRRJEVE NGA DE NE PRIMEX SIPAS TEMPLATE-IT NE MURE?",
                },
                {"nr": 2, "day": "E HENE", "topic": "A ESHTE BILANCI I GJENDJES X2 NE RREGULL?"},
                {"nr": 3, "day": "CDO DITE", "topic": "MUNGESA/VONESA SOT: PX-NESE PO?"},
                {"nr": 4, "day": "CDO DITE", "topic": "PUSHIM SOT: PX/HC/FD/HF"},
                {
                    "nr": 5,
                    "day": "CDO DITE",
                    "topic": "FESTA: PASNESER/NESER/SOT: PX/HC/FD/HF/USA - NESE PO? / NESE KA DUHET TE. LAJMROHEN KLIENTAT 1 JAVE ME HERET",
                },
                {"nr": 6, "day": "CDO DITE", "topic": "FESTA JAVA E ARDHSHME PX/PL/DE/USA"},
                {"nr": 7, "day": "CDO DITE", "topic": "TAKIME NGA KALENDARI SOT / NESER (A KA TAKIME TE JASHTME?)"},
                {"nr": 8, "day": "E HENE", "topic": "PRINTERI COLOR B&W"},
                {"nr": 9, "day": "CDO DITE", "topic": "ANKESA"},
                {"nr": 10, "day": "CDO DITE", "topic": "KERKESA"},
                {"nr": 11, "day": "CDO DITE", "topic": "PROPOZIME"},
                {"nr": 12, "day": "CDO DITE", "topic": "PIKA TE PERBASHKETA"},
            ],
        },
        {
            "title": "TAKIMI ME STAF PER SQARIMIN E DET & NE FUND ME GA",
            "note": None,
            "default_owner": "DV",
            "default_time": "8:30",
            "group_key": "staff",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "topic", "label": "M1 PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {"nr": 1, "topic": "BZ PROJEKTET/SECILI INDIVIDUALISHT (BLIC DETYRAT)"},
                {"nr": 2, "topic": "TT/VS/MST PRJK/MST FOTO/SMM"},
                {"nr": 3, "topic": "KUSH NUK ESHTE BRENDA PLANIT & A KA PASUR PROBLEME?"},
                {
                    "nr": 4,
                    "topic": "BZ PERMBLEDHJA ME GA (FIZIKISHT)- A KA DICKA TE RE QE KA SHTU GA NE PERMBLEDHJE? SOT/R1/1H, BLOK?",
                },
                {"nr": 5, "topic": "SQARO DETYRA TE REJA TE SHPEJTA QE KRYHEN BRENDA DITES?"},
                {"nr": 6, "topic": "A PRITET DICKA NE PAUZE PER KONTROLLE GA NGA ZHVILLIMI/PROJEKTET?"},
            ],
        },
        {
            "title": "PERMBLEDHJA M2",
            "note": None,
            "default_owner": "DV",
            "default_time": "11:50",
            "group_key": "staff",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "topic", "label": "M2 PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {"nr": 1, "topic": "PERSONALISHT SHENIMET GA?"},
                {"nr": 2, "topic": "DETYRAT PERSONALISHT 1H/R1/SOT TE KRYERA DHE TE BZ"},
                {"nr": 3, "topic": "URGJENCA/PROBLEME/1H!!!"},
                {"nr": 4, "topic": "A JEMI BRENDA PLANIT ME PROJEKTE/DIZAJN?"},
                {"nr": 5, "topic": "A KA DETYRA TE SHPEJTA QE KRYHEN BRENDA DITES, PER BARAZIM AM?"},
                {
                    "nr": 6,
                    "topic": "A KA DETYRA TE REJA NGA TAKIMET EKSTERNE DHE A JANE SHPERNDARE DETYRA DHE A JANE VENDOSUR NE VEND PREZANTIMET NE CANVA/FILES?",
                },
                {"nr": 7, "topic": "A KA TAKIME TE REJA, KERKO DATEN E TAKIMIT TE RI?"},
                {"nr": 8, "topic": "EMAIL/TAKIME A KA KERKESA TE REJA DICKA JASHTE STANDARDEVE"},
                {"nr": 9, "topic": "PIKAT E BORDIT"},
            ],
        },
        {
            "title": "PERMBLEDHJA PAS PAUZES",
            "note": None,
            "default_owner": "DV",
            "default_time": "13:15",
            "group_key": "board",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "topic", "label": "PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {"nr": 1, "topic": "(GA) DET NGA EMAIL/ PX INFO"},
                {"nr": 2, "topic": "PROJEKTET: ATO QE KEMI PUNU DHE SKEMI PUNU"},
                {"nr": 3, "topic": "A JEMI BRENDA PLANIT ME PROJEKTE/DIZAJN?"},
                {"nr": 4, "topic": "(GA)SHENIME GA- PIKAT PAS PAUZE"},
                {"nr": 5, "topic": "(GA) A KA REPLY NGA GA TEK DETYRAT NGA STAFI PER GA?"},
                {"nr": 6, "topic": "(GA) PIKAT E BORDIT"},
                {"nr": 7, "topic": "(GA) E HENE- ORDER/TIKETA HT/H"},
            ],
        },
        {
            "title": "PERMBLEDHJA 15:30",
            "note": None,
            "default_owner": "DV ME GA",
            "default_time": "15:45",
            "group_key": "staff",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "topic", "label": "M3 PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {
                    "nr": 1,
                    "topic": "BZ INDIVIDUALISHT ME SECILIN: 1. A JEMI BRENDA PLANIT? 2. SA PRODUKTE KOLONA JANE KRYER? 3. A KA PASUR NDRYSHIM TE PLANIT? 4. ME CKA VAZHDOHET NESER? 5. A JANE BERE DONE DETYRAT SE BASHKU ME PERGJEGJES?",
                    "owner": "DV ME STAF",
                    "time": "3:30 PM",
                },
                {"nr": 2, "topic": "PARREGULLSITE DHE DETYRAT SOT PER SOT (DISKUTOHEN EDHE KUR ESHTE GA E NXENE)"},
                {"nr": 3, "topic": "URGJENCAT"},
                {"nr": 4, "topic": "MUST SOT"},
                {"nr": 5, "topic": "BZ SHENIME \\ DETYRAT PERSONALISHT"},
                {"nr": 6, "topic": "BZ PROGRESI TEK PROJEKTET? SA PRODUKTE/KOLONA JANE PERFUNDUAR?"},
                {"nr": 7, "topic": "A KA DETYRA TE SHPEJTA QE KRYHEN BRENDA DITES, PER BARAZIM PM?"},
                {
                    "nr": 8,
                    "topic": "A KA DETYRA TE REJA NGA TAKIMET EKSTERNE DHE A JANE SHPERNDARE DETYRA DHE A JANE VENDOSUR NE VEND PREZANTIMET NE CANVA/FILES?",
                },
                {"nr": 9, "topic": "NESE NUK MBAHET TAKIMI 16:20, DISKUTOHEN EDHE DET CKA JANE ME RENDESI PER NESER?"},
                {"nr": 10, "topic": "EMAIL/TAKIME A KA KERKESA TE REJA DICKA JASHTE STANDARDEVE"},
            ],
        },
        {
            "title": "MBYLLJA E DITES",
            "note": None,
            "default_owner": "DV",
            "default_time": "16:20",
            "group_key": "board",
            "columns": [
                {"key": "nr", "label": "NR", "width": "52px"},
                {"key": "topic", "label": "PIKAT"},
                {"key": "check", "label": "", "width": "48px"},
                {"key": "owner", "label": "WHO", "width": "90px"},
                {"key": "time", "label": "WHEN", "width": "90px"},
            ],
            "rows": [
                {"nr": 1, "topic": "MBINGARKESE NESER (NESE PO PROPOZIM PER RIORGANIZIM)"},
                {"nr": 2, "topic": "NENGARKESE NESER"},
                {"nr": 3, "topic": "MUST NESER + DET. PERSONALSHT(TRELLO)"},
                {"nr": 4, "topic": "DET PER NESER ME PRIORITET: PSH JAVORET, TAKIMET EXT"},
                {"nr": 5, "topic": "DET NE PROCES SISTEMIT (RD/93)"},
                {"nr": 6, "topic": "DET. PA PROGRES (TRELLO NOT DONE?)"},
                {"nr": 7, "topic": "TAKIMET PA KRY (KONTROLLO TRELLO)"},
                {"nr": 8, "topic": "NESER ME GA (KOF/takime/ankesa/kerkesa/propozime):"},
            ],
        },
    ]

    for index, template in enumerate(templates):
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
                continue
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
                        "position": index,
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
                    "day": row.get("day"),
                    "owner": row.get("owner"),
                    "time": row.get("time"),
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
                WHERE group_key IN ('board', 'staff')
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
            WHERE group_key IN ('board', 'staff')
              AND task_id IS NULL
              AND project_id IS NULL
            """
        )
    )

    op.drop_column("checklist_items", "time")
    op.drop_column("checklist_items", "owner")
    op.drop_column("checklist_items", "day")

    op.drop_column("checklists", "position")
    op.drop_column("checklists", "columns")
    op.drop_column("checklists", "group_key")
    op.drop_column("checklists", "default_time")
    op.drop_column("checklists", "default_owner")
    op.drop_column("checklists", "note")
