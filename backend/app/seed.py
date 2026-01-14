from __future__ import annotations

import asyncio
import os

# 1. Import load_dotenv to read the .env file
from dotenv import load_dotenv
from sqlalchemy import select

from app.auth.security import get_password_hash
from app.db import SessionLocal
from app.models.department import Department
from app.models.enums import ProjectPhaseStatus, ProjectType, TaskStatus, UserRole
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.project import Project
from app.models.user import User
from app.models.enums import ChecklistItemType

# 2. Load environment variables immediately
load_dotenv()

def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


DEPARTMENTS = [
    ("Development", "DEV"),
    ("Project Content Manager", "PCM"),
    ("Graphic Design", "GD"),
]

PCM_PROJECTS = [
    {
        "title": "MST",
        "description": "Menaxhimi i programit dhe checklistes se produkteve.",
        "status": TaskStatus.IN_PROGRESS,
        "current_phase": ProjectPhaseStatus.PLANNING,
        "progress_percentage": 48,
        "project_type": ProjectType.MST.value,
    },
    {
        "title": "VS/VL",
        "description": "VS/VL project phases: Project Acceptance, Amazone, Control, Dreamrobot.",
        "status": TaskStatus.IN_PROGRESS,
        "current_phase": ProjectPhaseStatus.PLANNING,
        "progress_percentage": 0,
    },
    {
        "title": "VS/VL PRJK I VOGEL",
        "description": "VS/VL project phases: Project Acceptance, Amazone, Control, Dreamrobot.",
        "status": TaskStatus.IN_PROGRESS,
        "current_phase": ProjectPhaseStatus.PLANNING,
        "progress_percentage": 0,
    },
    {
        "title": "TT",
        "description": "Menaxhimi i programit dhe checklistes se produkteve.",
        "status": TaskStatus.IN_PROGRESS,
        "current_phase": ProjectPhaseStatus.PLANNING,
        "progress_percentage": 48,
    },
    {
        "title": "Set One",
        "description": "Programi i perfunduar javen e kaluar.",
        "status": TaskStatus.DONE,
        "current_phase": ProjectPhaseStatus.CLOSED,
        "progress_percentage": 100,
    },
]

GD_PROJECTS = [
    {
        "title": "MST",
        "description": "MST (Graphic Design) with phases: Planning, Product, Control, Final.",
        "status": TaskStatus.IN_PROGRESS,
        "current_phase": ProjectPhaseStatus.PLANNING,
        "progress_percentage": 0,
        "project_type": ProjectType.MST.value,
    }
]

MST_PLANNING_ACCEPTANCE_GROUP_KEY = "MST_PLANNING_ACCEPTANCE"
MST_PLANNING_GA_MEETING_GROUP_KEY = "MST_PLANNING_GA_MEETING"

# Graphic Design (GD) - "Pranimi i Projektit" checklist items
GD_PROJECT_ACCEPTANCE_TEMPLATE: list[str] = [
    "A është pranuar projekti?",
    "A është krijuar folderi për projektin?",
    "A janë ruajtur të gjitha dokumentet?",
    "A janë eksportuar të gjitha fotot në dosjen 01_ALL_PHOTO?",
    "A është kryer organizimi i fotove në foldera?",
    "A është shqyrtuar sa foto janë mungesë nese po është dergu email tek klienti?",
    "A janë analizuar dokumentet që i ka dërguar klienti?",
    "A jane identifikuar karakteristikat e produktit? p.sh (glass, soft close).",
    "A janë gjetur variancat? (fusse, farbe)",
    "A eshte pergatitur lista e produkteve e ndare me kategori?",
    "A eshte rast i ri, apo eshte kategori ekzistuese?",
]

# Graphic Design (GD) - "Takim me GA/DV" checklist items
GD_GA_DV_MEETING_TEMPLATE: list[str] = [
    "A është diskutuar me GA për propozimin?",
    "Çfarë është vendosur për të vazhduar?",
    "A ka pasur pika shtesë nga takimi?",
]

