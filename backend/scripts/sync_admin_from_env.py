from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth.security import get_password_hash
from app.db import SessionLocal
from app.models.enums import UserRole
from app.models.user import User


async def main() -> None:
    load_dotenv()
    email = os.getenv("ADMIN_EMAIL")
    username = os.getenv("ADMIN_USERNAME") or "admin"
    password = os.getenv("ADMIN_PASSWORD")
    if not email or not password:
        raise RuntimeError("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env")

    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            db.add(
                User(
                    email=email,
                    username=username,
                    full_name="Admin",
                    role=UserRole.ADMIN,
                    password_hash=get_password_hash(password),
                    is_active=True,
                )
            )
        else:
            user.username = username
            user.role = UserRole.ADMIN
            user.password_hash = get_password_hash(password)
            user.is_active = True
        await db.commit()
    print(f"admin_synced={email}")


if __name__ == "__main__":
    asyncio.run(main())
