from __future__ import annotations

import asyncio
import os

# 1. Import load_dotenv to read the .env file
from dotenv import load_dotenv
from sqlalchemy import select

from app.auth.security import get_password_hash
from app.db import SessionLocal
from app.models.department import Department
from app.models.enums import UserRole
from app.models.project import Project
from app.models.user import User

# 2. Load environment variables immediately
load_dotenv()

DEPARTMENTS = [
    ("Development", "DEV"),
    ("Project Content Manager", "PCM"),
    ("Graphic Design", "GD"),
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
