from __future__ import annotations

import os
import asyncio
import logging
from datetime import date, datetime
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.std_feedback_ticket import StdFeedbackTicket
from app.services.primeflow_report import report_timezone

STD_API_BASE_URL = "https://std.primexeu.com/api/integrations/primeflow/v1"
logger = logging.getLogger(__name__)


def _std_base_url() -> str:
    return (os.getenv("STD_PRIMEFLOW_API_BASE_URL") or settings.STD_PRIMEFLOW_API_BASE_URL or STD_API_BASE_URL).rstrip("/")


def _std_token() -> str:
    return os.getenv("STD_PRIMEFLOW_API_TOKEN") or settings.STD_PRIMEFLOW_API_TOKEN or os.getenv("PRIMEFLOW_API_TOKEN") or ""


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _stringify(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def _int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_affected_fields(payload: dict[str, Any]) -> list[str]:
    candidate_keys = (
        "affected_fields",
        "affectedFields",
        "affected_field",
        "affectedField",
        "fields",
        "changed_fields",
        "changedFields",
    )
    containers: list[Any] = [payload]
    order_snapshot = payload.get("order_snapshot_json")
    if isinstance(order_snapshot, dict):
        containers.append(order_snapshot)

    values: list[str] = []
    for container in containers:
        if not isinstance(container, dict):
            continue
        for key in candidate_keys:
            raw_value = container.get(key)
            if raw_value is None:
                continue
            if isinstance(raw_value, list):
                values.extend(str(item).strip() for item in raw_value if str(item).strip())
            elif isinstance(raw_value, dict):
                values.extend(str(key).strip() for key in raw_value.keys() if str(key).strip())
            elif str(raw_value).strip():
                values.append(str(raw_value).strip())

    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(value)
    return deduped


def _tickets_payload(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("tickets", "data", "items", "results"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _pagination_payload(data: Any) -> dict[str, Any]:
    if isinstance(data, dict) and isinstance(data.get("pagination"), dict):
        return data["pagination"]
    return {}


async def sync_std_feedback_tickets(db: AsyncSession, *, limit: int = 100) -> dict[str, Any]:
    token = _std_token()
    if not token:
        return {"ok": False, "reason": "missing_token", "synced": 0}

    base_url = _std_base_url()
    headers = {"Authorization": f"Bearer {token}"}
    params: dict[str, Any] = {"limit": max(1, min(limit, 200))}
    synced = 0

    async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=30.0) as client:
        while True:
            response = await client.get("/feedback-tickets", params=params)
            response.raise_for_status()
            data = response.json()
            rows = _tickets_payload(data)
            for row in rows:
                external_id = _stringify(row.get("id"))
                if not external_id:
                    continue
                detail = row
                try:
                    detail_response = await client.get(f"/feedback-tickets/{external_id}")
                    detail_response.raise_for_status()
                    detail_data = detail_response.json()
                    if isinstance(detail_data, dict):
                        detail = {**row, **detail_data}
                except httpx.HTTPError:
                    detail = row
                await _upsert_std_ticket(db, detail)
                synced += 1

            pagination = _pagination_payload(data)
            if not pagination.get("has_more"):
                break
            cursor = pagination.get("next_cursor") if isinstance(pagination.get("next_cursor"), dict) else {}
            after_updated_at = cursor.get("after_updated_at")
            after_id = cursor.get("after_id")
            if not after_updated_at or not after_id:
                break
            params["after_updated_at"] = after_updated_at
            params["after_id"] = after_id

    await db.commit()
    return {"ok": True, "synced": synced}


async def _upsert_std_ticket(db: AsyncSession, payload: dict[str, Any]) -> None:
    external_id = _stringify(payload.get("id"))
    if not external_id:
        return
    creator = payload.get("creator") if isinstance(payload.get("creator"), dict) else {}
    existing = (
        await db.execute(select(StdFeedbackTicket).where(StdFeedbackTicket.external_id == external_id))
    ).scalar_one_or_none()
    ticket = existing or StdFeedbackTicket(external_id=external_id)

    ticket.issue_number = _int_or_none(payload.get("issue_number"))
    ticket.order_ticket_number = _stringify(payload.get("related_ticket_number"))
    ticket.title = _stringify(payload.get("title"))
    ticket.description = _stringify(payload.get("description"))
    ticket.affected_fields = _extract_affected_fields(payload)
    ticket.category = _stringify(payload.get("category"))
    ticket.priority = _stringify(payload.get("priority"))
    ticket.status = _stringify(payload.get("status"))
    ticket.reporter_username = _stringify(creator.get("username"))
    ticket.reporter_email = _stringify(creator.get("email"))
    ticket.assigned_admin = _stringify(payload.get("assigned_admin"))
    ticket.reported_at = _parse_datetime(payload.get("created_at"))
    ticket.source_updated_at = _parse_datetime(payload.get("updated_at"))
    ticket.closed_at = _parse_datetime(payload.get("closed_at"))
    ticket.raw = payload

    if existing is None:
        db.add(ticket)


def _source_day(ticket: StdFeedbackTicket) -> date | None:
    value = ticket.reported_at or ticket.source_updated_at
    if value is None:
        return None
    if value.tzinfo:
        return value.astimezone(report_timezone()).date()
    return value.date()


def _ticket_label(ticket: StdFeedbackTicket) -> str:
    parts: list[str] = []
    if ticket.issue_number is not None:
        parts.append(f"#{ticket.issue_number}")
    if ticket.order_ticket_number:
        parts.append(ticket.order_ticket_number)
    return " / ".join(parts) or ticket.external_id[:8]


def _affected_fields_label(ticket: StdFeedbackTicket) -> str:
    values = [str(value).strip() for value in (ticket.affected_fields or []) if str(value).strip()]
    return ", ".join(values) if values else "-"


async def std_tickets_report_section(db: AsyncSession, report_day: date) -> str:
    start = datetime.combine(report_day, datetime.min.time()).replace(tzinfo=report_timezone())
    end = datetime.combine(report_day, datetime.max.time()).replace(tzinfo=report_timezone())
    rows = (
        await db.execute(
            select(StdFeedbackTicket)
            .where(
                or_(
                    StdFeedbackTicket.reported_at.between(start, end),
                    StdFeedbackTicket.reported_at.is_(None),
                )
            )
            .order_by(StdFeedbackTicket.issue_number.asc().nullslast(), StdFeedbackTicket.created_at.asc())
        )
    ).scalars().all()
    tickets = [ticket for ticket in rows if _source_day(ticket) == report_day]

    lines = [f"{len(tickets)} tickets"]
    for ticket in tickets:
        lines.append(f"- {_ticket_label(ticket)}: {_affected_fields_label(ticket)}")
    return "\n".join(lines)


async def run_std_feedback_ticket_sync_forever() -> None:
    from app.db import SessionLocal

    while True:
        try:
            async with SessionLocal() as db:
                await sync_std_feedback_tickets(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("std_feedback_ticket_sync_failed")
        await asyncio.sleep(300)
