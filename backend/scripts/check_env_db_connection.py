from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import engine


async def main() -> None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(text("select current_database(), current_user"))
        ).one()
        print(f"database={row[0]} user={row[1]}")


if __name__ == "__main__":
    asyncio.run(main())
