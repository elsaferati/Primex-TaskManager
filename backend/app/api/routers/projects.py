from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update, cast, String as SQLString
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import ProjectPhaseStatus, TaskStatus, UserRole
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.department import Department
from app.models.ga_note import GaNote
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.models.vs_workflow_item import VsWorkflowItem
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from app.schemas.vs_workflow_item import VsWorkflowItemOut, VsWorkflowItemUpdate
from app.services.workflow_service import initialize_vs_workflow, get_active_workflow_items


router = APIRouter()

DEV_PHASES = [
    ProjectPhaseStatus.MEETINGS,
    ProjectPhaseStatus.PLANNING,
    ProjectPhaseStatus.DEVELOPMENT,
    ProjectPhaseStatus.TESTING,
    ProjectPhaseStatus.DOCUMENTATION,
    ProjectPhaseStatus.CLOSED,
]

MST_PHASES = [
    ProjectPhaseStatus.PLANNING,
    ProjectPhaseStatus.PRODUCT,
    ProjectPhaseStatus.CONTROL,
    ProjectPhaseStatus.FINAL,
    ProjectPhaseStatus.CLOSED,
]

VS_PHASES = [
    ProjectPhaseStatus.PLANNING,
    ProjectPhaseStatus.AMAZON,
    ProjectPhaseStatus.CHECK,
    ProjectPhaseStatus.DREAMROBOT,
    ProjectPhaseStatus.CLOSED,
]

# Standard/Fallback sequence
PHASE_SEQUENCE = [
    ProjectPhaseStatus.MEETINGS,
    ProjectPhaseStatus.PLANNING,
    ProjectPhaseStatus.DEVELOPMENT,
    ProjectPhaseStatus.TESTING,
    ProjectPhaseStatus.DOCUMENTATION,
    ProjectPhaseStatus.PRODUCT,
    ProjectPhaseStatus.CONTROL,
    ProjectPhaseStatus.FINAL,
    ProjectPhaseStatus.AMAZON,
    ProjectPhaseStatus.CHECK,
    ProjectPhaseStatus.DREAMROBOT,
    ProjectPhaseStatus.CLOSED,
]


def get_project_sequence(project: Project, department_name: str | None = None) -> list[ProjectPhaseStatus]:
    # This is a bit simplistic, but we can refine it
    title = project.title.upper()
    department_label = (department_name or "").upper()
    # Check department if available (would need department name)
    # For now, base it on title patterns similar to trigger logic
    if "VS" in title or "VL" in title:
        return VS_PHASES
    if "MST" in title:
        return MST_PHASES
    if department_label in {"PROJECT CONTENT MANAGER", "GRAPHIC DESIGN", "PCM", "GD"}:
        return MST_PHASES
    # Default to DEV if it looks like a dev project or fallback
    return DEV_PHASES


def phase_index(phase: ProjectPhaseStatus) -> int:
    try:
        return PHASE_SEQUENCE.index(phase)
    except ValueError:
        return -1


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    department_id: uuid.UUID | None = None,
    include_all_departments: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ProjectOut]:
    stmt = select(Project)
    if department_id:
        if not include_all_departments:
            ensure_department_access(user, department_id)
        stmt = stmt.where(Project.department_id == department_id)

    if include_all_departments:
        ensure_manager_or_admin(user)
    elif user.role != UserRole.ADMIN:
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

    current_phase = payload.current_phase or ProjectPhaseStatus.MEETINGS
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
    await db.flush() # Ensure project ID is generated
    
    # Trigger VS Amazon Workflow if applicable
    title_upper = project.title.upper()
    if "VS/VL AMAZON" in title_upper or "VS AMAZON" in title_upper:
        await initialize_vs_workflow(db, project.id)
    
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
        current_idx = phase_index(project.current_phase)
        next_idx = phase_index(payload.current_phase)
        if current_idx == -1 or next_idx == -1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project phase")
        if next_idx < current_idx: # Allow moving backward, but not skipping forward
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot skip phases forward. Use advance-phase endpoint to move to the next phase.",
            )
        project.current_phase = payload.current_phase
        await db.execute(
            update(Task)
            .where(Task.project_id == project.id)
            .values(phase=payload.current_phase)
        )
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


