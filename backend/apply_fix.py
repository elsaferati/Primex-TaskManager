from __future__ import annotations
import asyncio
import os
import traceback
from dotenv import load_dotenv
from sqlalchemy import text
from app.db import SessionLocal

load_dotenv()

async def apply_fix():
    print("Starting database fix (table by table)...")
    
    tables_commands = {
        "system_task_templates": [
            "ALTER TABLE system_task_templates ALTER COLUMN scope TYPE VARCHAR(50) USING scope::VARCHAR(50)",
            "ALTER TABLE system_task_templates ALTER COLUMN priority TYPE VARCHAR(50) USING priority::VARCHAR(50)",
            "ALTER TABLE system_task_templates ALTER COLUMN frequency TYPE VARCHAR(50) USING frequency::VARCHAR(50)",
            "ALTER TABLE system_task_templates ALTER COLUMN finish_period TYPE VARCHAR(50) USING finish_period::VARCHAR(50)",
        ],
        "projects": [
            "ALTER TABLE projects ALTER COLUMN current_phase TYPE VARCHAR(50) USING current_phase::VARCHAR(50)",
            "ALTER TABLE projects ALTER COLUMN status TYPE VARCHAR(50) USING status::VARCHAR(50)",
        ],
        "tasks": [
            "ALTER TABLE tasks ALTER COLUMN phase TYPE VARCHAR(50) USING phase::VARCHAR(50)",
            "ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(50) USING status::VARCHAR(50)",
            "ALTER TABLE tasks ALTER COLUMN priority TYPE VARCHAR(50) USING priority::VARCHAR(50)",
            "ALTER TABLE tasks ALTER COLUMN finish_period TYPE VARCHAR(50) USING finish_period::VARCHAR(50)",
        ]
    }
    
    with open("fix_log.txt", "w") as log:
        log.write("--- REFACTORED FIX LOG ---\n")
        
        for table, commands in tables_commands.items():
            log.write(f"\nProcessing table: {table}\n")
            print(f"Processing table: {table}")
            
            async with SessionLocal() as db:
                for cmd in commands:
                    log.write(f"Executing: {cmd}\n")
                    try:
                        await db.execute(text(cmd))
                        log.write("Success.\n")
                    except Exception as e:
                        log.write(f"ERROR: {str(e)}\n")
                        # If it says it's already a varchar, that's fine too
                        if "already" in str(e).lower():
                             log.write("Assuming already fixed or similar.\n")
                        print(f"Error on: {cmd}")
                
                try:
                    await db.commit()
                    log.write(f"Committed changes for {table}.\n")
                except Exception as e:
                    log.write(f"COMMIT ERROR for {table}: {str(e)}\n")
                    print(f"Commit error for {table}")

    print("Done. Check fix_log.txt")

if __name__ == "__main__":
    asyncio.run(apply_fix())
