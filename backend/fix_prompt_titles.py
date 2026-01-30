#!/usr/bin/env python3
"""Script to fix existing project prompts that don't have titles"""
import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy import select, text
from app.db import SessionLocal
from app.models.project_prompt import ProjectPrompt

load_dotenv()


async def fix_prompt_titles() -> None:
    """Update all prompts that don't have titles or have empty titles"""
    async with SessionLocal() as db:
        # Get all prompts
        prompts = (await db.execute(select(ProjectPrompt))).scalars().all()
        
        updated_count = 0
        for prompt in prompts:
            # Check if title is None, empty, or just whitespace
            if not prompt.title or not prompt.title.strip():
                # Generate title from content
                content = prompt.content.strip() if prompt.content else ""
                if len(content) > 50:
                    prompt.title = content[:50] + "..."
                elif content:
                    prompt.title = content
                else:
                    prompt.title = "Untitled"
                updated_count += 1
        
        if updated_count > 0:
            await db.commit()
            print(f"Updated {updated_count} prompts with titles")
        else:
            print("All prompts already have titles")
        
        # Verify all prompts have titles
        prompts_after = (await db.execute(select(ProjectPrompt))).scalars().all()
        for prompt in prompts_after:
            if not prompt.title or not prompt.title.strip():
                print(f"WARNING: Prompt {prompt.id} still has no title!")


if __name__ == "__main__":
    asyncio.run(fix_prompt_titles())
