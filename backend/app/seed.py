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

PROJECT_ACCEPTANCE_PATH = "project acceptance"
GA_DV_MEETING_PATH = "ga/dv meeting"


async def seed() -> None:
    print("Starting seed process...")
    async with SessionLocal() as db:
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
