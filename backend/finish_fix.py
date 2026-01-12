from __future__ import annotations
import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy import text
from app.db import SessionLocal

load_dotenv()

async def finish_fix():
    print("Finishing system_task_templates fix...")
    async with SessionLocal() as db:
        # We need to drop defaults before changing types if they are bound to the old type,
        # or just be more forceful with the casts. 
        # The error "operator does not exist: character varying = task_priority" often comes from 
        # a CHECK constraint or DEFAULT that compares a string to the enum.
        
        commands = [
            # Drop constraints first if they exist (ignoring errors if they don't)
            "ALTER TABLE system_task_templates ALTER COLUMN priority DROP DEFAULT",
            "ALTER TABLE system_task_templates ALTER COLUMN scope DROP DEFAULT",
            "ALTER TABLE system_task_templates ALTER COLUMN frequency DROP DEFAULT",
            
            # Change types
            "ALTER TABLE system_task_templates ALTER COLUMN priority TYPE VARCHAR(50) USING priority::TEXT::VARCHAR(50)",
            "ALTER TABLE system_task_templates ALTER COLUMN frequency TYPE VARCHAR(50) USING frequency::TEXT::VARCHAR(50)",
            "ALTER TABLE system_task_templates ALTER COLUMN finish_period TYPE VARCHAR(50) USING finish_period::TEXT::VARCHAR(50)",
            
            # Restore defaults as strings
            "ALTER TABLE system_task_templates ALTER COLUMN priority SET DEFAULT 'NORMAL'",
            "ALTER TABLE system_task_templates ALTER COLUMN scope SET DEFAULT 'ALL'",
        ]
        
        for cmd in commands:
            try:
                print(f"Executing: {cmd}")
                await db.execute(text(cmd))
                await db.commit() # Commit after each to avoid transaction abortion
                print("Success.")
            except Exception as e:
                print(f"Error: {e}")
                
if __name__ == "__main__":
    asyncio.run(finish_fix())
