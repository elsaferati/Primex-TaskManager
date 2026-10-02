from __future__ import annotations

import html
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.department import Department
from app.models.enums import UserRole
from app.models.m3_reporting_points import M3ReportingPointsReport
from app.models.meetings_report_settings import MeetingsReportSettings
from app.models.project import Project
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_daily_progress import TaskDailyProgress
from app.models.task_daily_rlz_state import TaskDailyRlzState
from app.models.user import User
from app.services.daily_realization_events import semantic_local_day
from app.services.daily_realization_live import build_live_daily_realization
from app.services.daily_realization_metrics import calculate_daily_metrics
from app.services.daily_rlz_compliance import REASON_LABELS
from app.services.meetings_report_scheduler import normalize_recipients
from app.services.primeflow_report import GmailService, report_timezone

M3_TITLE = "PIKAT PER RAPORTIM M3"
GA_TITLE = "PIKAT PER RAPORTIM PER GA"
MANUAL_POINTS = {
    "underload": "1. NENNGARKESE",
    "overload": "2. MBINGARKESE",
    "reorganization": "3. RIORGANIZIM? (PARA PAUZES) - PAS PAUZES, TAKIM INT, NDARJE E DET?",
    "ga_reorganization": "1. A KA NEVOJE PER RIORGANIZIM?",
}
AUTO_TITLES = {
    "postponed": "1. DET QE JANE SHTY NGA KJO JAVE NE JAVEN TJETER / BRENDA JAVES",
    "untouched": "2. PSE PA PREK TERE DITEN?",
    "same_day": "3. SOT PER SOT - PROGRESI?",
    "realization": "4. REALIZIMI - A MBERRIHET?",
    "ga_postponed": "1. A KA DET QE SHTYHET (SOT/SOT) OSE DEADLINE?",
}
DATE_ACTIONS = {"task.due_date_changed": "due_date", "task.start_date_changed": "start_date"}


def subject_for(day: date) -> str:
    return f"{M3_TITLE} / PER GA - {day:%d.%m.%Y}"


def postponement_risk(original: date, moved_to: date) -> tuple[str, str]:
    week_start = original - timedelta(days=original.weekday())
    if moved_to >= week_start + timedelta(days=7) or moved_to.weekday() == 4:
        return "RREZIK", "#fee2e2"
    return "OK", "#dcfce7"


def select_task_sections(tasks: list[Any], events: list[Any], day: date) -> dict[str, list[dict]]:
    """Classify current tasks; TODO alone determines the untouched section."""
    events_by_task: dict[Any, list[Any]] = defaultdict(list)
    for event in events:
        if event.action in DATE_ACTIONS and semantic_local_day(event.created_at) == day:
            events_by_task[event.entity_id].append(event)
    sections: dict[str, list[dict]] = {key: [] for key in ("postponed", "untouched", "same_day", "ga_postponed")}
    for task in tasks:
        task_events = sorted(events_by_task.get(task.id, []), key=lambda event: (event.created_at, str(event.id)))
        current = {field: semantic_local_day(getattr(task, field, None)) for field in ("start_date", "due_date")}
        original = dict(current)
        # Reverse today's changes to recover the dates before postponement,
        # including cases where start and due were moved in separate requests.
        for event in reversed(task_events):
            before_date = semantic_local_day((event.before or {}).get("value"))
            if before_date is not None:
                original[DATE_ACTIONS[event.action]] = before_date
        created_today = semantic_local_day(task.created_at) == day
        status = str(getattr(task.status, "value", task.status)).upper()
        base = {"task_id": str(task.id), "title": task.title, "status": status,
                "progress": task.progress_percentage or 0,
                "created_date": semantic_local_day(task.created_at).isoformat() if task.created_at else None,
                "start_date": current["start_date"].isoformat() if current["start_date"] else None,
                "due_date": current["due_date"].isoformat() if current["due_date"] else None,
                "deadline_important": bool(task.is_deadline_important)}
        if status == "TODO":
            sections["untouched"].append(dict(base))
        if created_today and current["start_date"] == day and current["due_date"] == day:
            sections["same_day"].append(dict(base))
        moved_fields = []
        for field in ("start_date", "due_date"):
            before, after = original[field], current[field]
            if field == "due_date" and status == "DONE" and semantic_local_day(getattr(task, "completed_at", None)) == after:
                # Completing a late task normalizes due_date to completed_at;
                # that automatic normalization is not a postponement.
                continue
            if before and after and after > before and any(DATE_ACTIONS[event.action] == field for event in task_events):
                moved_fields.append((field, before, after))
        if not moved_fields:
            continue
        old_due = original["due_date"]
        new_due = current["due_date"]
        # Due changes determine risk when present; otherwise use the moved start.
        _, before, after = next((item for item in moved_fields if item[0] == "due_date"), moved_fields[0])
        risk, color = postponement_risk(before, after)
        row = {**base, "old_start_date": original["start_date"].isoformat() if original["start_date"] else None,
               "old_due_date": old_due.isoformat() if old_due else None,
               "from_date": before.isoformat(), "to_date": after.isoformat(), "risk": risk, "risk_color": color,
               "change_reason": next((str((event.after or {}).get("reason") or "") for event in reversed(task_events)
                                      if (event.after or {}).get("reason")), "")}
        # This-week postponements include both safe moves and next-week risks.
        week_start = day - timedelta(days=day.weekday())
        if any(week_start <= old < week_start + timedelta(days=7) for _, old, _ in moved_fields):
            sections["postponed"].append(dict(row))
        originally_same_day = created_today and original["start_date"] == day and old_due == day
        if task.is_deadline_important or originally_same_day:
            row["category"] = " / ".join(label for flag, label in (
                (bool(task.is_deadline_important), "Deadline Important"), (originally_same_day, "SOT/SOT"),
            ) if flag)
            sections["ga_postponed"].append(row)
    return sections


