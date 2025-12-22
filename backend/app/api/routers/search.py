from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.board import Board
from app.models.project import Project
from app.models.task import Task
from app.schemas.search import SearchProjectResult, SearchResponse, SearchTaskResult


router = APIRouter()


@router.get("", response_model=SearchResponse)
async def search(
    q: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> SearchResponse:
    query = q.strip()
    if not query:
        return SearchResponse(tasks=[], projects=[])

    task_stmt = select(Task).where((Task.title.ilike(f"%{query}%")) | (Task.description.ilike(f"%{query}%")))
    project_stmt = select(Project).where(Project.name.ilike(f"%{query}%"))

    if user.role.value != "admin":
        if user.department_id is None:
            return SearchResponse(tasks=[], projects=[])
        task_stmt = task_stmt.where(Task.department_id == user.department_id)
        project_stmt = project_stmt.join(Board, Board.id == Project.board_id).where(Board.department_id == user.department_id)

    tasks = (await db.execute(task_stmt.limit(20))).scalars().all()
    projects = (await db.execute(project_stmt.limit(20))).scalars().all()

    return SearchResponse(
        tasks=[SearchTaskResult(id=t.id, title=t.title, project_id=t.project_id, department_id=t.department_id) for t in tasks],
        projects=[SearchProjectResult(id=p.id, name=p.name, board_id=p.board_id) for p in projects],
    )


