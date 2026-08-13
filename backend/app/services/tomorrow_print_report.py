from __future__ import annotations

import html
import os
import re
from datetime import date
from typing import Any

from app.services.meetings_report import common_view_item_sort_key, next_working_day
from app.services.primeflow_report import GmailService, PrimeFlowClient


TASK_ROWS = (
    ("oneH", "1H 10:00", "10:00"),
    ("oneH", "1H 11:00", "11:00"),
    ("oneH", "1H 11:50", "11:50"),
    ("oneH", "1H 14:20", "14:20"),
    ("blocked", "BLL\n14:30 - 15:30", None),
    ("oneH", "1H 16:00", "16:00"),
    ("oneH", "1H NO SLOT", ""),
    ("r1", "R1=1H", None),
    ("personal", "P:\nGA 08:15 / 13:15\nDV/LH 10:15 / 14:30", None),
)
MEETING_ROWS = (("external", "TAK EXT"), ("internal", "TAK INT"))
VALID_1H_SLOTS = {"10:00", "11:00", "11:50", "14:20", "16:00"}

# Gmail can remove style blocks from message bodies. Keep the styles that form
# the report grid inline so the received email matches the preview.
TABLE_STYLE = "width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.25;color:#000"
CELL_STYLE = "border:1px solid #000;padding:5px;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:break-word"
HEADER_STYLE = f"{CELL_STYLE};text-align:center;font-weight:700"
PERSONAL_GA_CELL_STYLE = f"{CELL_STYLE};background-color:#f3e8ff"
PERSONAL_TASK_INITIALS = re.compile(r"^[A-Z]{2,3}(?:\s*[:/]\s*[A-Z]{2,3})*(?=\s|:|/|$)", re.I)


def subject_for(target_date: date) -> str:
    return f"1H SHTYPI - {target_date:%d.%m.%Y}"


def _item_date(item: dict[str, Any]) -> date | None:
    raw = item.get("date") or item.get("entryDate") or item.get("entry_date")
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _slot(item: dict[str, Any]) -> str:
    raw = str(item.get("oneHReportSlot") or item.get("one_h_report_slot") or "").strip()
    return raw if raw in VALID_1H_SLOTS else ""


def _first_line(value: Any) -> str:
    return next((line.strip() for line in str(value or "").splitlines() if line.strip()), "")