async def build_task_data(db: AsyncSession, day: date) -> dict:
    local_start = datetime.combine(day, time.min, tzinfo=report_timezone())
    start, end = local_start.astimezone(timezone.utc), (local_start + timedelta(days=1)).astimezone(timezone.utc)
    tasks = list((await db.execute(select(Task).where(Task.is_active.is_(True), Task.created_at < end)
                                  .order_by(Task.department_id, Task.title, Task.id))).scalars().all())
    events = list((await db.execute(select(AuditLog).where(
        AuditLog.entity_type == "task", AuditLog.action.in_(DATE_ACTIONS),
        AuditLog.created_at >= start, AuditLog.created_at < end,
    ).order_by(AuditLog.created_at, AuditLog.id))).scalars().all())
    sections = select_task_sections(tasks, events, day)
    selected = {uuid.UUID(row["task_id"]) for rows in sections.values() for row in rows}
    if not selected:
        return sections
    users = {user.id: user.full_name or user.username or user.email
             for user in (await db.execute(select(User))).scalars().all()}
    departments = {item.id: item.name for item in (await db.execute(select(Department))).scalars().all()}
    projects = {item.id: item.title for item in (await db.execute(select(Project).where(
        Project.id.in_({task.project_id for task in tasks if task.id in selected and task.project_id})
    ))).scalars().all()}
    owners: dict[Any, set[Any]] = defaultdict(set)
    for task_id, user_id in (await db.execute(select(TaskAssignee.task_id, TaskAssignee.user_id)
                                            .where(TaskAssignee.task_id.in_(selected)))).all():
        owners[task_id].add(user_id)
    states: dict[Any, list[Any]] = defaultdict(list)
    for state in (await db.execute(select(TaskDailyRlzState).where(
        TaskDailyRlzState.day_date == day, TaskDailyRlzState.task_id.in_(selected),
    ).order_by(TaskDailyRlzState.user_id))).scalars().all():
        states[state.task_id].append(state)
    progress = {item.task_id: item for item in (await db.execute(select(TaskDailyProgress).where(
        TaskDailyProgress.day_date == day, TaskDailyProgress.task_id.in_(selected),
    ))).scalars().all()}
    by_id = {task.id: task for task in tasks}
    for rows in sections.values():
        for row in rows:
            task_id = uuid.UUID(row["task_id"])
            task = by_id[task_id]
            if task.assigned_to:
                owners[task_id].add(task.assigned_to)
            row["assignees"] = ", ".join(sorted(users.get(owner, str(owner)) for owner in owners[task_id])) or "Pa person"
            row["department"] = departments.get(task.department_id, "-")
            row["project"] = projects.get(task.project_id, "-")
            evidence = states[task_id]
            row["comment"] = "\n".join(f"{users.get(item.user_id, 'User')}: {item.comment.strip()}"
                                        for item in evidence if item.comment and item.comment.strip()) or row.get("change_reason") or "Pa koment"
            row["reason"] = "; ".join(dict.fromkeys(REASON_LABELS.get(item.reason_code, item.reason_code)
                                                    for item in evidence if item.reason_code)) or row.get("change_reason") or "-"
            daily = progress.get(task_id)
            row["completed_today"] = daily.completed_delta if daily else 0
            row["completed_value"] = daily.completed_value if daily else None
            row["total_value"] = daily.total_value if daily else None
    return sections


async def build_realization_capture(db: AsyncSession, day: date) -> dict:
    users = list((await db.execute(select(User).where(User.is_active.is_(True),
        User.role == UserRole.STAFF, User.department_id.is_not(None)))).scalars().all())
    ids = {str(user.id) for user in users}
    rows, people, missing = [], [], []
    for department_id in sorted({user.department_id for user in users}, key=str):
        live = await build_live_daily_realization(db, department_id=department_id, day=day)
        if not live.get("baseline_available"):
            missing.append(str(department_id))
        for person in live.get("people", []):
            if str(person["user_id"]) not in ids:
                continue
            rows.extend(person.get("tasks") or [])
            people.append({"user_id": str(person["user_id"]), "name": person.get("user_name"),
                           "percent": (person.get("metrics") or {}).get("raw_plan_realization")})
    metrics = calculate_daily_metrics(rows)
    percent = metrics["raw_plan_realization"] if not missing and users else None
    return {"percent": percent, "employees": len(users), "people": people, "metrics": metrics,
            "baseline_available": not missing and bool(users), "missing_departments": missing,
            "comment": realization_comment(percent)}


def realization_comment(percent: float | None) -> str:
    if percent is None:
        return "Mungojne te dhenat e plota per realizimin e stafit."
    if percent == 50:
        return "Jemi ne 50%."
    return f"Jemi {'mbi' if percent > 50 else 'nen'} 50% me {abs(percent - 50):g} pike perqindjeje."


async def get_settings(db: AsyncSession) -> MeetingsReportSettings:
    row = (await db.execute(select(MeetingsReportSettings).order_by(MeetingsReportSettings.created_at))).scalars().first()
    if row is None:
        raise ValueError("Konfiguro marresit e raportit ekzistues M3 perpara dergimit.")
    return row


async def locked_report(db: AsyncSession, day: date, *, wait: bool = True) -> M3ReportingPointsReport | None:
    function = "pg_advisory_xact_lock" if wait else "pg_try_advisory_xact_lock"
    acquired = (await db.execute(text(f"SELECT {function}(hashtext(:key))"),
                                {"key": f"m3_reporting_points|{day.isoformat()}"})).scalar()
    if not wait and not acquired:
        return None
    row = (await db.execute(select(M3ReportingPointsReport).where(M3ReportingPointsReport.report_date == day))).scalar_one_or_none()
    if row is None:
        row = M3ReportingPointsReport(report_date=day, manual_answers={}, data={}, status="DRAFT")
        db.add(row)
        await db.flush()
    return row


async def refresh_report(db: AsyncSession, row: M3ReportingPointsReport) -> None:
    if row.report_date != datetime.now(report_timezone()).date():
        raise ValueError("Raportet historike perdorin te dhenat e ruajtura te asaj dite.")
    row.data = await build_task_data(db, row.report_date)
    row.generated_at = datetime.now(report_timezone())


def report_payload(row: M3ReportingPointsReport) -> dict:
    return {"id": str(row.id), "report_date": row.report_date.isoformat(), "subject": subject_for(row.report_date),
            "manual_answers": row.manual_answers or {}, "data": row.data or {}, "realization": row.realization,
            "realization_captured_at": row.realization_captured_at.isoformat() if row.realization_captured_at else None,
            "generated_at": row.generated_at.isoformat() if row.generated_at else None, "status": row.status,
            "sent_at": row.sent_at.isoformat() if row.sent_at else None, "last_error": row.last_error}


def _cell(value: Any) -> str:
    return html.escape(str(value if value is not None else "-"), quote=True).replace("\n", "<br>")


