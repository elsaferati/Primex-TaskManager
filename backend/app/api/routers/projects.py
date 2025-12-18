from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.board import Board
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate


router = APIRouter()


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    board_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ProjectOut]:
    stmt = select(Project)
    if board_id:
        stmt = stmt.where(Project.board_id == board_id)

    if user.role.value != "admin":
        if user.department_id is None:
            return []
        stmt = stmt.join(Board, Board.id == Project.board_id).where(Board.department_id == user.department_id)

    projects = (await db.execute(stmt.order_by(Project.created_at))).scalars().all()
    return [ProjectOut(id=p.id, board_id=p.board_id, name=p.name, description=p.description) for p in projects]


@router.post("", response_model=ProjectOut)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectOut:
    ensure_manager_or_admin(user)
    board = (await db.execute(select(Board).where(Board.id == payload.board_id))).scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    ensure_department_access(user, board.department_id)

    project = Project(board_id=payload.board_id, name=payload.name, description=payload.description)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectOut(id=project.id, board_id=project.board_id, name=project.name, description=project.description)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectOut:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    board = (await db.execute(select(Board).where(Board.id == project.board_id))).scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    ensure_department_access(user, board.department_id)
    return ProjectOut(id=project.id, board_id=project.board_id, name=project.name, description=project.description)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectOut:
    ensure_manager_or_admin(user)
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    board = (await db.execute(select(Board).where(Board.id == project.board_id))).scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    ensure_department_access(user, board.department_id)

    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description

    await db.commit()
    await db.refresh(project)
    return ProjectOut(id=project.id, board_id=project.board_id, name=project.name, description=project.description)

