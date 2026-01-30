from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, update, cast, String as SQLString, or_, insert, delete
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin, ensure_project_creator
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import ProjectPhaseStatus, ProjectType, TaskPriority, TaskStatus, UserRole
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.department import Department
from app.models.ga_note import GaNote
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.project_planner_exclusion import ProjectPlannerExclusion
from app.models.task import Task
from app.models.user import User
from app.models.vs_workflow_item import VsWorkflowItem
from app.models.task_assignee import TaskAssignee
from app.schemas.project import ProjectCreate, ProjectOut, ProjectRemoveFromDayRequest, ProjectUpdate
from app.schemas.vs_workflow_item import VsWorkflowItemOut, VsWorkflowItemUpdate
from app.services.workflow_service import (
    initialize_vs_workflow,
    get_active_workflow_items,
    dependency_item_ids_from_info,
)
from datetime import timedelta


router = APIRouter()


async def _copy_tasks_from_template_project(
    db: AsyncSession, project: Project, created_by_id: uuid.UUID
) -> None:
    """Copy tasks from a VS/VL template project to a newly created project."""
    # Find the template project (is_template=True and contains VS or VL in title)
    stmt = select(Project).where(
        Project.is_template == True,
    )
    template_projects = (await db.execute(stmt)).scalars().all()
    
    # Find the best matching VS/VL template project based on the new project's title
    template_project = None
    project_title_upper = project.title.upper()
    
    # First, try to find an exact match or closest match
    vs_vl_templates = [tp for tp in template_projects if "VS" in tp.title.upper() or "VL" in tp.title.upper()]
    
    if not vs_vl_templates:
        return
    
    # Match logic:
    # 1. If project title contains "VOGEL" or "TEMPLATE 2", use "VS/VL PROJEKT I VOGEL TEMPLATE 2"
    # 2. If project title contains "MADH", use "VS/VL PROJEKT I MADH"
    # 3. Otherwise, prefer "MADH" (large project) as default
    
    if "VOGEL" in project_title_upper or "TEMPLATE 2" in project_title_upper:
        # Look for the small project template
        for tp in vs_vl_templates:
            if "VOGEL" in tp.title.upper() or "TEMPLATE 2" in tp.title.upper():
                template_project = tp
                break
    elif "MADH" in project_title_upper:
        # Look for the large project template
        for tp in vs_vl_templates:
            if "MADH" in tp.title.upper():
                template_project = tp
                break
    
    # If no specific match found, use the first "MADH" template, or any VS/VL template
    if not template_project:
        for tp in vs_vl_templates:
            if "MADH" in tp.title.upper():
                template_project = tp
                break
        
        if not template_project:
            template_project = vs_vl_templates[0]
    
    if not template_project:
        return
    
    # Fetch all tasks from the template project
    template_tasks = (await db.execute(
        select(Task).where(Task.project_id == template_project.id).order_by(Task.created_at)
    )).scalars().all()
    
    if not template_tasks:
        return
    
    # Map old task IDs to new task IDs for dependency linking
    old_to_new_task_id: dict[uuid.UUID, uuid.UUID] = {}
    
    # Fetch all task assignees from template tasks
    template_task_ids = [t.id for t in template_tasks]
    template_assignees = {}
    if template_task_ids:
        assignee_records = (await db.execute(
            select(TaskAssignee).where(TaskAssignee.task_id.in_(template_task_ids))
        )).scalars().all()
        for assignee in assignee_records:
            if assignee.task_id not in template_assignees:
                template_assignees[assignee.task_id] = []
            template_assignees[assignee.task_id].append(assignee.user_id)
    
    for template_task in template_tasks:
        # Create new task based on template - copy ALL fields
        new_task = Task(
            title=template_task.title,
            description=template_task.description,
            internal_notes=template_task.internal_notes,
            priority=template_task.priority or "NORMAL",
            status=template_task.status or "TODO",  # Copy status from template
            phase=template_task.phase or "AMAZON",
            project_id=project.id,
            department_id=project.department_id,
            created_by=created_by_id,
            # Copy all date fields
            start_date=template_task.start_date,
            due_date=template_task.due_date,  # Copy due_date from template
            # Copy all other fields
            finish_period=template_task.finish_period,
            progress_percentage=template_task.progress_percentage or 0,
            daily_products=template_task.daily_products,
            assigned_to=template_task.assigned_to,  # Copy assigned_to from template
            is_bllok=template_task.is_bllok,
            is_1h_report=template_task.is_1h_report,
            is_r1=template_task.is_r1,
            is_personal=template_task.is_personal,
            is_active=template_task.is_active,
        )
        db.add(new_task)
        await db.flush()  # Get the new task ID
        
        old_to_new_task_id[template_task.id] = new_task.id
        
        # Copy task assignees (multiple assignees from task_assignees table)
        if template_task.id in template_assignees:
            assignee_values = [
                {"task_id": new_task.id, "user_id": user_id}
                for user_id in template_assignees[template_task.id]
            ]
            if assignee_values:
                await db.execute(insert(TaskAssignee), assignee_values)
    
    # Second pass: set dependencies using the mapping
    for template_task in template_tasks:
        if template_task.dependency_task_id and template_task.dependency_task_id in old_to_new_task_id:
            new_task_id = old_to_new_task_id[template_task.id]
            new_dependency_id = old_to_new_task_id[template_task.dependency_task_id]
            await db.execute(
                update(Task).where(Task.id == new_task_id).values(dependency_task_id=new_dependency_id)
            )


