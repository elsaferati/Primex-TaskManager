from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure backend/ is on sys.path when running from repo root.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.db import SessionLocal
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.enums import ChecklistItemType


TEMPLATE_GROUP_KEY = "gd_mst_gjenerale"
TEMPLATE_TITLE = "GD MST Gjenerale"
TEMPLATE_PATH = "gd_mst_gjenerale"

TEMPLATE_COLUMNS = [
    {"key": "keyword", "label": "KEYWORDS"},
    {"key": "title", "label": "DETYRAT"},
    {"key": "description", "label": "PERSHKRIMI"},
    {"key": "category", "label": "KATEGORIA"},
    {"key": "owner", "label": "INCL"},
    {"key": "comment", "label": "COMMENT"},
]

RAW_ITEMS = [
    {
        "nr": 1,
        "title": "Kontrolli i hapësirës dhe background-it",
        "keyword": "HAPSIRA, BACKGROUND",
        "description": (
            "Hapësira duhet të jetë e barabartë midis elementëve dhe tekstit. "
            "Background nuk duhet të preket me kockat – duhet të ketë hapësirë mes kockave "
            "dhe type/setit mbrapa."
        ),
        "category": "GJENERALE",
    },
    {
        "nr": 2,
        "title": "Kontrolli i emërtimit të file-ve",
        "keyword": "EMERTIM, FILE",
        "description": (
            "Emri i plotë i klientit nuk guxon të shkruhet i plotë në asnjë emërtim file apo diku tjetër. "
            "Selling Images duhet të emërtohen gjithmonë me kod produkti: sipas sistemit përkatës (MST / OTTO / etj.). "
            "Gjatë emërtimit: duhet kujdes maksimal, bëhen minimum 2 kontrolle."
        ),
        "category": "GJENERALE",
    },
    {
        "nr": 3,
        "title": "Konfirmimi i kategorisë me MST",
        "keyword": "MST, KONFIRMIM",
        "description": "Çdo kategori duhet të konfirmohet me MST dhe të mbahet short meeting / brainstorming para fillimit.",
        "category": "GJENERALE",
    },
    {
        "nr": 4,
        "title": "Hulumtimi i kategorisë së re",
        "keyword": "RESEARCH, TOPSELLERS",
        "description": "Çdo kategori e re duhet të hulumtohet në portale si OTTO.de dhe Amazon.de duke kontrolluar Top Sellers.",
        "category": "GJENERALE",
    },
    {
        "nr": 5,
        "title": "Kontrolli i përshkrimeve të produkteve",
        "keyword": "PERSHKRIME, PRODUKT",
        "description": "Përshkrimet e produkteve duhet të jenë të njëjta në strukturë brenda programit, por me përmbajtje specifike sipas kategorisë.",
        "category": "GJENERALE",
    },
    {
        "nr": 6,
        "title": "Konfirmimi i logos",
        "keyword": "LOGO",
        "description": (
            "Logo e klientit: duhet të jetë e konfirmuar me email; vendoset lart majtas. "
            "Logo e garancisë: vendoset poshtë majtas. "
            "Ngjyrat e logos: përshtaten sipas ngjyrave të fotos."
        ),
        "category": "GJENERALE",
    },
    {
        "nr": 7,
        "title": "Kontrolli i fotove dhe detajeve",
        "keyword": "FOTO, DETAJE, KEND",
        "description": (
            "Foto duhet të bëhet shumë zoom për të parë të gjitha detajet. "
            "Kur fotot janë nga i njëjti kënd, vijat duhet të jenë në të njëjtin drejtim."
        ),
        "category": "GJENERALE",
    },
    {
        "nr": 8,
        "title": "Vendosja e linkeve dhe konfirmimeve",
        "keyword": "LINQE, EMAIL",
        "description": "Të gjitha linket dhe konfirmimet vendosen te sheet “Konfirmimet me Email & Linket”.",
        "category": "GJENERALE",
    },
    {
        "nr": 9,
        "title": "Skicat",
        "keyword": "Skicat",
        "description": (
            "Foto me dimensione: përmban vetëm skicë + dimensione; nuk vendoset tekst tjetër përveç header-it. "
            "Header-i: duhet të kombinohet me ngjyrat e Selling Image kryesore. "
            "Vijat e dimensioneve: nuk duhet të prekin produktin."
        ),
        "category": "GJENERALE",
    },
    {
        "nr": 10,
        "title": "Kockat",
        "keyword": "Kockat",
        "description": (
            "Selling Image duhet të ketë minimum 3 kocka. Kockat duhet të jenë: të qarta, "
            "të lexueshme ndaj background-it. Nëse kockat nuk dallohen mirë nga background-i: "
            "duhet të vendoset stroke i bardhë (ose kontrast i mjaftueshëm)."
        ),
        "category": "GJENERALE",
    },
    {
        "nr": 11,
        "title": "Selling Image – Opsione",
        "keyword": "Opsione",
        "description": (
            "Kur paraqiten opsione majtas / djathtas (L/R): produkti duhet të jetë në të njëjtën vijë; "
            "nuk lejohet që një variant të jetë më lart dhe tjetri më poshtë."
        ),
        "category": "GJENERALE",
    },
]


def _normalize_key(value: str | None) -> str:
    return (value or "").strip().lower()


async def seed_template() -> None:
    async with SessionLocal() as db:
        checklist = (
            await db.execute(
                select(Checklist).where(
                    Checklist.group_key == TEMPLATE_GROUP_KEY, Checklist.project_id.is_(None)
                )
            )
        ).scalar_one_or_none()
        if checklist is None:
            checklist = Checklist(
                title=TEMPLATE_TITLE,
                group_key=TEMPLATE_GROUP_KEY,
                columns=TEMPLATE_COLUMNS,
                position=1,
            )
            db.add(checklist)
            await db.flush()
        else:
            if checklist.title != TEMPLATE_TITLE:
                checklist.title = TEMPLATE_TITLE
            if checklist.columns is None:
                checklist.columns = TEMPLATE_COLUMNS
            await db.flush()

        existing_items = (
            await db.execute(
                select(ChecklistItem).where(
                    ChecklistItem.checklist_id == checklist.id,
                    ChecklistItem.path == TEMPLATE_PATH,
                )
            )
        ).scalars().all()
        existing_keys = {
            "|".join(
                [
                    _normalize_key(item.title),
                    _normalize_key(item.keyword),
                    _normalize_key(item.description),
                    _normalize_key(item.category),
                ]
            )
            for item in existing_items
        }

        for row in RAW_ITEMS:
            key = "|".join(
                [
                    _normalize_key(row["title"]),
                    _normalize_key(row["keyword"]),
                    _normalize_key(row["description"]),
                    _normalize_key(row["category"]),
                ]
            )
            if key in existing_keys:
                continue
            db.add(
                ChecklistItem(
                    checklist_id=checklist.id,
                    item_type=ChecklistItemType.CHECKBOX,
                    position=max(0, int(row["nr"]) - 1),
                    path=TEMPLATE_PATH,
                    keyword=row["keyword"],
                    description=row["description"],
                    category=row["category"],
                    title=row["title"],
                    is_checked=False,
                )
            )
            existing_keys.add(key)

        await db.commit()


def main() -> None:
    asyncio.run(seed_template())


if __name__ == "__main__":
    main()
