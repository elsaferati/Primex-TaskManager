from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from email.message import EmailMessage
from typing import Any, Awaitable, Callable
from zoneinfo import ZoneInfo

import httpx
logger = logging.getLogger(__name__)
REPORT_TYPE = "primeflow_1h"
SLOTS = ("10:00", "11:00", "11:50", "14:20", "16:00")
SCHEDULES = {"10:00": "09:00", "11:00": "10:50", "11:50": "11:40", "14:20": "14:10", "16:00": "15:50"}
STATUS_ORDER = {"IN_PROGRESS": 0, "TODO": 1, "DONE": 2}
STATUS_MARKERS = {"IN_PROGRESS": "🟡 IN PROGRESS", "TODO": "⚪ TODO", "DONE": "✅ DONE"}
TECHNICAL_TAGS = re.compile(r"\[\[/?(?:added|done)\]\]")
TRANSIENT_CODES = {429, 500, 502, 503, 504}


class GmailVerificationError(RuntimeError):
    def __init__(self, message: str, response: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.response = response or {}


def report_timezone() -> ZoneInfo:
    return ZoneInfo(os.getenv("PRIMEFLOW_REPORT_TIMEZONE", "Europe/Tirane"))


def previous_working_day(day: date, holidays: set[date] | None = None) -> date:
    holidays = holidays or set()
    candidate = day - timedelta(days=1)
    while candidate.weekday() >= 5 or candidate in holidays:
        candidate -= timedelta(days=1)
    return candidate


def report_subject(day: date, slot: str) -> str:
    if slot not in SLOTS:
        raise ValueError(f"Unsupported report slot: {slot}")
    return f"PrimeFlow 1H – {day:%d.%m.%Y} – {slot}"


def exact_subject(headers: list[dict[str, str]], expected: str) -> bool:
    return any(h.get("name", "").lower() == "subject" and h.get("value") == expected for h in headers)


def clean_description(value: str | None) -> str:
    return TECHNICAL_TAGS.sub("", value or "")


def _task_date(item: dict[str, Any]) -> date | None:
    raw = item.get("report_date") or item.get("date") or item.get("day")
    if not raw:
        raw = item.get("planned_for") or item.get("due_date") or item.get("start_date")
    try:
        return date.fromisoformat(str(raw)[:10]) if raw else None
    except ValueError:
        return None


def _slot(item: dict[str, Any]) -> str | None:
    return item.get("one_h_report_slot") or item.get("slot") or item.get("time_slot")


def _employee(item: dict[str, Any]) -> str:
    return str(
        item.get("employee") or item.get("person") or item.get("owner")
        or item.get("user_name") or item.get("assignee_name") or item.get("user") or ""
    ).strip()


def filter_tasks(items: list[dict[str, Any]], day: date, slot: str | None = None) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result = []
    for item in items:
        employee = _employee(item)
        title = item.get("task_title") or item.get("title") or item.get("task")
        if not employee or not str(title or "").strip() or _task_date(item) != day:
            continue
        if slot is not None and _slot(item) != slot:
            continue
        key = str(item.get("id") or item.get("task_id") or json.dumps(item, sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        status = str(item.get("status") or "").upper()
        if status not in STATUS_ORDER:
            logger.error("Unexpected task status task_id=%s status=%s", key, status)
            continue
        result.append(item)
    return result


def _render_section(title: str, tasks: list[dict[str, Any]]) -> str:
    lines = [title]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for task in tasks:
        grouped.setdefault(_employee(task), []).append(task)
    for employee_index, employee in enumerate(sorted(grouped, key=str.casefold), 1):
        lines.append(f"{employee_index}. {employee}")
        ordered = sorted(grouped[employee], key=lambda x: (STATUS_ORDER[str(x.get("status")).upper()], str(x.get("task_title") or x.get("title") or x.get("task"))))
        for task_index, task in enumerate(ordered, 1):
            status = str(task.get("status")).upper()
            title_value = str(task.get("task_title") or task.get("title") or task.get("task"))
            description = clean_description(task.get("description") if "description" in task else task.get("note"))
            lines.extend([f"{employee_index}.{task_index} {STATUS_MARKERS[status]} {title_value}", "Përshkrimi:", description])
    if not grouped:
        lines.append("(Asnjë detyrë)")
    return "\n".join(lines)


def build_report(data: dict[str, Any], report_day: date, slot: str) -> str:
    guardrails = data.get("guardrails") or {}
    if any((guardrails.get("truncated") or {}).values()):
        raise ValueError("Common View contains truncated buckets")
    items = data.get("items") or {}
    one_h = items.get("oneH") or data.get("tasks") or []
    sections: list[tuple[str, list[dict[str, Any]]]] = []
    if slot == "10:00":
        prev = previous_working_day(report_day)
        sections.append((f"SLOTI {prev:%d.%m.%Y} 16:00", filter_tasks(one_h, prev, "16:00")))
    current_index = SLOTS.index(slot)
    start_index = current_index if current_index == 0 else current_index - 1
    for candidate in SLOTS[start_index:]:
        sections.append((f"SLOTI {report_day:%d.%m.%Y} {candidate}", filter_tasks(one_h, report_day, candidate)))
    sections.extend([
        ("DETYRA PA SLOT – E GJITHË DITA", filter_tasks(one_h, report_day, None)),
        ("DETYRAT E BLLOKUT", filter_tasks(items.get("blocked") or [], report_day)),
        ("P: PERSONALE", filter_tasks(items.get("personal") or [], report_day)),
        ("R1 = 1H", filter_tasks(items.get("r1") or [], report_day)),
    ])
    # The no-slot section must not repeat slotted rows.
    sections = [(name, [t for t in tasks if _slot(t) is None] if name.startswith("DETYRA PA SLOT") else tasks) for name, tasks in sections]
    return "\n\n".join(_render_section(name, tasks) for name, tasks in sections)


async def retry(operation: Callable[[], Awaitable[Any]], *, delays: tuple[float, ...] = (0, 2, 5)) -> Any:
    last: Exception | None = None
    for attempt, delay in enumerate(delays, 1):
        if delay:
            await asyncio.sleep(delay)
        try:
            return await operation()
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
            last = exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in TRANSIENT_CODES:
                raise
            last = exc
        logger.warning("transient_operation_failure attempt=%s error=%s", attempt, type(last).__name__)
    assert last is not None
    raise last


@dataclass
class PrimeFlowClient:
    base_url: str
    email: str | None
    password: str | None
    access_token: str | None = None

    async def _token(self, client: httpx.AsyncClient) -> str:
        if self.access_token:
            return self.access_token
        response = await client.post("/api/auth/login", json={"email": self.email, "password": self.password})
        response.raise_for_status()
        self.access_token = response.json().get("access_token") or response.json().get("accessToken")
        if not self.access_token:
            raise ValueError("PrimeFlow login response contained no access token")
        return self.access_token

    async def common_view(self, day: date) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as client:
            async def retrieve(week_day: date) -> dict[str, Any]:
                token = await self._token(client)
                response = await client.get(
                    "/api/common-view",
                    params={"week_start": week_day.isoformat(), "freeze_one_h_slots": "true", "max_items_per_bucket": 5000},
                    headers={"Authorization": f"Bearer {token}", "Cache-Control": "no-cache"},
                )
                if response.status_code == 401:
                    self.access_token = None
                    token = await self._token(client)
                    response = await client.get("/api/common-view", params={"week_start": week_day.isoformat(), "freeze_one_h_slots": "true", "max_items_per_bucket": 5000}, headers={"Authorization": f"Bearer {token}", "Cache-Control": "no-cache"})
                response.raise_for_status()
                payload = response.json()
                if any((payload.get("guardrails", {}).get("truncated") or {}).values()):
                    raise ValueError("Common View contains truncated buckets")
                return payload
            current = await retry(lambda: retrieve(day))
            if day.weekday() != 0:
                return current
            previous = await retry(lambda: retrieve(previous_working_day(day)))
            for bucket, values in (previous.get("items") or {}).items():
                current.setdefault("items", {}).setdefault(bucket, []).extend(values)
            current["generated_at"] = max(current["generated_at"], previous["generated_at"])
            return current


class GmailService:
    def __init__(self) -> None:
        self.client_id = os.environ["PRIMEFLOW_REPORT_GMAIL_CLIENT_ID"]
        self.client_secret = os.environ["PRIMEFLOW_REPORT_GMAIL_CLIENT_SECRET"]
        self.refresh_token = os.environ["PRIMEFLOW_REPORT_GMAIL_REFRESH_TOKEN"]
        self.sender = os.environ["PRIMEFLOW_REPORT_GMAIL_SENDER"]

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        response = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": self.client_id, "client_secret": self.client_secret,
            "refresh_token": self.refresh_token, "grant_type": "refresh_token",
        })
        response.raise_for_status()
        return response.json()["access_token"]

    async def find_exact(self, subject: str, recipients: list[str] | None = None) -> dict[str, Any] | None:
        async with httpx.AsyncClient(timeout=30) as client:
            token = await self._access_token(client)
            headers = {"Authorization": f"Bearer {token}"}
            found = await client.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", params={"q": f'in:sent subject:"{subject}"'}, headers=headers)
            found.raise_for_status()
            for item in found.json().get("messages", []):
                detail = await client.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{item['id']}", params={"format": "metadata", "metadataHeaders": ["Subject", "To"]}, headers=headers)
                detail.raise_for_status()
                message = detail.json()
                metadata = message.get("payload", {}).get("headers", [])
                to_value = next((h.get("value", "") for h in metadata if h.get("name", "").lower() == "to"), "")
                recipient_match = not recipients or all(address.casefold() in to_value.casefold() for address in recipients)
                if exact_subject(metadata, subject) and recipient_match:
                    return message
        return None

    async def send_verified(self, subject: str, recipients: list[str], body: str) -> dict[str, Any]:
        send_accepted = False
        send_response: dict[str, Any] | None = None
        for attempt in range(1, 4):
            existing = await self.find_exact(subject, recipients)
            if existing:
                return existing
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    token = await self._access_token(client)
                    message = EmailMessage()
                    message["From"], message["To"], message["Subject"] = self.sender, ", ".join(recipients), subject
                    message.set_content(body)
                    raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
                    response = await client.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", json={"raw": raw}, headers={"Authorization": f"Bearer {token}"})
                    response.raise_for_status()
                    send_accepted = True
                    send_response = response.json()
                verified = await self.find_exact(subject, recipients)
                if verified:
                    return verified
            except (httpx.RequestError, httpx.HTTPStatusError):
                logger.warning("gmail_send_failure attempt=%s subject=%s", attempt, subject)
        final = await self.find_exact(subject, recipients)
        if final:
            return final
        if send_accepted:
            raise GmailVerificationError("Gmail accepted the message but exact Sent Mail verification failed", send_response)
        raise RuntimeError("Gmail send or exact Sent Mail verification failed")


def predecessor(day: date, slot: str) -> tuple[date, str]:
    index = SLOTS.index(slot)
    return (previous_working_day(day), "16:00") if index == 0 else (day, SLOTS[index - 1])