def _initials(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return ""
    if re.fullmatch(r"[A-Za-z]{1,4}", cleaned):
        return cleaned.upper()
    return "".join(part[0] for part in re.split(r"\s+", cleaned) if part).upper()


def _assignees(item: dict[str, Any]) -> list[str]:
    raw = item.get("assignees")
    if not isinstance(raw, list) or not raw:
        raw = str(item.get("person") or item.get("owner") or "").split(",")
    result: list[str] = []
    for value in raw:
        label = _initials(str(value or ""))
        if label and label not in result:
            result.append(label)
    return result


def _task_title(item: dict[str, Any], *, personal: bool) -> str:
    title = _first_line(item.get("title"))
    if personal:
        return title
    title = re.sub(r"^[A-Z]{1,4}(?:/[A-Z]{1,4})*:\s*", "", title)
    owners = _assignees(item)
    return f"{'/'.join(owners)}: {title}" if owners else title


def _is_personal_task_for_ga(item: dict[str, Any]) -> bool:
    """Match the GA-assignee rule used by the P row in Common View printouts."""
    title = re.sub(r"\[\[\s*/?\s*(?:added|done)\s*\]\]", "", _first_line(item.get("title")))
    match = PERSONAL_TASK_INITIALS.match(title.strip())
    if match is None:
        return False
    return "GA" in {value.strip().upper() for value in re.split(r"[:/]", match.group(0))}


def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for item in items:
        key = (
            _first_line(item.get("title")).casefold(),
            str(item.get("date") or ""),
            _slot(item),
            str(item.get("finishPeriod") or item.get("finish_period") or "").upper(),
        )
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _task_rows(items: dict[str, Any], target_date: date) -> list[tuple[str, list[dict[str, Any]], bool]]:
    by_bucket = {
        name: [item for item in values if isinstance(item, dict) and _item_date(item) == target_date]
        for name, values in items.items()
        if isinstance(values, list)
    }
    rows: list[tuple[str, list[dict[str, Any]], bool]] = []
    for bucket, label, requested_slot in TASK_ROWS:
        values = list(by_bucket.get(bucket, []))
        if bucket == "oneH":
            values = [item for item in values if _slot(item) == requested_slot]
        values = _dedupe(values)
        values.sort(key=common_view_item_sort_key)
        rows.append((label, values, bucket == "personal"))
    return rows


def _meeting_rows(items: dict[str, Any], target_date: date) -> list[tuple[str, list[dict[str, Any]]]]:
    rows: list[tuple[str, list[dict[str, Any]]]] = []
    for bucket, label in MEETING_ROWS:
        values = [item for item in items.get(bucket, []) if isinstance(item, dict) and _item_date(item) == target_date]
        values.sort(key=lambda item: (str(item.get("time") or ""), _first_line(item.get("title")).casefold()))
        rows.append((label, values))
    return rows


def _html_table(rows: list[tuple[str, list[dict[str, Any]], bool]], *, meeting: bool = False) -> str:
    header = "Meeting" if meeting else "Tasks"
    label_header = "LLoji" if meeting else "LLoji dhe sloti"
    body: list[str] = []
    for number, (label, values, *rest) in enumerate(rows, 1):
        personal = bool(rest and rest[0])
        chunks = [values[index:index + 6] for index in range(0, len(values), 6)] or [[]]
        for chunk_index, chunk in enumerate(chunks):
            cells: list[str] = []
            for item_index, item in enumerate(chunk):
                value = (
                    f"{_first_line(item.get('title'))} {str(item.get('time') or '').strip()}".strip()
                    if meeting
                    else _task_title(item, personal=personal)
                )
                cell_style = PERSONAL_GA_CELL_STYLE if personal and _is_personal_task_for_ga(item) else CELL_STYLE
                background = ' bgcolor="#f3e8ff"' if cell_style == PERSONAL_GA_CELL_STYLE else ""
                cells.append(
                    f'<td{background} style="{cell_style}">{item_index + (chunk_index * 6) + 1}. {html.escape(value)}</td>'
                )
            cells.extend(f'<td style="{CELL_STYLE}"></td>' for _ in range(6 - len(cells)))
            row_header = (
                f'<th rowspan="{len(chunks)}" style="{CELL_STYLE}">{number}</th>'
                f'<th rowspan="{len(chunks)}" style="{CELL_STYLE}">{html.escape(label).replace(chr(10), "<br>")}</th>'
                if chunk_index == 0 else ""
            )
            body.append(f"<tr>{row_header}{''.join(cells)}</tr>")
    return (
        f'<table role="presentation" width="100%" border="1" cellpadding="0" cellspacing="0" style="{TABLE_STYLE}">'
        '<colgroup><col width="4%"><col width="9%"><col width="14.5%" span="6"></colgroup>'
        f'<thead><tr><th style="{HEADER_STYLE}">NR</th><th style="{HEADER_STYLE}">{label_header}</th>'
        f'<th colspan="6" style="{HEADER_STYLE}">{header}</th></tr></thead>'
        f"<tbody>{''.join(body)}</tbody></table>"
    )


async def build_tomorrow_print_report(delivery_date: date) -> dict[str, str]:
    target_date = next_working_day(delivery_date)
    base_url = os.getenv("PRIMEFLOW_API_BASE_URL")
    if not base_url:
        raise RuntimeError("PRIMEFLOW_API_BASE_URL is required to generate 1H SHTYPI")
    client = PrimeFlowClient(
        base_url.rstrip("/"), os.getenv("PRIMEFLOW_EMAIL"), os.getenv("PRIMEFLOW_PASSWORD"), os.getenv("PRIMEFLOW_ACCESS_TOKEN"),
    )
    payload = await client.common_view(target_date)
    items = payload.get("items") or {}
    task_rows = _task_rows(items, target_date)
    meeting_rows = [(label, values, False) for label, values in _meeting_rows(items, target_date)]
    report_date = target_date.strftime("%d.%m.%Y")
    html_body = f"""<!doctype html><html><body style=\"margin:0;color:#000;font-family:Arial,sans-serif\">
<div style=\"text-align:center;font-size:20px;font-weight:700;margin:0 0 12px\">1H SHTYPI — {report_date}</div>
{_html_table(task_rows)}{_html_table(meeting_rows, meeting=True)}</body></html>"""
    plain_rows = [f"1H SHTYPI - {report_date}", "", "TASKS"]
    for label, values, personal in task_rows:
        plain_rows.append(f"{label}: " + "; ".join(_task_title(item, personal=personal) for item in values))
    plain_rows.append("")
    plain_rows.append("MEETINGS")
    for label, values, _ in meeting_rows:
        plain_rows.append(f"{label}: " + "; ".join(f"{_first_line(item.get('title'))} {item.get('time') or ''}".strip() for item in values))
    return {
        "subject": subject_for(target_date),
        "target_date": target_date.isoformat(),
        "html": html_body,
        "plain_text": "\n".join(plain_rows),
    }


async def send_tomorrow_print_report(report: dict[str, str], recipients: dict[str, list[str]]) -> dict[str, Any]:
    return await GmailService().send_verified(report["subject"], recipients, report["plain_text"], report["html"])
