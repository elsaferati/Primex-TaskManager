from __future__ import annotations
import asyncio
from dotenv import load_dotenv
from sqlalchemy import text
from app.db import SessionLocal

load_dotenv()

async def force_fix():
    print("Force-fixing stubborn columns in system_task_templates...")
    async with SessionLocal() as db:
        # We'll try to change them without using 'USING' if possible, or being very explicit
        sql_commands = [
            "ALTER TABLE system_task_templates ALTER COLUMN scope TYPE VARCHAR(50) USING scope::TEXT",
            "ALTER TABLE system_task_templates ALTER COLUMN priority TYPE VARCHAR(50) USING priority::TEXT",
            "ALTER TABLE system_task_templates ALTER COLUMN frequency TYPE VARCHAR(50) USING frequency::TEXT",
            "ALTER TABLE system_task_templates ALTER COLUMN finish_period TYPE VARCHAR(50) USING finish_period::TEXT"
        ]
        
        for cmd in sql_commands:
            try:
                print(f"Executing: {cmd}")
                await db.execute(text(cmd))
                await db.commit()
                print("Success.")
            except Exception as e:
                print(f"FAILED: {cmd}\nError: {e}")

if __name__ == "__main__":
    asyncio.run(force_fix())