# Graphic Design (GD) - "PROPOZIM KO1/KO2" checklist items
GD_PROPOZIM_KO1_KO2_TEMPLATE: list[str] = [
    "Cila është kategoria?",
    "A eshte hulumtuar ne Otto.de, amazon.de dhe portale te tjera per top produkte te kategorise qe e kemi?",
    "Vendos linget ku je bazuar?",
]

# Graphic Design (GD) - "PUNIMI" checklist items
GD_PUNIMI_TEMPLATE: list[str] = [
    "Me dhan mundsi me shtu per kategorit qe vazhdojm psh mujn me 3 kategori ose 4 ose 1 nvaret prej klientit",
    "A janë dërguar të gjitha fotot për bz 1n1?",
]

PROJECT_ACCEPTANCE_PATH = "project acceptance"
GA_DV_MEETING_PATH = "ga/dv meeting"
PROPOZIM_KO1_KO2_PATH = "propozim ko1/ko2"
PUNIMI_PATH = "punimi"

# Internal meetings (created as a global checklist by group_key, plus CHECKBOX items)
INTERNAL_MEETINGS_PATH = "INTERNAL_MEETINGS"

DEV_INTERNAL_MEETING_GROUP_KEY = "development_internal_meetings"
PCM_INTERNAL_MEETING_GROUP_KEY = "pcm_internal_meetings"

INTERNAL_MEETING_TITLE = "Pikat e diskutimit (Zhvillim M1, M2, M3)"
INTERNAL_MEETING_SLOTS: dict[str, list[str]] = {
    "M1": [
        "A ka mungesa, a ndryshon plani per sot?",
        "A ka shenime GA/KA ne grupe/Trello?",
        "A ka e-mails te reja ne IT?",
        "Detyrat e secilit per sot (secili hap RD/Trello side-by-side dhe diskuton detyrat).",
        "Shenimet ne grup te zhvillimit vendosen copy/paste ne Trello tek shenimet GA/KA.",
    ],
    "M2": [
        "A ka shenime GA/KA ne grupe/Trello?",
        "Detyrat e secilit diskutohen, cka kemi punu deri 12:00?",
        "Cka mbetet per PM?",
    ],
    "M3": [
        "A ka shenime GA/KA ne grupe/Trello?",
        "Diskuto detyrat e te gjithve, cka kemi punu deri tash?",
        "Cka kemi me punu neser?",
    ],
}

