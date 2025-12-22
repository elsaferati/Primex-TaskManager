from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import ProjectPhaseStatus, TaskStatus, UserRole
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate


router = APIRouter()


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    department_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ProjectOut]:
    stmt = select(Project)
    if department_id:
        ensure_department_access(user, department_id)
        stmt = stmt.where(Project.department_id == department_id)

    if user.role != UserRole.ADMIN:
        if user.department_id is None:
            return []
        stmt = stmt.where(Project.department_id == user.department_id)

    projects = (await db.execute(stmt.order_by(Project.created_at))).scalars().all()
    return [
        ProjectOut(
            id=p.id,
            title=p.title,
            description=p.description,
            department_id=p.department_id,
            manager_id=p.manager_id,
            current_phase=p.current_phase,
            status=p.status,
            progress_percentage=p.progress_percentage,
            start_date=p.start_date,
            due_date=p.due_date,
            completed_at=p.completed_at,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in projects
    ]


@router.post("", response_model=ProjectOut)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectOut:
    ensure_manager_or_admin(user)
    ensure_department_access(user, payload.department_id)

    if payload.manager_id is not None:
        manager = (await db.execute(select(User).where(User.id == payload.manager_id))).scalar_one_or_none()
        if manager is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manager not found")
        if manager.department_id != payload.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manager must be in department")

    current_phase = payload.current_phase or ProjectPhaseStatus.PLANIFIKIMI
    status_value = payload.status or TaskStatus.TODO
    project = Project(
        title=payload.title,
        description=payload.description,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        current_phase=current_phase,
        status=status_value,
        progress_percentage=payload.progress_percentage or 0,
        start_date=payload.start_date,
        due_date=payload.due_date,
        completed_at=payload.completed_at,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectOut(
        id=project.id,
        title=project.title,
        description=project.description,
        department_id=project.department_id,
        manager_id=project.manager_id,
        current_phase=project.current_phase,
        status=project.status,
        progress_percentage=project.progress_percentage,
        start_date=project.start_date,
        due_date=project.due_date,
        completed_at=project.completed_at,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectOut:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)
    return ProjectOut(
        id=project.id,
        title=project.title,
        description=project.description,
        department_id=project.department_id,
        manager_id=project.manager_id,
        current_phase=project.current_phase,
        status=project.status,
        progress_percentage=project.progress_percentage,
        start_date=project.start_date,
        due_date=project.due_date,
        completed_at=project.completed_at,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


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
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    if payload.title is not None:
        project.title = payload.title
    if payload.description is not None:
        project.description = payload.description
    if payload.manager_id is not None:
        manager = (await db.execute(select(User).where(User.id == payload.manager_id))).scalar_one_or_none()
        if manager is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manager not found")
        if project.department_id is not None and manager.department_id != project.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manager must be in department")
        project.manager_id = payload.manager_id
    if payload.current_phase is not None:
        project.current_phase = payload.current_phase
    if payload.status is not None:
        project.status = payload.status
    if payload.progress_percentage is not None:
        project.progress_percentage = payload.progress_percentage
    if payload.start_date is not None:
        project.start_date = payload.start_date
    if payload.due_date is not None:
        project.due_date = payload.due_date
    if payload.completed_at is not None:
        project.completed_at = payload.completed_at

    await db.commit()
    await db.refresh(project)
    return ProjectOut(
        id=project.id,
        title=project.title,
        description=project.description,
        department_id=project.department_id,
        manager_id=project.manager_id,
        current_phase=project.current_phase,
        status=project.status,
        progress_percentage=project.progress_percentage,
        start_date=project.start_date,
        due_date=project.due_date,
        completed_at=project.completed_at,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )

