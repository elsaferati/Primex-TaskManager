from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem, ChecklistItemAssignee
from app.models.common_entry import CommonEntry
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.system_task_occurrence import SystemTaskOccurrence
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.task_status import TaskStatus
from app.models.user import User
from app.models.enums import UserRole, ChecklistItemType


router = APIRouter()

DATE_LABEL_RE = re.compile(r"Date:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
DATE_RANGE_RE = re.compile(r"Date range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
START_RE = re.compile(r"Start:\s*(\d{1,2}:\d{2})", re.IGNORECASE)
UNTIL_RE = re.compile(r"Until:\s*(\d{1,2}:\d{2})", re.IGNORECASE)
FROM_TO_RE = re.compile(r"From:\s*(\d{1,2}:\d{2})\s*-\s*To:\s*(\d{1,2}:\d{2})", re.IGNORECASE)
TIME_RANGE_RE = re.compile(r"\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)")


def _initials(label: str) -> str:
    parts = [part for part in re.split(r"\s+", label.strip()) if part]
    return "".join(part[0].upper() for part in parts)


def _format_excel_date(d: date) -> str:
    return f"{d.day:02d}-{d.month:02d}-{d.year}"


def _day_code(d: date) -> str:
    codes = ["H", "M", "MR", "E", "P", "S", "D"]
    return codes[d.weekday()] if 0 <= d.weekday() < len(codes) else ""


async def _assignees_for_tasks(db: AsyncSession, task_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    if not task_ids:
        return {}
    rows = (
        await db.execute(
            select(TaskAssignee.task_id, User)
            .join(User, TaskAssignee.user_id == User.id)
            .where(TaskAssignee.task_id.in_(task_ids))
        )
    ).all()
    out: dict[uuid.UUID, list[str]] = {task_id: [] for task_id in task_ids}
    for task_id, user in rows:
        label = user.full_name or user.username or ""
        if not label:
            continue
        out.setdefault(task_id, []).append(label)
    return out


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
                "yes" if t.reminder_enabled else "no",
                t.created_at.isoformat() if t.created_at else "",
                t.completed_at.isoformat() if t.completed_at else "",
            ]
        )
    return rows


def _initials(label: str | None) -> str:
    if not label:
        return ""
    return "".join(part[0] for part in label.split() if part).upper()


def _resolve_period(finish_period: str | None, date_value: date | datetime | None) -> str:
    if finish_period in {"AM", "PM"}:
        return finish_period
    if date_value is None:
        return "AM"
    if isinstance(date_value, datetime):
        return "PM" if date_value.hour >= 12 else "AM"
    return "AM"


def _tyo_label(base_date: date | None, completed_at: date | None, today: date) -> str:
    if completed_at and completed_at == today:
        return "T"
    if base_date is None:
        return "-"
    if base_date == today:
        return "T"
    delta = (today - base_date).days
    if delta == 1:
        return "Y"
    if delta > 1:
        return str(delta)
    return "-"


def _no_project_type_label(task: Task) -> str:
    if task.is_bllok:
        return "BLLOK"
    if task.is_1h_report:
        return "1H"
    if task.is_r1:
        return "R1"
    if task.is_personal:
        return "Personal"
    if task.ga_note_origin_id:
        return "GA"
    return "Normal"


def _fast_subtype_short(task: Task) -> str:
    base = _no_project_type_label(task)
    if base == "BLLOK":
        return "BLL"
    if base == "Personal":
        return "P:"
    if base == "Normal":
        return "N"
    return base


def _system_frequency_short_label(freq: str | None) -> str:
    if not freq:
        return "-"
    mapping = {
        "DAILY": "D",
        "WEEKLY": "W",
        "MONTHLY": "M",
        "YEARLY": "Y",
        "3_MONTHS": "3M",
        "6_MONTHS": "6M",
    }
    return mapping.get(freq, str(freq))


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


@router.get("/checklists.xlsx")
async def export_checklist_xlsx(
    checklist_id: uuid.UUID,
    include_ko2: bool = False,
    path: str | None = None,
    format: str | None = None,
    title: str | None = None,
    exclude_path: list[str] | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    checklist = (
        await db.execute(select(Checklist).where(Checklist.id == checklist_id))
    ).scalar_one_or_none()
    if checklist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")

    if checklist.project_id is not None:
        project = (
            await db.execute(select(Project).where(Project.id == checklist.project_id))
        ).scalar_one_or_none()
        if project is not None and project.department_id is not None:
            ensure_department_access(user, project.department_id)
    elif checklist.task_id is not None:
        task = (
            await db.execute(select(Task).where(Task.id == checklist.task_id))
        ).scalar_one_or_none()
        if task is not None and task.department_id is not None:
            ensure_department_access(user, task.department_id)
    elif checklist.group_key and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    items_stmt = (
        select(ChecklistItem)
        .where(ChecklistItem.checklist_id == checklist.id)
        .where(ChecklistItem.item_type == ChecklistItemType.CHECKBOX)
    )
    if format == "mst":
        items_stmt = items_stmt.where(ChecklistItem.path.is_not(None), ChecklistItem.title.is_not(None))
    if path:
        items_stmt = items_stmt.where(ChecklistItem.path == path)
    if exclude_path:
        items_stmt = items_stmt.where(~ChecklistItem.path.in_(exclude_path))
    items = (
        await db.execute(items_stmt.order_by(ChecklistItem.position, ChecklistItem.id))
    ).scalars().all()

    if format == "mst":
        headers = ["NR", "PATH", "DETYRAT", "KEYWORDS", "PERSHKRIMI", "KATEGORIA", "CHECK", "INCL", "KOMENT"]
    else:
        headers = ["NR", "TASK", "COMMENT", "CHECK", "TIME", "KOMENT"]
        if include_ko2:
            headers.append("KO2")

    assignee_initials: dict[uuid.UUID, str] = {}
    if format == "mst" and items:
        item_ids = [item.id for item in items if item.id is not None]
        if item_ids:
            assignees = (
                await db.execute(
                    select(ChecklistItemAssignee.checklist_item_id, User.full_name, User.username)
                    .join(User, User.id == ChecklistItemAssignee.user_id)
                    .where(ChecklistItemAssignee.checklist_item_id.in_(item_ids))
                )
            ).all()
            initials_map: dict[uuid.UUID, list[str]] = {}
            for item_id, full_name, username in assignees:
                label = full_name or username or ""
                initials = "".join(part[0] for part in label.split() if part).upper()
                if not initials:
                    continue
                initials_map.setdefault(item_id, []).append(initials)
            assignee_initials = {
                item_id: ", ".join(sorted(set(values)))
                for item_id, values in initials_map.items()
                if values
            }

    wb = Workbook()
    ws = wb.active
    raw_title = title or checklist.title or "Checklist"
    title = raw_title.upper()
    ws.title = raw_title[:31]
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    title_cell = ws.cell(row=1, column=1, value=title)
    title_cell.font = Font(bold=True, size=16)
    title_cell.alignment = Alignment(horizontal="center", vertical="center")

    header_row = 3
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
        cell.alignment = Alignment(
            horizontal="left",
            vertical="center",
            wrap_text=False if header == "NR" else True,
        )

    if format == "mst":
        column_widths = {
            "NR": 3,
            "PATH": 22,
            "DETYRAT": 28,
            "KEYWORDS": 20,
            "PERSHKRIMI": 36,
            "KATEGORIA": 16,
            "CHECK": 8,
            "INCL": 10,
            "KOMENT": 24,
        }
    else:
        column_widths = {
            "NR": 3,
            "TASK": 36,
            "COMMENT": 46,
            "CHECK": 8,
            "TIME": 10,
            "KOMENT": 24,
            "KO2": 6,
        }
    for col_idx, header in enumerate(headers, start=1):
        width = column_widths.get(header, 16)
        ws.column_dimensions[ws.cell(row=header_row, column=col_idx).column_letter].width = width

    data_row = header_row + 1
    for idx, item in enumerate(items, start=1):
        if format == "mst":
            incl_value = assignee_initials.get(item.id) or (item.owner or "")
            row_values = [
                idx,
                item.path or "",
                item.title or "",
                item.keyword or "",
                item.description or "",
                item.category or "",
                "yes" if item.is_checked else "",
                incl_value,
                item.comment or "",
            ]
        else:
            row_values = [
                idx,
                item.title or "",
                item.description or "",
                "yes" if item.is_checked else "",
                item.keyword or "",
                item.comment or "",
            ]
            if include_ko2:
                row_values.append("yes" if str(item.time or "").lower() in {"1", "true", "yes"} else "")
        for col_idx, value in enumerate(row_values, start=1):
            cell = ws.cell(row=data_row, column=col_idx, value=value)
            cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
            if col_idx == 1:
                cell.font = Font(bold=True)
        data_row += 1

    ws.freeze_panes = ws["B4"]
    ws.print_title_rows = "3:3"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.fitToPage = True
    ws.page_margins.left = 0.1
    ws.page_margins.right = 0.1
    ws.page_margins.top = 0.36
    ws.page_margins.bottom = 0.51
    ws.page_margins.header = 0.15
    ws.page_margins.footer = 0.2

    last_row = data_row - 1
    last_col = len(headers)
    if last_row >= header_row:
        ws.auto_filter.ref = f"A{header_row}:{ws.cell(row=header_row, column=last_col).column_letter}{last_row}"
        thin = Side(style="thin", color="000000")
        thick = Side(style="medium", color="000000")
        for r in range(header_row, last_row + 1):
            for c in range(1, last_col + 1):
                left = thick if c == 1 else thin
                right = thick if c == last_col else thin
                top = thick if r == header_row else thin
                bottom = thick if r == last_row else thin
                ws.cell(row=r, column=c).border = Border(left=left, right=right, top=top, bottom=bottom)

    ws.oddHeader.right.text = "&D &T"
    ws.oddFooter.center.text = "Page &P / &N"
    user_initials = _initials(user.full_name or user.username or "")
    ws.oddFooter.right.text = f"PUNOI: {user_initials or '____'}"

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    filename = checklist.title or "checklist_export"
    safe_filename = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in filename)
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename=\"{safe_filename}.xlsx\"'},
    )