async def _copy_tasks_from_mst_template_project(
    db: AsyncSession,
    project: Project,
    created_by_id: uuid.UUID,
    template_project: Project | None = None,
) -> None:
    if project.is_template:
        return
    selected_template = template_project
    if selected_template is None:
        stmt = select(Project).where(Project.is_template == True)
        if project.department_id is not None:
            stmt = stmt.where(Project.department_id == project.department_id)
        template_projects = (await db.execute(stmt.order_by(Project.created_at))).scalars().all()
        if not template_projects:
            return

        selected_template = next(
            (tp for tp in template_projects if tp.project_type == ProjectType.MST.value),
            None,
        )
        if not selected_template:
            for tp in template_projects:
                title_upper = (tp.title or "").upper()
                if "MST" in title_upper:
                    selected_template = tp
                    break
    if not selected_template or selected_template.id == project.id:
        return

    template_tasks = (await db.execute(
        select(Task).where(Task.project_id == selected_template.id).order_by(Task.created_at)
    )).scalars().all()
    if not template_tasks:
        return

    old_to_new_task_id: dict[uuid.UUID, uuid.UUID] = {}
    for template_task in template_tasks:
        new_task = Task(
            title=template_task.title,
            description=template_task.description,
            internal_notes=template_task.internal_notes,
            priority=template_task.priority or TaskPriority.NORMAL,
            status=TaskStatus.TODO,
            phase=template_task.phase or project.current_phase or ProjectPhaseStatus.PLANNING,
            project_id=project.id,
            department_id=project.department_id,
            created_by=created_by_id,
            finish_period=template_task.finish_period,
            progress_percentage=template_task.progress_percentage or 0,
            is_bllok=template_task.is_bllok,
            is_1h_report=template_task.is_1h_report,
            is_r1=template_task.is_r1,
            is_personal=template_task.is_personal,
            is_active=template_task.is_active,
        )
        db.add(new_task)
        await db.flush()
        old_to_new_task_id[template_task.id] = new_task.id

    for template_task in template_tasks:
        if template_task.dependency_task_id and template_task.dependency_task_id in old_to_new_task_id:
            new_task_id = old_to_new_task_id[template_task.id]
            new_dependency_id = old_to_new_task_id[template_task.dependency_task_id]
            await db.execute(
                update(Task).where(Task.id == new_task_id).values(dependency_task_id=new_dependency_id)
            )


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
    if project.project_type == ProjectType.MST.value:
        return MST_PHASES
    if project.project_type == ProjectType.GENERAL.value:
        return DEV_PHASES

    # Legacy fallback based on title/department
    title = project.title.upper()
    department_label = (department_name or "").upper()
    if "VS" in title or "VL" in title:
        return VS_PHASES
    if "MST" in title:
        return MST_PHASES
    if department_label in {"PROJECT CONTENT MANAGER", "GRAPHIC DESIGN", "PCM", "GD"}:
        return MST_PHASES
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
    include_templates: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ProjectOut]:
    stmt = select(Project)
    
    # Exclude template projects by default
    if not include_templates:
        stmt = stmt.where(Project.is_template == False)
    
    if department_id:
        stmt = stmt.where(Project.department_id == department_id)

    projects = (await db.execute(stmt.order_by(Project.created_at))).scalars().all()
    return [
        ProjectOut(
            id=p.id,
            title=p.title,
            description=p.description,
            department_id=p.department_id,
            manager_id=p.manager_id,
            project_type=p.project_type,
            current_phase=p.current_phase,
            status=p.status,
            progress_percentage=p.progress_percentage,
            total_products=p.total_products,
            is_template=p.is_template,
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
    # Allow Admin, Manager, and Staff to create projects
    ensure_project_creator(user)
    ensure_department_access(user, payload.department_id)

    if payload.manager_id is not None:
        manager = (await db.execute(select(User).where(User.id == payload.manager_id))).scalar_one_or_none()
        if manager is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manager not found")
        if manager.department_id != payload.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manager must be in department")

    current_phase = payload.current_phase or ProjectPhaseStatus.MEETINGS
    status_value = payload.status or TaskStatus.TODO
    project_type_value = payload.project_type.value if payload.project_type else None
    template_project: Project | None = None
    if payload.template_project_id is not None:
        template_project = (
            await db.execute(select(Project).where(Project.id == payload.template_project_id))
        ).scalar_one_or_none()
        if template_project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template project not found")
        if template_project.department_id is not None and template_project.department_id != payload.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template project department mismatch")
        if not template_project.is_template:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected project is not a template")
        if project_type_value is None:
            project_type_value = ProjectType.MST.value
        elif project_type_value != ProjectType.MST.value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template project requires MST type")
        template_title = (template_project.title or "").upper()
        if template_project.project_type is not None and template_project.project_type != ProjectType.MST.value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template project must be MST type")
        if template_project.project_type is None and "MST" not in template_title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template project must be MST type")
    project = Project(
        title=payload.title,
        description=payload.description,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        project_type=project_type_value,
        current_phase=current_phase,
        status=status_value,
        progress_percentage=payload.progress_percentage or 0,
        total_products=payload.total_products,
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
    
    # Copy tasks from template project if this is a VS/VL project
    is_vs_vl_project = "VS" in title_upper or "VL" in title_upper
    if is_vs_vl_project:
        await _copy_tasks_from_template_project(db, project, user.id)
    # Copy tasks from MST template project if this is an MST project
    if project.project_type == ProjectType.MST.value:
        await _copy_tasks_from_mst_template_project(db, project, user.id, template_project)
    
    await db.commit()
    await db.refresh(project)
    return ProjectOut(
        id=project.id,
        title=project.title,
        description=project.description,
        department_id=project.department_id,
        manager_id=project.manager_id,
        project_type=project.project_type,
        current_phase=project.current_phase,
        status=project.status,
        progress_percentage=project.progress_percentage,
        total_products=project.total_products,
        is_template=project.is_template,
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
    return ProjectOut(
        id=project.id,
        title=project.title,
        description=project.description,
        department_id=project.department_id,
        manager_id=project.manager_id,
        project_type=project.project_type,
        current_phase=project.current_phase,
        status=project.status,
        progress_percentage=project.progress_percentage,
        total_products=project.total_products,
        is_template=project.is_template,
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
    ensure_project_creator(user)
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
    if payload.project_type is not None:
        project.project_type = payload.project_type.value
    if payload.current_phase is not None:
        current_idx = phase_index(project.current_phase)
        next_idx = phase_index(payload.current_phase)
        if current_idx == -1 or next_idx == -1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project phase")
        if next_idx > current_idx:  # Allow moving backward, but not skipping forward
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot skip phases forward. Use advance-phase endpoint to move to the next phase.",
            )
        project.current_phase = payload.current_phase
        if payload.current_phase == ProjectPhaseStatus.PLANNING and next_idx < current_idx:
            checklist_ids = select(Checklist.id).where(Checklist.project_id == project.id)
            await db.execute(
                update(ChecklistItem)
                .where(ChecklistItem.checklist_id.in_(checklist_ids))
                .values(is_checked=False)
            )
    if payload.status is not None:
        project.status = payload.status
    if payload.progress_percentage is not None:
        project.progress_percentage = payload.progress_percentage
    if payload.total_products is not None:
        project.total_products = payload.total_products
    if payload.is_template is not None:
        project.is_template = payload.is_template
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
        project_type=project.project_type,
        current_phase=project.current_phase,
        status=project.status,
        progress_percentage=project.progress_percentage,
        total_products=project.total_products,
        is_template=project.is_template,
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
    # Allow any role to advance/close phases
    ensure_project_creator(user)
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
    unchecked_items = 0
    checklist_query = (
        select(func.count(ChecklistItem.id))
        .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
        .where(
            Checklist.project_id == project.id,
            ChecklistItem.is_checked.is_(False),
        )
    )
    checklist_filter = None
    if sequence == MST_PHASES:
        if project.current_phase == ProjectPhaseStatus.PLANNING:
            checklist_filter = or_(
                ChecklistItem.path.in_(["project acceptance", "ga/dv meeting"]),
            )
        elif project.current_phase == ProjectPhaseStatus.PRODUCT:
            checklist_filter = ChecklistItem.path.in_(["propozim ko1/ko2", "punimi"])
        elif project.current_phase == ProjectPhaseStatus.CONTROL:
            checklist_filter = ChecklistItem.path == "control ko1/ko2"
        elif project.current_phase == ProjectPhaseStatus.FINAL:
            checklist_filter = ChecklistItem.path == "finalization"
    else:
        checklist_filter = ChecklistItem.path == project.current_phase
    unchecked_items = (await db.execute(checklist_query.where(checklist_filter))).scalar_one()
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
    await db.commit()
    await db.refresh(project)
    return ProjectOut(
        id=project.id,
        title=project.title,
        description=project.description,
        department_id=project.department_id,
        manager_id=project.manager_id,
        project_type=project.project_type,
        current_phase=project.current_phase,
        status=project.status,
        progress_percentage=project.progress_percentage,
        total_products=project.total_products,
        is_template=project.is_template,
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


@router.post("/{project_id}/remove-from-day", response_model=None)
async def remove_project_from_day(
    project_id: uuid.UUID,
    payload: ProjectRemoveFromDayRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can remove projects from days")
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    slot = (payload.time_slot or "ALL").strip().upper()
    if slot not in ("AM", "PM", "ALL"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid time slot")

    existing = (
        await db.execute(
            select(ProjectPlannerExclusion).where(
                ProjectPlannerExclusion.project_id == project.id,
                ProjectPlannerExclusion.user_id == payload.user_id,
                ProjectPlannerExclusion.day_date == payload.day_date,
                ProjectPlannerExclusion.time_slot == slot,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    exclusion = ProjectPlannerExclusion(
        project_id=project.id,
        user_id=payload.user_id,
        day_date=payload.day_date,
        time_slot=slot,
        created_by=user.id,
    )
    db.add(exclusion)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/workflow-items", response_model=list[VsWorkflowItemOut])
async def list_workflow_items(
    project_id: uuid.UUID,
    phase: str | None = None,
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
    items = await get_active_workflow_items(db, project_id, phase)
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
        if payload.status == "DONE" and item.dependency_info:
            project_items = (
                await db.execute(
                    select(VsWorkflowItem).where(VsWorkflowItem.project_id == item.project_id)
                )
            ).scalars().all()
            dependency_ids = dependency_item_ids_from_info(item.dependency_info, project_items)
            if dependency_ids:
                pending = (
                    await db.execute(
                        select(VsWorkflowItem)
                        .where(
                            VsWorkflowItem.project_id == item.project_id,
                            VsWorkflowItem.id.in_(dependency_ids),
                            VsWorkflowItem.status != "DONE",
                        )
                    )
                ).scalars().first()
                if pending is not None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot mark as done before dependencies are completed.",
                    )
        item.status = payload.status
    if payload.assigned_to is not None:
        item.assigned_to = payload.assigned_to
    if payload.internal_notes is not None:
        item.internal_notes = payload.internal_notes
        
    await db.commit()
    await db.refresh(item)
    return item
