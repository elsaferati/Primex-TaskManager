from __future__ import annotations

import asyncio
import os

# 1. Import load_dotenv to read the .env file
from dotenv import load_dotenv
from sqlalchemy import select

from app.auth.security import get_password_hash
from app.db import SessionLocal
from app.models.department import Department
from app.models.enums import ProjectPhaseStatus, TaskStatus, UserRole
from app.models.project import Project
from app.models.user import User

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
                        status=project["status"],
                        current_phase=project["current_phase"],
                        progress_percentage=project["progress_percentage"],
                    )
                )
            await db.commit()
            print("PCM projects seeded.")

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
