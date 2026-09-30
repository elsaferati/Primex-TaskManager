"""Check columns required by the revisions around the restored 0135 marker."""

import asyncio

from sqlalchemy import text

from app.db import engine


EXPECTED_COLUMNS = {
    ("ga_notes", "knowledge_tester_id"),
    ("knowledge_prompts", "tester_id"),
    ("knowledge_prompts", "test_task_id"),
    ("realization_daily_close_events", "daily_comment"),
}


async def main() -> None:
    try:
        async with engine.connect() as connection:
            rows = await connection.execute(
                text(
                    "SELECT table_name, column_name FROM information_schema.columns "
                    "WHERE table_schema = current_schema()"
                )
            )
            present = {(row.table_name, row.column_name) for row in rows}
        missing = sorted(EXPECTED_COLUMNS - present)
        if missing:
            raise RuntimeError(f"Missing migration columns: {missing}")
        print("Required migration columns: OK")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