# Common meetings (board/staff) used by Common view (STAFF/GA + BORD/GA dropdowns)
COMMON_MEETING_TEMPLATES: list[dict] = [
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


async def seed() -> None:
    print("Starting seed process...")
    async with SessionLocal() as db:
        seed_internal_meetings = _env_bool("SEED_INTERNAL_MEETINGS", default=True)
        seed_common_meeting_templates = _env_bool("SEED_COMMON_MEETING_TEMPLATES", default=True)
        seed_mst_checklists = _env_bool("SEED_MST_CHECKLISTS", default=False)
        seed_gd_checklists = _env_bool("SEED_GD_CHECKLISTS", default=False)

        # --- Seed Departments ---
        existing = (await db.execute(select(Department))).scalars().all()
        by_name = {d.name: d for d in existing}
        for name, code in DEPARTMENTS:
            if name not in by_name:
                dept = Department(name=name, code=code)
                db.add(dept)
        await db.commit()

        # --- Seed Projects ---
        departments = (await db.execute(select(Department))).scalars().all()
        for dept in departments:
            # Create General Project
            project = (
                (await db.execute(select(Project).where(Project.department_id == dept.id))).scalars().first()
            )
            if project is None:
                db.add(Project(title="General", department_id=dept.id))

        await db.commit()
        print("Departments and metadata seeded.")

        # --- Seed Common meeting templates (board/staff) ---
        if seed_common_meeting_templates:
            for index, template in enumerate(COMMON_MEETING_TEMPLATES):
                checklist = (
                    await db.execute(
                        select(Checklist).where(
                            Checklist.title == template["title"],
                            Checklist.group_key == template["group_key"],
                            Checklist.task_id.is_(None),
                            Checklist.project_id.is_(None),
                        )
                    )
                ).scalar_one_or_none()

                if checklist is None:
                    checklist = Checklist(
                        title=template["title"],
                        note=template["note"],
                        default_owner=template["default_owner"],
                        default_time=template["default_time"],
                        group_key=template["group_key"],
                        columns=template["columns"],
                        position=index,
                    )
                    db.add(checklist)
                    await db.flush()

                # If checklist already has any items, assume it is populated and skip
                has_item = (
                    await db.execute(
                        select(ChecklistItem.id).where(ChecklistItem.checklist_id == checklist.id).limit(1)
                    )
                ).scalar_one_or_none()
                if has_item is not None:
                    continue

                for row in template["rows"]:
                    db.add(
                        ChecklistItem(
                            checklist_id=checklist.id,
                            item_type=ChecklistItemType.CHECKBOX,
                            position=row["nr"],
                            title=row["topic"],
                            day=row.get("day"),
                            owner=row.get("owner"),
                            time=row.get("time"),
                            is_checked=False,
                        )
                    )

            await db.commit()
            print("Common meeting templates seeded.")

        # --- Seed Internal Meetings (global by group_key) ---
        if seed_internal_meetings:
            async def ensure_internal_meeting(group_key: str) -> None:
                checklist = (
                    await db.execute(select(Checklist).where(Checklist.group_key == group_key))
                ).scalar_one_or_none()
                if checklist is None:
                    checklist = Checklist(
                        title=INTERNAL_MEETING_TITLE,
                        note=INTERNAL_MEETING_TITLE,
                        group_key=group_key,
                        position=0,
                    )
                    db.add(checklist)
                    await db.flush()

                existing_items = (
                    await db.execute(
                        select(ChecklistItem).where(
                            ChecklistItem.checklist_id == checklist.id,
                            ChecklistItem.path == INTERNAL_MEETINGS_PATH,
                        )
                    )
                ).scalars().all()

                existing_keys = {
                    f"{(i.day or '').strip()}|{(i.title or '').strip().lower()}"
                    for i in existing_items
                }
                max_position = max((i.position for i in existing_items), default=0)
                position = max_position

                for slot, titles in INTERNAL_MEETING_SLOTS.items():
                    for title in titles:
                        key = f"{slot}|{title.strip().lower()}"
                        if key in existing_keys:
                            continue
                        position += 1
                        db.add(
                            ChecklistItem(
                                checklist_id=checklist.id,
                                item_type=ChecklistItemType.CHECKBOX,
                                position=position,
                                path=INTERNAL_MEETINGS_PATH,
                                day=slot,
                                title=title,
                                is_checked=False,
                            )
                        )

            await ensure_internal_meeting(DEV_INTERNAL_MEETING_GROUP_KEY)
            await ensure_internal_meeting(PCM_INTERNAL_MEETING_GROUP_KEY)
            await db.commit()
            print("Internal meetings checklists seeded.")

        pcm_department = next((dept for dept in departments if dept.name == "Project Content Manager"), None)
        if pcm_department:
            existing_pcm = (
                await db.execute(select(Project).where(Project.department_id == pcm_department.id))
            ).scalars().all()
            existing_titles = {p.title for p in existing_pcm}
            for project in PCM_PROJECTS:
                if project["title"] in existing_titles:
                    continue
                db.add(
                    Project(
                        title=project["title"],
                        description=project["description"],
                        department_id=pcm_department.id,
                        project_type=project.get("project_type"),
                        status=project["status"],
                        current_phase=project["current_phase"],
                        progress_percentage=project["progress_percentage"],
                    )
                )
            await db.commit()
            print("PCM projects seeded.")

        gd_department = next((dept for dept in departments if dept.name == "Graphic Design"), None)
        if gd_department:
            existing_gd = (
                await db.execute(select(Project).where(Project.department_id == gd_department.id))
            ).scalars().all()
            existing_titles = {p.title for p in existing_gd}
            for project in GD_PROJECTS:
                if project["title"] in existing_titles:
                    continue
                db.add(
                    Project(
                        title=project["title"],
                        description=project["description"],
                        department_id=gd_department.id,
                        project_type=project.get("project_type"),
                        status=project["status"],
                        current_phase=project["current_phase"],
                        progress_percentage=project["progress_percentage"],
                    )
                )
            await db.commit()
            print("Graphic Design projects seeded.")

        if seed_mst_checklists:
            # --- Seed MST checklist templates (global) ---
            templates = (await db.execute(select(Checklist).where(Checklist.project_id.is_(None)))).scalars().all()
            template_by_key = {c.group_key: c for c in templates if c.group_key}

            async def ensure_template(group_key: str, title: str) -> Checklist:
                checklist = template_by_key.get(group_key)
                if checklist is None:
                    checklist = Checklist(title=title, group_key=group_key, position=0)
                    db.add(checklist)
                    await db.flush()
                    template_by_key[group_key] = checklist
                return checklist

            await ensure_template(
                MST_PLANNING_ACCEPTANCE_GROUP_KEY,
                "MST Planning - Project Acceptance (Template)",
            )
            await ensure_template(
                MST_PLANNING_GA_MEETING_GROUP_KEY,
                "MST Planning - GA Meeting (Template)",
            )
            await db.commit()
            print("MST checklist templates seeded.")

            # --- Ensure MST checklist instances exist for MST projects (EMPTY by default) ---
            mst_projects = (
                await db.execute(select(Project).where(Project.project_type == ProjectType.MST.value))
            ).scalars().all()

            for proj in mst_projects:
                if proj.department_id is None:
                    continue

                # Fetch or create project checklists by group_key
                existing_proj_checklists = (
                    await db.execute(select(Checklist).where(Checklist.project_id == proj.id))
                ).scalars().all()
                by_key = {c.group_key: c for c in existing_proj_checklists if c.group_key}

                for group_key, title in [
                    (MST_PLANNING_ACCEPTANCE_GROUP_KEY, "Project Acceptance"),
                    (MST_PLANNING_GA_MEETING_GROUP_KEY, "GA Meeting"),
                ]:
                    proj_checklist = by_key.get(group_key)
                    if proj_checklist is None:
                        proj_checklist = Checklist(project_id=proj.id, title=title, group_key=group_key)
                        db.add(proj_checklist)
                        await db.flush()
                        by_key[group_key] = proj_checklist

            await db.commit()
            print("MST project checklist instances ensured.")

        if seed_gd_checklists:
            # --- Seed GD checklist items for Graphic Design projects ---
            gd_department = next((dept for dept in departments if dept.name == "Graphic Design"), None)
            if gd_department:
                gd_projects = (
                    await db.execute(select(Project).where(Project.department_id == gd_department.id))
                ).scalars().all()

                for project in gd_projects:
                    # Get or create default checklist for the project
                    checklist = (
                        await db.execute(
                            select(Checklist)
                            .where(Checklist.project_id == project.id, Checklist.group_key.is_(None))
                            .order_by(Checklist.created_at)
                        )
                    ).scalars().first()
                    if checklist is None:
                        checklist = Checklist(project_id=project.id, title="Checklist")
                        db.add(checklist)
                        await db.flush()

                    # Check existing items to avoid duplicates
                    existing_acceptance = (
                        await db.execute(
                            select(ChecklistItem)
                            .where(
                                ChecklistItem.checklist_id == checklist.id,
                                ChecklistItem.path == PROJECT_ACCEPTANCE_PATH,
                            )
                        )
                    ).scalars().all()
                    existing_acceptance_titles = {item.title for item in existing_acceptance if item.title}

                    existing_ga_meeting = (
                        await db.execute(
                            select(ChecklistItem)
                            .where(
                                ChecklistItem.checklist_id == checklist.id,
                                ChecklistItem.path == GA_DV_MEETING_PATH,
                            )
                        )
                    ).scalars().all()
                    existing_ga_meeting_titles = {item.title for item in existing_ga_meeting if item.title}

                    # Add Project Acceptance items
                    for position, title in enumerate(GD_PROJECT_ACCEPTANCE_TEMPLATE):
                        if title not in existing_acceptance_titles:
                            db.add(
                                ChecklistItem(
                                    checklist_id=checklist.id,
                                    item_type=ChecklistItemType.CHECKBOX,
                                    position=position,
                                    path=PROJECT_ACCEPTANCE_PATH,
                                    title=title,
                                    is_checked=False,
                                )
                            )

                    # Add GA/DV Meeting items
                    for position, title in enumerate(GD_GA_DV_MEETING_TEMPLATE):
                        if title not in existing_ga_meeting_titles:
                            db.add(
                                ChecklistItem(
                                    checklist_id=checklist.id,
                                    item_type=ChecklistItemType.CHECKBOX,
                                    position=position,
                                    path=GA_DV_MEETING_PATH,
                                    title=title,
                                    is_checked=False,
                                )
                            )

                    # Check existing PROPOZIM KO1/KO2 items
                    existing_propozim = (
                        await db.execute(
                            select(ChecklistItem)
                            .where(
                                ChecklistItem.checklist_id == checklist.id,
                                ChecklistItem.path == PROPOZIM_KO1_KO2_PATH,
                            )
                        )
                    ).scalars().all()
                    existing_propozim_titles = {item.title for item in existing_propozim if item.title}

                    # Add PROPOZIM KO1/KO2 items
                    for position, title in enumerate(GD_PROPOZIM_KO1_KO2_TEMPLATE):
                        if title not in existing_propozim_titles:
                            db.add(
                                ChecklistItem(
                                    checklist_id=checklist.id,
                                    item_type=ChecklistItemType.CHECKBOX,
                                    position=position,
                                    path=PROPOZIM_KO1_KO2_PATH,
                                    title=title,
                                    is_checked=False,
                                )
                            )

                    # Check existing PUNIMI items
                    existing_punimi = (
                        await db.execute(
                            select(ChecklistItem)
                            .where(
                                ChecklistItem.checklist_id == checklist.id,
                                ChecklistItem.path == PUNIMI_PATH,
                            )
                        )
                    ).scalars().all()
                    existing_punimi_titles = {item.title for item in existing_punimi if item.title}

                    # Add PUNIMI items
                    for position, title in enumerate(GD_PUNIMI_TEMPLATE):
                        if title not in existing_punimi_titles:
                            db.add(
                                ChecklistItem(
                                    checklist_id=checklist.id,
                                    item_type=ChecklistItemType.CHECKBOX,
                                    position=position,
                                    path=PUNIMI_PATH,
                                    title=title,
                                    is_checked=False,
                                )
                            )

                await db.commit()
                print("GD checklist items seeded for Graphic Design projects.")

        # --- Seed Admin User ---
        admin_email = os.getenv("ADMIN_EMAIL")
        admin_username = os.getenv("ADMIN_USERNAME")
        admin_password = os.getenv("ADMIN_PASSWORD")

        if admin_email and admin_username and admin_password:
            existing_admin = (
                await db.execute(select(User).where(User.email == admin_email))
            ).scalar_one_or_none()
            
            if existing_admin is None:
                print(f"Creating admin user: {admin_email}")
                db.add(
                    User(
                        email=admin_email,
                        username=admin_username,
                        full_name="Admin",
                        role=UserRole.ADMIN,
                        password_hash=get_password_hash(admin_password),
                        is_active=True,
                    )
                )
                await db.commit()
                print("Admin user created successfully.")
            else:
                print("Admin user already exists. Skipping creation.")
        else:
            print("WARNING: Admin credentials not found in .env file. Skipping admin creation.")
            # Debugging aid: print what was found (masked)
            print(f"DEBUG: Found Email: {bool(admin_email)}, User: {bool(admin_username)}, Pass: {bool(admin_password)}")


if __name__ == "__main__":
    asyncio.run(seed())
