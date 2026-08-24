from __future__ import annotations

import html
import io
import os
import re
from datetime import date, timedelta, time
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department
from app.models.ga_time_slot_template import GaTimeSlotTemplate
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.user import User
from app.services.ga_time_table import get_ga_time_table_rows
from app.services.meetings_report import (
    _assignee_names,
    _effective_task_assignee_ids,
    _m3_finance_ga_sections,
    _meeting_occurs_on_date,
    _render_section_body_html,
    apply_weekly_planner_task_order,
    render_section_report_png,
)
from app.services.primeflow_report import report_timezone


GA_EMAIL = "ga@primexeu.com"
GA_USERNAME = "gane.arifaj"


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _plain_text(value: str | None) -> str:
    if not value:
        return ""
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def _color(value: Any, fallback: str) -> str:
    candidate = str(value or fallback).strip()
    return candidate if re.fullmatch(r"#[0-9a-fA-F]{6}", candidate) else fallback


async def _ga_user(db: AsyncSession) -> User | None:
    user = (
        await db.execute(select(User).where(func.lower(User.username) == GA_USERNAME))
    ).scalar_one_or_none()
    if user is not None:
        return user
    return (
        await db.execute(select(User).where(func.lower(User.email) == GA_EMAIL))
    ).scalar_one_or_none()


def _row_start(rows: list[Any], value: time) -> time:
    exact = next((row for row in rows if row.start_time == value), None)
    if exact is not None:
        return exact.start_time
    containing = next(
        (row for row in rows if not row.is_special and row.start_time <= value < row.end_time),
        None,
    )
    return containing.start_time if containing is not None else value


def _meeting_time(meeting: Meeting) -> time | None:
    value = meeting.starts_at
    if value is None:
        return None
    local = value.astimezone(report_timezone()) if value.tzinfo else value
    return local.time().replace(second=0, microsecond=0)


async def render_ga_time_table_png(db: AsyncSession, report_day: date) -> bytes:
    """Render the Admin Tasks GA timetable for the report day's work week."""
    week_start = _week_start(report_day)
    week_dates = [week_start + timedelta(days=index) for index in range(5)]
    rows = list(await get_ga_time_table_rows(db))
    ga_user = await _ga_user(db)
    entries = []
    if ga_user is not None:
        entries = (
            await db.execute(
                select(GaTimeSlotTemplate)
                .where(GaTimeSlotTemplate.user_id == ga_user.id)
                .order_by(GaTimeSlotTemplate.day_of_week, GaTimeSlotTemplate.start_time, GaTimeSlotTemplate.created_at)
            )
        ).scalars().all()

    cell_items: dict[tuple[int, time], list[dict[str, Any]]] = {}
    for entry in entries:
        cell_items.setdefault((entry.day_of_week, _row_start(rows, entry.start_time)), []).append({
            "text": _plain_text(entry.content),
            "fill": _color(entry.background_color, "#FFFFFF"),
            "color": _color(entry.text_color, "#0F172A"),
            "bold": bool(entry.is_bold),
        })

    meetings = (await db.execute(select(Meeting))).scalars().all()
    for meeting in meetings:
        meeting_time = _meeting_time(meeting)
        if meeting_time is None:
            continue
        for day_index, day in enumerate(week_dates):
            if not _meeting_occurs_on_date(meeting, day):
                continue
            label = "TAK EXT" if (meeting.meeting_type or "").lower() == "external" else "TAK INT"
            cell_items.setdefault((day_index, _row_start(rows, meeting_time)), []).append({
                "text": f"{label}: {meeting.title or '-'}",
                "fill": "#E0F2FE" if label == "TAK EXT" else "#DBEAFE",
                "color": "#0F3B8F",
                "bold": label == "TAK INT",
            })

    margin = 30
    column_widths = [54, 140, 230, 260, 260, 260, 260, 260, 230]
    table_width = sum(column_widths)
    try:
        regular = ImageFont.truetype(os.getenv("PRIMEFLOW_REPORT_FONT_PATH", r"C:\Windows\Fonts\segoeui.ttf"), 16)
        bold = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 16)
        heading = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 27)
    except OSError:
        regular = bold = heading = ImageFont.load_default()
    measure = ImageDraw.Draw(Image.new("RGB", (1, 1), "white"))

    def wrap(value: str, font: Any, max_width: int) -> list[str]:
        result: list[str] = []
        for source in (value or "").splitlines() or [""]:
            words, current = source.split() or [""], ""
            for word in words:
                candidate = word if not current else f"{current} {word}"
                if current and measure.textlength(candidate, font=font) > max_width:
                    result.append(current)
                    current = word
                else:
                    current = candidate
            result.append(current)
        return result or [""]

    def comments_for(row: Any, column: str) -> list[dict[str, Any]]:
        comments = [
            item for item in (getattr(row, "comments", None) or [])
            if isinstance(item, dict) and str(item.get("column") or "start") == column
        ]
        if column == "start" and not comments and _plain_text(getattr(row, "comment", "")):
            comments = [{
                "content": row.comment,
                "comment_background_color": getattr(row, "comment_background_color", "#FFFFFF"),
                "comment_text_color": getattr(row, "comment_text_color", "#0F172A"),
                "comment_is_bold": getattr(row, "comment_is_bold", False),
            }]
        return comments

    layout: list[tuple[Any, int]] = []
    for row in rows:
        line_counts = [1]
        for column, index in (("start", 2), ("end", 8)):
            line_counts.append(sum(
                len(wrap(
                    _plain_text(str(comment.get("content") or "")),
                    bold if comment.get("comment_is_bold") else regular,
                    column_widths[index] - 14,
                ))
                for comment in comments_for(row, column)
            ) or 1)
        for day_index in range(5):
            count = sum(
                len(wrap(item["text"], bold if item["bold"] else regular, column_widths[3 + day_index] - 14))
                for item in cell_items.get((day_index, row.start_time), [])
            )
            line_counts.append(count or 1)
        layout.append((row, max(34, 12 + max(line_counts) * 21)))

    header_height = 48
    height = 112 + header_height + sum(row_height for _, row_height in layout) + margin
    image = Image.new("RGB", (table_width + margin * 2, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((margin, 25), f"GA TIME TABLE ({week_dates[0]:%d.%m.%Y} - {week_dates[-1]:%d.%m.%Y})", fill="#0F172A", font=heading)
    draw.text((margin, 67), f"Generated for 1H · {report_day:%d.%m.%Y}", fill="#475569", font=regular)

    headers = ["NR", "TIME", "KOMENT", *[f"{day.strftime('%a').upper()} = {day:%d.%m.%Y}" for day in week_dates], "KOMENT"]
    x, y = margin, 112
    for index, label in enumerate(headers):
        right = x + column_widths[index]
        draw.rectangle((x, y, right, y + header_height), fill="#E2E8F0", outline="#94A3B8")
        draw.text((x + 6, y + 14), label, fill="#0F172A", font=bold)
        x = right
    y += header_height

    def draw_rich_cell(x: int, y: int, width: int, height: int, items: list[dict[str, Any]], *, comment: bool = False) -> None:
        draw.rectangle((x, y, x + width, y + height), fill="#FFFFFF", outline="#CBD5E1")
        text_y = y + 5
        for item in items:
            item_font = bold if item.get("bold") or item.get("comment_is_bold") else regular
            text = item.get("text") if not comment else _plain_text(str(item.get("content") or ""))
            fill = _color(item.get("fill") if not comment else item.get("comment_background_color"), "#FFFFFF")
            color = _color(item.get("color") if not comment else item.get("comment_text_color"), "#0F172A")
            lines = wrap(str(text or ""), item_font, width - 14)
            block_height = max(23, len(lines) * 21 + 4)
            draw.rounded_rectangle((x + 3, text_y - 1, x + width - 3, min(y + height - 3, text_y + block_height)), radius=3, fill=fill)
            for line in lines:
                draw.text((x + 7, text_y + 2), line, fill=color, font=item_font)
                text_y += 21
            text_y += 5

    for row, row_height in layout:
        x = margin
        for index, value in enumerate((row.nr_label or "", row.label or "")):
            right = x + column_widths[index]
            draw.rectangle((x, y, right, y + row_height), fill="#F8FAFC", outline="#CBD5E1")
            font = bold if index == 0 else regular
            for line_index, line in enumerate(wrap(value, font, column_widths[index] - 12)):
                draw.text((x + 6, y + 6 + line_index * 21), line, fill="#0F172A", font=font)
            x = right
        draw_rich_cell(x, y, column_widths[2], row_height, comments_for(row, "start"), comment=True)
        x += column_widths[2]
        for day_index in range(5):
            draw_rich_cell(x, y, column_widths[3 + day_index], row_height, cell_items.get((day_index, row.start_time), []))
            x += column_widths[3 + day_index]
        draw_rich_cell(x, y, column_widths[8], row_height, comments_for(row, "end"), comment=True)
        y += row_height

    output = io.BytesIO()
    image.crop((0, 0, table_width + margin * 2, y + margin)).save(output, format="PNG", optimize=True)
    return output.getvalue()


async def _ga_hv_bodies(db: AsyncSession, report_day: date) -> tuple[str, str]:
    tasks = (
        await db.execute(
            select(Task)
            .where(Task.is_active.is_(True))
            .where(or_(Task.start_date.is_not(None), Task.due_date.is_not(None), Task.created_at.is_not(None)))
        )
    ).scalars().all()
    names = await _assignee_names(db, tasks)
    assignee_ids = await _effective_task_assignee_ids(db, tasks)
    department_codes = {
        department_id: code
        for department_id, code in (await db.execute(select(Department.id, Department.code))).all()
    }
    await apply_weekly_planner_task_order(db, tasks, assignee_ids, department_codes)
    return await _m3_finance_ga_sections(db, tasks, names, report_day)


async def render_ga_hv_tasks_png(db: AsyncSession, report_day: date) -> bytes:
    ga_body, hv_body = await _ga_hv_bodies(db, report_day)
    return render_section_report_png(
        "GA / HV TASKS",
        "GA-HV",
        report_day,
        [{"title": "GA TASKS", "body": ga_body}, {"title": "HV TASKS", "body": hv_body}],
    )


def _email_section_title(title: str) -> str:
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="width:100%;border-collapse:collapse;margin:18px 0 10px;">'
        '<tr><td width="6" bgcolor="#2563eb" style="width:6px;background-color:#2563eb;'
        'font-size:0;line-height:0;">&nbsp;</td>'
        '<td bgcolor="#eef2ff" style="background-color:#eef2ff;padding:11px 14px;'
        'font-family:Arial,sans-serif;font-size:16px;font-weight:800;color:#0f172a;">'
        f'{html.escape(title)}</td></tr></table>'
    )


async def render_ga_time_table_html(db: AsyncSession, report_day: date) -> str:
    """Native email-table version of the GA timetable."""
    week_start = _week_start(report_day)
    week_dates = [week_start + timedelta(days=index) for index in range(5)]
    rows = list(await get_ga_time_table_rows(db))
    ga_user = await _ga_user(db)
    entries = []
    if ga_user is not None:
        entries = (
            await db.execute(
                select(GaTimeSlotTemplate)
                .where(GaTimeSlotTemplate.user_id == ga_user.id)
                .order_by(GaTimeSlotTemplate.day_of_week, GaTimeSlotTemplate.start_time, GaTimeSlotTemplate.created_at)
            )
        ).scalars().all()

    cell_items: dict[tuple[int, time], list[dict[str, Any]]] = {}
    for entry in entries:
        cell_items.setdefault((entry.day_of_week, _row_start(rows, entry.start_time)), []).append({
            "text": _plain_text(entry.content),
            "fill": _color(entry.background_color, "#FFFFFF"),
            "color": _color(entry.text_color, "#0F172A"),
            "bold": bool(entry.is_bold),
            "italic": bool(entry.is_italic),
        })
    meetings = (await db.execute(select(Meeting))).scalars().all()
    for meeting in meetings:
        meeting_time = _meeting_time(meeting)
        if meeting_time is None:
            continue
        for day_index, day in enumerate(week_dates):
            if not _meeting_occurs_on_date(meeting, day):
                continue
            label = "TAK EXT" if (meeting.meeting_type or "").lower() == "external" else "TAK INT"
            cell_items.setdefault((day_index, _row_start(rows, meeting_time)), []).append({
                "text": f"{label}: {meeting.title or '-'}",
                "fill": "#E0F2FE" if label == "TAK EXT" else "#DBEAFE",
                "color": "#0F3B8F",
                "bold": label == "TAK INT",
                "italic": False,
            })

    def comments_for(row: Any, column: str) -> list[dict[str, Any]]:
        values = [
            item for item in (getattr(row, "comments", None) or [])
            if isinstance(item, dict) and str(item.get("column") or "start") == column
        ]
        if column == "start" and not values and _plain_text(getattr(row, "comment", "")):
            values = [{
                "content": row.comment,
                "comment_background_color": getattr(row, "comment_background_color", "#FFFFFF"),
                "comment_text_color": getattr(row, "comment_text_color", "#0F172A"),
                "comment_is_bold": getattr(row, "comment_is_bold", False),
                "comment_is_italic": getattr(row, "comment_is_italic", False),
            }]
        return values

    def rich_blocks(items: list[dict[str, Any]], *, comment: bool = False) -> str:
        blocks = []
        for item in items:
            text = _plain_text(str(item.get("content") or "")) if comment else str(item.get("text") or "")
            fill = _color(item.get("comment_background_color") if comment else item.get("fill"), "#FFFFFF")
            color = _color(item.get("comment_text_color") if comment else item.get("color"), "#0F172A")
            bold = bool(item.get("comment_is_bold") if comment else item.get("bold"))
            italic = bool(item.get("comment_is_italic") if comment else item.get("italic"))
            blocks.append(
                f'<div bgcolor="{fill}" style="background-color:{fill};color:{color};padding:5px 6px;'
                f'margin:0 0 4px;font-weight:{"700" if bold else "400"};'
                f'font-style:{"italic" if italic else "normal"};">'
                f'{html.escape(text).replace(chr(10), "<br>")}</div>'
            )
        return "".join(blocks) or "&nbsp;"

    headers = ["NR", "TIME", "KOMENT", *[f"{day.strftime('%a').upper()} = {day:%d.%m.%Y}" for day in week_dates], "KOMENT"]
    header_html = "".join(
        f'<th bgcolor="#e2e8f0" style="background-color:#e2e8f0;border:1px solid #94a3b8;'
        f'padding:7px 5px;font-family:Arial,sans-serif;font-size:11px;text-align:left;">{html.escape(label)}</th>'
        for label in headers
    )
    body_rows = []
    for row in rows:
        cells = [
            f'<td bgcolor="#f8fafc" style="border:1px solid #cbd5e1;padding:6px;font-weight:700;vertical-align:top;">{html.escape(row.nr_label or "")}</td>',
            f'<td bgcolor="#f8fafc" style="border:1px solid #cbd5e1;padding:6px;vertical-align:top;white-space:nowrap;">{html.escape(row.label or "")}</td>',
            f'<td style="border:1px solid #cbd5e1;padding:3px;vertical-align:top;">{rich_blocks(comments_for(row, "start"), comment=True)}</td>',
        ]
        cells.extend(
            f'<td style="border:1px solid #cbd5e1;padding:3px;vertical-align:top;">{rich_blocks(cell_items.get((day_index, row.start_time), []))}</td>'
            for day_index in range(5)
        )
        cells.append(
            f'<td style="border:1px solid #cbd5e1;padding:3px;vertical-align:top;">{rich_blocks(comments_for(row, "end"), comment=True)}</td>'
        )
        body_rows.append(f'<tr>{"".join(cells)}</tr>')
    title = f"GA TIME TABLE ({week_dates[0]:%d.%m.%Y} - {week_dates[-1]:%d.%m.%Y})"
    return (
        _email_section_title(title)
        + '<table role="table" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'data-ga-time-table="true" style="width:100%;border-collapse:collapse;table-layout:fixed;'
        'font-family:Arial,sans-serif;font-size:11px;line-height:1.3;">'
        f'<thead><tr>{header_html}</tr></thead><tbody>{"".join(body_rows)}</tbody></table>'
    )


async def render_ga_hv_tasks_html(db: AsyncSession, report_day: date) -> str:
    ga_body, hv_body = await _ga_hv_bodies(db, report_day)
    return (
        '<div data-ga-hv-tasks="true">'
        + _email_section_title("GA TASKS")
        + _render_section_body_html(ga_body)
        + _email_section_title("HV TASKS")
        + _render_section_body_html(hv_body)
        + '</div>'
    )


async def render_ga_tables_html(db: AsyncSession, report_day: date) -> str:
    return (
        '<div data-ga-inline-tables="true">'
        + await render_ga_time_table_html(db, report_day)
        + await render_ga_hv_tasks_html(db, report_day)
        + '</div>'
    )


async def build_ga_only_1h_attachments(db: AsyncSession, report_day: date) -> list[tuple[str, bytes, str]]:
    week_start = _week_start(report_day)
    return [
        (f"GA-Time-Table-{week_start:%Y-%m-%d}.png", await render_ga_time_table_png(db, report_day), "image/png"),
        (f"GA-HV-Tasks-{report_day:%Y-%m-%d}.png", await render_ga_hv_tasks_png(db, report_day), "image/png"),
    ]
