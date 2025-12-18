from __future__ import annotations

import asyncio
import os

from sqlalchemy import select

from app.auth.security import get_password_hash
from app.db import SessionLocal
from app.models.board import Board
from app.models.department import Department
from app.models.enums import UserRole
from app.models.project import Project
from app.models.task_status import TaskStatus
from app.models.user import User


DEPARTMENT_NAMES = [
    "Development",
    "Project Content Manager",
    "Graphic Design",
]

DEFAULT_STATUSES = [
    ("To Do", 0, False),
    ("In Progress", 1, False),
    ("Review", 2, False),
    ("Blocked", 3, False),
    ("Done", 4, True),
    ("1h Reminder", 5, False),
]


async def seed() -> None:
    async with SessionLocal() as db:
        existing = (await db.execute(select(Department))).scalars().all()
        by_name = {d.name: d for d in existing}
        for name in DEPARTMENT_NAMES:
            if name not in by_name:
                dept = Department(name=name)
                db.add(dept)
        await db.commit()

        departments = (await db.execute(select(Department))).scalars().all()
        for dept in departments:
            board = (
                (await db.execute(select(Board).where(Board.department_id == dept.id))).scalars().first()
            )
            if board is None:
                board = Board(department_id=dept.id, name=f"{dept.name} Board")
                db.add(board)
                await db.flush()

            project = (
                (await db.execute(select(Project).where(Project.board_id == board.id))).scalars().first()
            )
            if project is None:
                db.add(Project(board_id=board.id, name="General"))

            statuses = (await db.execute(select(TaskStatus).where(TaskStatus.department_id == dept.id))).scalars().all()
            status_names = {s.name for s in statuses}
            for name, position, is_done in DEFAULT_STATUSES:
                if name not in status_names:
                    db.add(TaskStatus(department_id=dept.id, name=name, position=position, is_done=is_done))

        await db.commit()

        admin_email = os.getenv("ADMIN_EMAIL")
        admin_username = os.getenv("ADMIN_USERNAME")
        admin_password = os.getenv("ADMIN_PASSWORD")
        if admin_email and admin_username and admin_password:
            existing_admin = (
                await db.execute(select(User).where(User.email == admin_email))
            ).scalar_one_or_none()
            if existing_admin is None:
                db.add(
                    User(
                        email=admin_email,
                        username=admin_username,
                        full_name="Admin",
                        role=UserRole.admin,
                        password_hash=get_password_hash(admin_password),
                        is_active=True,
                    )
                )
                await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())
