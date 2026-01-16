"""
Script to export VS/VL template task descriptions from database
and format them for the seed.py file.

Run: python export_descriptions_to_seed.py
"""

import asyncio
from sqlalchemy import select
from app.db import SessionLocal
from app.models.task import Task
from app.models.project import Project

VS_VL_TEMPLATE_TASKS_KEYS = {
    "ANALIZIMI DHE IDENTIFIKIMI I KOLONAVE": "base",
    "PLOTESIMI I TEMPLATE-IT TE AMAZONIT": "template",
    "KALKULIMI I CMIMEVE": "prices",
    "GJENERIMI I FOTOVE": "photos",
    "KONTROLLIMI I PROD. EGZSISTUESE DHE POSTIMI NE AMAZON": "kontrol",
    "KO1 E PROJEKTIT VS": "ko1",
    "KO2 E PROJEKTIT VS": "ko2",
    "DREAM ROBOT VS": "dreamVs",
    "DREAM ROBOT VL": "dreamVl",
    "KALKULIMI I PESHAVE": "dreamWeights",
}

async def export_descriptions():
    async with SessionLocal() as db:
        # Find VS/VL template projects
        template_projects = (
            await db.execute(
                select(Project).where(
                    Project.is_template == True,
                    (Project.title == "VS/VL PROJEKT I MADH") | 
                    (Project.title == "VS/VL PROJEKT I MADH TEMPLATE")
                )
            )
        ).scalars().all()
        
        if not template_projects:
            print("No VS/VL template projects found!")
            return
        
        template_project = template_projects[0]
        print(f"Found template project: {template_project.title}\n")
        
        # Get all tasks
        tasks = (
            await db.execute(
                select(Task).where(Task.project_id == template_project.id)
            )
        ).scalars().all()
        
        print("=" * 80)
        print("COPY THIS INTO seed.py - Replace the 'description': None lines")
        print("=" * 80)
        print()
        
        for task in tasks:
            key = VS_VL_TEMPLATE_TASKS_KEYS.get(task.title)
            if not key:
                continue
            
            description = task.description or "None"
            if description != "None":
                # Escape quotes for Python string
                description = description.replace('"', '\\"').replace('\n', '\\n')
                description_str = f'"{description}"'
            else:
                description_str = "None"
            
            print(f'        # Task: {task.title}')
            print(f'        {{')
            print(f'            "key": "{key}",')
            print(f'            "title": "{task.title}",')
            print(f'            "phase": "{task.phase}",')
            if task.description:
                print(f'            "description": {description_str},')
            else:
                print(f'            "description": {description_str},  # No description set')
            if hasattr(task, 'dependency_task_id') and task.dependency_task_id:
                # Find dependency key
                dep_task = next((t for t in tasks if t.id == task.dependency_task_id), None)
                if dep_task:
                    dep_key = VS_VL_TEMPLATE_TASKS_KEYS.get(dep_task.title)
                    if dep_key:
                        print(f'            "dependency_key": "{dep_key}",')
            print(f'        }},')
            print()

if __name__ == "__main__":
    asyncio.run(export_descriptions())
