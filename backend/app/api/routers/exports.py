from __future__ import annotations

import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.task import Task
from app.models.task_status import TaskStatus
from app.models.user import User


router = APIRouter()


async def _query_tasks(
    *,
    db: AsyncSession,
    user,
    department_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    status_id: uuid.UUID | None,
    planned_from: date | None,
    planned_to: date | None,
) -> list[Task]:
    stmt = select(Task)

    if user.role.value != "admin":
        if user.department_id is None:
            return []
        stmt = stmt.where(Task.department_id == user.department_id)

    if department_id:
        ensure_department_access(user, department_id)
        stmt = stmt.where(Task.department_id == department_id)
    if user_id:
        stmt = stmt.where(Task.assigned_to_user_id == user_id)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if status_id:
        stmt = stmt.where(Task.status_id == status_id)
    if planned_from:
        stmt = stmt.where(Task.planned_for >= planned_from)
    if planned_to:
        stmt = stmt.where(Task.planned_for <= planned_to)

    return (await db.execute(stmt.order_by(Task.created_at.desc()))).scalars().all()


async def _maps(db: AsyncSession, tasks: list[Task]) -> tuple[dict[uuid.UUID, str], dict[uuid.UUID, str]]:
    status_ids = {t.status_id for t in tasks}
    user_ids = {t.assigned_to_user_id for t in tasks if t.assigned_to_user_id is not None}
    status_map: dict[uuid.UUID, str] = {}
    user_map: dict[uuid.UUID, str] = {}

    if status_ids:
        statuses = (await db.execute(select(TaskStatus).where(TaskStatus.id.in_(status_ids)))).scalars().all()
        status_map = {s.id: s.name for s in statuses}
    if user_ids:
        users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        user_map = {u.id: (u.full_name or u.username) for u in users}
    return status_map, user_map


def _task_rows(tasks: list[Task], status_map: dict[uuid.UUID, str], user_map: dict[uuid.UUID, str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for t in tasks:
        rows.append(
            [
                str(t.id),
                t.title,
                t.description or "",
                t.task_type.value,
                status_map.get(t.status_id, ""),
                str(t.department_id),
                str(t.project_id),
                user_map.get(t.assigned_to_user_id, "") if t.assigned_to_user_id else "",
                t.planned_for.isoformat() if t.planned_for else "",
                "yes" if t.is_carried_over else "no",
                t.carried_over_from.isoformat() if t.carried_over_from else "",
                "yes" if t.is_milestone else "no",
                "yes" if t.reminder_enabled else "no",
                t.created_at.isoformat() if t.created_at else "",
                t.completed_at.isoformat() if t.completed_at else "",
            ]
        )
    return rows


EXPORT_HEADERS = [
    "id",
    "title",
    "description",
    "task_type",
    "status",
    "department_id",
    "project_id",
    "assigned_to",
    "planned_for",
    "is_carried_over",
    "carried_over_from",
    "is_milestone",
    "reminder_enabled",
    "created_at",
    "completed_at",
]


@router.get("/tasks.csv")
async def export_tasks_csv(
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status_id: uuid.UUID | None = None,
    planned_from: date | None = None,
    planned_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_manager_or_admin(user)
    tasks = await _query_tasks(
        db=db,
        user=user,
        department_id=department_id,
        user_id=user_id,
        project_id=project_id,
        status_id=status_id,
        planned_from=planned_from,
        planned_to=planned_to,
    )
    status_map, user_map = await _maps(db, tasks)
    rows = _task_rows(tasks, status_map, user_map)

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(EXPORT_HEADERS)
    writer.writerows(rows)
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="tasks_export.csv"'},
    )


@router.get("/tasks.xlsx")
async def export_tasks_xlsx(
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status_id: uuid.UUID | None = None,
    planned_from: date | None = None,
    planned_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_manager_or_admin(user)
    tasks = await _query_tasks(
        db=db,
        user=user,
        department_id=department_id,
        user_id=user_id,
        project_id=project_id,
        status_id=status_id,
        planned_from=planned_from,
        planned_to=planned_to,
    )
    status_map, user_map = await _maps(db, tasks)
    rows = _task_rows(tasks, status_map, user_map)

    wb = Workbook()
    ws = wb.active
    ws.title = "Tasks"
    ws.append(EXPORT_HEADERS)
    for row in rows:
        ws.append(row)

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="tasks_export.xlsx"'},
    )


@router.get("/tasks.pdf")
async def export_tasks_pdf(
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status_id: uuid.UUID | None = None,
    planned_from: date | None = None,
    planned_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_manager_or_admin(user)
    tasks = await _query_tasks(
        db=db,
        user=user,
        department_id=department_id,
        user_id=user_id,
        project_id=project_id,
        status_id=status_id,
        planned_from=planned_from,
        planned_to=planned_to,
    )
    status_map, user_map = await _maps(db, tasks)

    bio = io.BytesIO()
    c = canvas.Canvas(bio, pagesize=letter)
    width, height = letter
    y = height - inch

    c.setFont("Helvetica-Bold", 14)
    c.drawString(inch, y, "Tasks Export (Summary)")
    y -= 0.4 * inch

    c.setFont("Helvetica", 10)
    c.drawString(inch, y, f"Total tasks: {len(tasks)}")
    y -= 0.3 * inch

    counts: dict[str, int] = {}
    for t in tasks:
        name = status_map.get(t.status_id, "Unknown")
        counts[name] = counts.get(name, 0) + 1
    for name, count in sorted(counts.items(), key=lambda kv: kv[0].lower()):
        c.drawString(inch, y, f"{name}: {count}")
        y -= 0.22 * inch
        if y < inch:
            c.showPage()
            y = height - inch

    if tasks:
        if y < 1.5 * inch:
            c.showPage()
            y = height - inch
        c.setFont("Helvetica-Bold", 12)
        c.drawString(inch, y, "Tasks")
        y -= 0.3 * inch
        c.setFont("Helvetica", 9)
        for t in tasks[:200]:
            line = f"- {t.title} [{status_map.get(t.status_id, '')}]"
            assignee = user_map.get(t.assigned_to_user_id, "") if t.assigned_to_user_id else ""
            if assignee:
                line += f" @ {assignee}"
            c.drawString(inch, y, line[:120])
            y -= 0.2 * inch
            if y < inch:
                c.showPage()
                y = height - inch
                c.setFont("Helvetica", 9)

    c.save()
    bio.seek(0)
    return StreamingResponse(
        bio,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="tasks_export.pdf"'},
    )