@router.post("/{project_id}/advance-phase", response_model=ProjectOut)
async def advance_project_phase(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectOut:
    ensure_manager_or_admin(user)
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    department_name = None
    if project.department_id is not None:
        department = (
            await db.execute(select(Department).where(Department.id == project.department_id))
        ).scalar_one_or_none()
        department_name = department.name if department else None

    sequence = get_project_sequence(project, department_name)
    try:
        current_idx = sequence.index(project.current_phase)
    except ValueError:
        # If not in its specific sequence, fallback to general
        try:
            current_idx = PHASE_SEQUENCE.index(project.current_phase)
            sequence = PHASE_SEQUENCE
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project phase")
            
    if current_idx >= len(sequence) - 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project is already in the final phase")

    open_tasks = (
        await db.execute(
            select(func.count(Task.id)).where(
                Task.project_id == project.id,
                Task.phase == project.current_phase,
                cast(Task.status, SQLString) != TaskStatus.DONE.value,
            )
        )
    ).scalar_one()
    unchecked_items = (
        await db.execute(
            select(func.count(ChecklistItem.id))
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(
                Checklist.project_id == project.id,
                ChecklistItem.is_checked.is_(False),
            )
        )
    ).scalar_one()
    if open_tasks or unchecked_items:
        detail = "Complete all tasks and checklist items before advancing the phase."
        if open_tasks and unchecked_items:
            detail = f"Cannot advance phase: {open_tasks} open tasks and {unchecked_items} unchecked checklist items."
        elif open_tasks:
            detail = f"Cannot advance phase: {open_tasks} open tasks."
        else:
            detail = f"Cannot advance phase: {unchecked_items} unchecked checklist items."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    project.current_phase = sequence[current_idx + 1]
    await db.execute(
        update(Task)
        .where(Task.project_id == project.id)
        .values(phase=project.current_phase)
    )
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


@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can delete projects")
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    await db.execute(
        update(Meeting).where(Meeting.project_id == project.id).values(project_id=None)
    )
    await db.execute(
        update(GaNote).where(GaNote.project_id == project.id).values(project_id=None)
    )
    await db.execute(
        update(Task).where(Task.project_id == project.id).values(project_id=None)
    )

    await db.delete(project)
    await db.commit()
    return {"status": "deleted"}


@router.get("/{project_id}/workflow-items", response_model=list[VsWorkflowItemOut])
async def list_workflow_items(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[VsWorkflowItemOut]:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)
    
    # We need to bridge AsyncSession to Session if the service uses sync DB calls, 
    # but here we'll assume the service function is adapted or we use the async pattern.
    # For now, let's keep it consistent with the existing codebase's DB patterns.
    # Note: get_active_workflow_items in the service was written as sync, let's make it async in the service and call it here.
    items = await get_active_workflow_items(db, project_id)
    return items


@router.patch("/workflow-items/{item_id}", response_model=VsWorkflowItemOut)
async def update_workflow_item(
    item_id: uuid.UUID,
    payload: VsWorkflowItemUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> VsWorkflowItemOut:
    item = (await db.execute(select(VsWorkflowItem).where(VsWorkflowItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow item not found")
    
    project = (await db.execute(select(Project).where(Project.id == item.project_id))).scalar_one_or_none()
    if project and project.department_id:
        ensure_department_access(user, project.department_id)
    
    if payload.status is not None:
        item.status = payload.status
    if payload.assigned_to is not None:
        item.assigned_to = payload.assigned_to
    if payload.internal_notes is not None:
        item.internal_notes = payload.internal_notes
        
    await db.commit()
    await db.refresh(item)
    return item
