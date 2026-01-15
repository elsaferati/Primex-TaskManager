"""Fix tasks with 'bllok' in title that are incorrectly marked as blocked."""

import asyncio
from sqlalchemy import select, update
from app.db import SessionLocal
from app.models.task import Task


async def fix_bllok_tasks():
    """Set is_bllok to false for tasks with 'bllok' in title that shouldn't be blocked."""
    async with SessionLocal() as db:
        # Find all tasks with 'bllok' in title that are marked as blocked
        result = await db.execute(
            select(Task).where(
                Task.title.ilike('%bllok%'),
                Task.is_bllok == True,
                Task.project_id.is_(None)  # Only Fast Tasks
            )
        )
        tasks = result.scalars().all()
        
        if not tasks:
            print("No tasks found with 'bllok' in title that are marked as blocked.")
            return
        
        print(f"Found {len(tasks)} task(s) to fix:")
        for task in tasks:
            print(f"  - {task.title} (ID: {task.id})")
        
        # Update all found tasks
        await db.execute(
            update(Task)
            .where(
                Task.title.ilike('%bllok%'),
                Task.is_bllok == True,
                Task.project_id.is_(None)
            )
            .values(is_bllok=False)
        )
        
        await db.commit()
        print(f"\nSuccessfully updated {len(tasks)} task(s). They should now appear in the Normal bucket.")


if __name__ == "__main__":
    asyncio.run(fix_bllok_tasks())
