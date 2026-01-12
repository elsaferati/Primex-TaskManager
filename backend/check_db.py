from __future__ import annotations
import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy import text
from app.db import SessionLocal

load_dotenv()

async def check_schema():
    async with SessionLocal() as db:
        with open("output.txt", "w") as f:
            f.write("--- SCHEMA INSPECTION ---\n")
            # List all columns for relevant tables
            tables = ['system_task_templates', 'projects', 'tasks']
            for table in tables:
                f.write(f"\nTable: {table}\n")
                result = await db.execute(text(f"""
                    SELECT column_name, data_type, udt_name 
                    FROM information_schema.columns 
                    WHERE table_name = '{table}'
                    ORDER BY column_name;
                """))
                rows = result.all()
                if not rows:
                    f.write("  No columns found (table might not exist or name is wrong)\n")
                for row in rows:
                    f.write(f"  COL: {row.column_name:20} | TYPE: {row.data_type:20} | UDT: {row.udt_name}\n")

if __name__ == "__main__":
    try:
        asyncio.run(check_schema())
        print("Done. Check output.txt")
    except Exception as e:
        with open("output.txt", "a") as f:
            f.write(f"\nERROR: {str(e)}\n")
        print(f"Error: {e}")