def render_html(report: dict) -> str:
    cell_style = "border:1px solid #cbd5e1;padding:8px;vertical-align:top;text-align:left;overflow-wrap:anywhere"
    def manual(keys):
        return "".join(f"<h3>{_cell(MANUAL_POINTS[key])}</h3><p style='white-space:pre-wrap'>{_cell(report['manual_answers'].get(key) or 'Pa pergjigje')}</p>" for key in keys)

    def table(key):
        columns = [("title", "Detyra"), ("assignees", "Personi"), ("department", "Departamenti"),
                   ("project", "Projekti"), ("status", "Statusi"), ("progress", "Progresi %")]
        if key in {"postponed", "ga_postponed"}:
            columns += [("old_start_date", "Start para"), ("start_date", "Start pas"),
                        ("old_due_date", "Due para"), ("due_date", "Due pas"),
                        ("reason", "Arsyeja"), ("comment", "Komenti"), ("risk", "Vleresimi")]
            if key == "ga_postponed":
                columns.append(("category", "Lloji"))
        elif key == "same_day":
            columns += [("created_date", "Creation"), ("start_date", "Start"), ("due_date", "Due"),
                        ("completed_today", "Progresi sot")]
        rows = report["data"].get(key, [])
        header = "".join(f"<th style='{cell_style};background:#f1f5f9'>{label}</th>" for _, label in columns)
        body = "".join("<tr>" + "".join(
            f"<td style='{cell_style}" + (f";background:{'#fee2e2' if row.get('risk') == 'RREZIK' else '#dcfce7'};font-weight:bold" if column == "risk" else "")
            + f"'>{_cell(row.get(column))}</td>" for column, _ in columns) + "</tr>" for row in rows)
        return f"<h3>{_cell(AUTO_TITLES[key])}</h3>" + (f"<table style='width:100%;border-collapse:collapse;font-size:12px'><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table>" if rows else "<p>Asnje detyre.</p>")

    realization = report.get("realization")
    if realization:
        percent = realization.get("percent")
        summary = f"{percent:g}%" if percent is not None else "Pa te dhena"
        realization_html = f"<p><strong>{summary}</strong> — {_cell(realization['comment'])}</p><p>Marrë në: {_cell(report.get('realization_captured_at'))}</p>"
    else:
        realization_html = "<p>Vlera e realizimit merret ne 16:15. Nuk ka vlere te ruajtur per kete date.</p>"
    return ("<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:Arial,sans-serif;color:#0f172a'>"
            + f"<h1>{M3_TITLE}</h1><p>Data: {_cell(report['report_date'])}</p>"
            + manual(("underload", "overload", "reorganization"))
            + "".join(table(key) for key in ("postponed", "untouched", "same_day"))
            + f"<h3>{AUTO_TITLES['realization']}</h3>{realization_html}"
            + f"<h1>{GA_TITLE}</h1>" + manual(("ga_reorganization",)) + table("ga_postponed") + "</body></html>")


def render_plain_text(report: dict) -> str:
    lines = [M3_TITLE, report["report_date"]]
    for key in ("underload", "overload", "reorganization"):
        lines += [MANUAL_POINTS[key], report["manual_answers"].get(key) or "Pa pergjigje"]
    for key in ("postponed", "untouched", "same_day", "realization", "ga_postponed"):
        if key == "ga_postponed":
            lines += [GA_TITLE, MANUAL_POINTS["ga_reorganization"], report["manual_answers"].get("ga_reorganization") or "Pa pergjigje"]
        lines.append(AUTO_TITLES[key])
        if key == "realization":
            realization = report.get("realization")
            lines.append(f"{realization.get('percent')}% - {realization['comment']}" if realization and realization.get("percent") is not None
                         else "Pa te dhena te ruajtura ne 16:15.")
            continue
        rows = report["data"].get(key, [])
        lines.extend(" | ".join(f"{name}: {value}" for name, value in row.items() if name not in {"task_id", "risk_color"}) for row in rows)
        if not rows:
            lines.append("Asnje detyre.")
    return "\n\n".join(lines)


async def send_report(db: AsyncSession, row: M3ReportingPointsReport, recipients: dict) -> None:
    if row.status == "SENT":
        return
    recipients = normalize_recipients(recipients)
    if not recipients["to"]:
        raise ValueError("Shto te pakten nje marres To perpara dergimit.")
    report = report_payload(row)
    try:
        gmail = GmailService()
        message = await gmail.find_exact(report["subject"], recipients)
        if not message:
            message = await gmail.send_verified(report["subject"], recipients,
                                                 render_plain_text(report), render_html(report))
    except Exception as exc:
        row.status, row.last_error = "FAILED", str(exc)[:2000]
        await db.commit()
        raise
    row.status, row.sent_at = "SENT", datetime.now(report_timezone())
    row.gmail_message_id, row.last_error = message.get("id"), None
    await db.commit()
