"""
Script to sync external meeting checklist to friends database.

Usage:
    Set FRIENDS_DATABASE_URL in environment or .env file:
    FRIENDS_DATABASE_URL=postgresql+asyncpg://user:password@host:port/database

    Then run:
    python sync_external_checklist_to_friends_db.py
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import SessionLocal
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem


def _sync_database_url(url: str) -> str:
    """Convert asyncpg URL to sync URL for raw SQL."""
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url


async def sync_external_checklist_to_friends_db() -> None:
    """Sync external meeting checklist from current DB to friends DB."""
    # Get friends database URL from environment
    friends_db_url = os.getenv("FRIENDS_DATABASE_URL")
    if not friends_db_url:
        print("ERROR: FRIENDS_DATABASE_URL environment variable not set!")
        print("Please set it in your .env file or environment:")
        print("FRIENDS_DATABASE_URL=postgresql+asyncpg://user:password@host:port/database")
        return

    print("Connecting to source database...")
    async with SessionLocal() as source_db:
        # Load external meeting checklist with all items
        print("Loading external meeting checklist from source database...")
        stmt = (
            select(Checklist)
            .where(Checklist.group_key == "external")
            .where(Checklist.task_id.is_(None))
            .where(Checklist.project_id.is_(None))
            .options(selectinload(Checklist.items))
        )
        result = await source_db.execute(stmt)
        source_checklist = result.scalar_one_or_none()

        if not source_checklist:
            print("ERROR: External meeting checklist not found in source database!")
            return

        print(f"Found checklist: {source_checklist.title}")
        print(f"  ID: {source_checklist.id}")
        print(f"  Items: {len(source_checklist.items)}")

        # Prepare checklist data
        checklist_data = {
            "id": source_checklist.id,
            "title": source_checklist.title,
            "task_id": None,
            "project_id": None,
            "note": source_checklist.note,
            "default_owner": source_checklist.default_owner,
            "default_time": source_checklist.default_time,
            "group_key": source_checklist.group_key,
            "columns": source_checklist.columns,
            "position": source_checklist.position,
            "created_at": source_checklist.created_at or datetime.utcnow(),
        }

        # Prepare items data
        items_data = []
        for item in sorted(source_checklist.items, key=lambda x: (x.position or 0, x.id)):
            items_data.append({
                "id": item.id,
                "checklist_id": item.checklist_id,
                "item_type": item.item_type.value if hasattr(item.item_type, 'value') else str(item.item_type),
                "position": item.position or 0,
                "path": item.path,
                "keyword": item.keyword,
                "description": item.description,
                "category": item.category,
                "day": item.day,
                "owner": item.owner,
                "time": item.time,
                "title": item.title,
                "comment": item.comment,
                "is_checked": item.is_checked or False,
            })

        print(f"\nConnecting to friends database...")
        friends_engine = create_async_engine(friends_db_url, pool_pre_ping=True)
        FriendsSessionLocal = async_sessionmaker(friends_engine, expire_on_commit=False, class_=AsyncSession)

        async with FriendsSessionLocal() as friends_db:
            # Check if checklist already exists
            existing_stmt = select(Checklist).where(Checklist.group_key == "external").where(
                Checklist.task_id.is_(None)
            ).where(Checklist.project_id.is_(None))
            existing_result = await friends_db.execute(existing_stmt)
            existing_checklist = existing_result.scalar_one_or_none()

            if existing_checklist:
                print(f"Checklist already exists in friends database (ID: {existing_checklist.id})")
                print("Updating existing checklist...")
                
                # Update checklist using raw SQL
                columns_json = json.dumps(checklist_data["columns"]) if checklist_data["columns"] else None
                await friends_db.execute(
                    text("""
                        UPDATE checklists
                        SET title = :title,
                            note = :note,
                            default_owner = :default_owner,
                            default_time = :default_time,
                            columns = :columns::jsonb,
                            position = :position
                        WHERE id = :id
                    """),
                    {
                        "id": existing_checklist.id,
                        "title": checklist_data["title"],
                        "note": checklist_data["note"],
                        "default_owner": checklist_data["default_owner"],
                        "default_time": checklist_data["default_time"],
                        "columns": columns_json,
                        "position": checklist_data["position"],
                    }
                )
                
                # Delete existing items
                await friends_db.execute(
                    text("DELETE FROM checklist_items WHERE checklist_id = :checklist_id"),
                    {"checklist_id": existing_checklist.id}
                )
                
                checklist_id = existing_checklist.id
            else:
                print("Creating new checklist in friends database...")
                # Create new checklist using raw SQL
                columns_json = json.dumps(checklist_data["columns"]) if checklist_data["columns"] else None
                await friends_db.execute(
                    text("""
                        INSERT INTO checklists (
                            id, title, task_id, project_id, note, default_owner,
                            default_time, group_key, columns, position, created_at
                        ) VALUES (
                            :id, :title, :task_id, :project_id, :note, :default_owner,
                            :default_time, :group_key, :columns::jsonb, :position, :created_at
                        )
                    """),
                    {
                        "id": checklist_data["id"],
                        "title": checklist_data["title"],
                        "task_id": checklist_data["task_id"],
                        "project_id": checklist_data["project_id"],
                        "note": checklist_data["note"],
                        "default_owner": checklist_data["default_owner"],
                        "default_time": checklist_data["default_time"],
                        "group_key": checklist_data["group_key"],
                        "columns": columns_json,
                        "position": checklist_data["position"],
                        "created_at": checklist_data["created_at"],
                    }
                )
                checklist_id = checklist_data["id"]

            # Insert items
            print(f"Inserting {len(items_data)} items...")
            for item_data in items_data:
                item_data["checklist_id"] = checklist_id
                # Use raw SQL to insert items (since we're using asyncpg)
                await friends_db.execute(
                    text("""
                        INSERT INTO checklist_items (
                            id, checklist_id, item_type, position, path, keyword,
                            description, category, day, owner, time, title, comment,
                            is_checked
                        ) VALUES (
                            :id, :checklist_id, :item_type::checklist_item_type, :position, :path, :keyword,
                            :description, :category, :day, :owner, :time, :title, :comment,
                            :is_checked
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            checklist_id = EXCLUDED.checklist_id,
                            item_type = EXCLUDED.item_type,
                            position = EXCLUDED.position,
                            path = EXCLUDED.path,
                            keyword = EXCLUDED.keyword,
                            description = EXCLUDED.description,
                            category = EXCLUDED.category,
                            day = EXCLUDED.day,
                            owner = EXCLUDED.owner,
                            time = EXCLUDED.time,
                            title = EXCLUDED.title,
                            comment = EXCLUDED.comment,
                            is_checked = EXCLUDED.is_checked
                    """),
                    {
                        "id": item_data["id"],
                        "checklist_id": item_data["checklist_id"],
                        "item_type": item_data["item_type"],
                        "position": item_data["position"],
                        "path": item_data["path"],
                        "keyword": item_data["keyword"],
                        "description": item_data["description"],
                        "category": item_data["category"],
                        "day": item_data["day"],
                        "owner": item_data["owner"],
                        "time": item_data["time"],
                        "title": item_data["title"],
                        "comment": item_data["comment"],
                        "is_checked": item_data["is_checked"],
                    }
                )

            await friends_db.commit()
            print(f"\n✓ Successfully synced external meeting checklist to friends database!")
            print(f"  Checklist ID: {checklist_id}")
            print(f"  Items synced: {len(items_data)}")

        await friends_engine.dispose()


if __name__ == "__main__":
    asyncio.run(sync_external_checklist_to_friends_db())
