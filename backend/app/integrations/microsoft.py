from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings


GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
OAUTH_BASE_URL = f"https://login.microsoftonline.com/{settings.MS_TENANT_ID}/oauth2/v2.0"

SCOPES = ["offline_access", "https://graph.microsoft.com/User.Read", "https://graph.microsoft.com/Calendars.Read"]
SCOPE_STR = " ".join(SCOPES)


def format_datetime(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "response_mode": "query",
        "scope": SCOPE_STR,
        "state": state,
        "prompt": "select_account",
    }
    return f"{OAUTH_BASE_URL}/authorize?{urlencode(params)}"


async def exchange_code_for_token(code: str, redirect_uri: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            f"{OAUTH_BASE_URL}/token",
            data={
                "client_id": settings.MS_CLIENT_ID,
                "client_secret": settings.MS_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "scope": SCOPE_STR,
            },
        )
    res.raise_for_status()
    return res.json()


async def refresh_access_token(refresh_token: str, redirect_uri: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            f"{OAUTH_BASE_URL}/token",
            data={
                "client_id": settings.MS_CLIENT_ID,
                "client_secret": settings.MS_CLIENT_SECRET,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "redirect_uri": redirect_uri,
                "scope": SCOPE_STR,
            },
        )
    res.raise_for_status()
    return res.json()


async def fetch_calendar_events(access_token: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    params = {
        "startDateTime": format_datetime(start),
        "endDateTime": format_datetime(end),
        "$select": "id,subject,start,end,location,isAllDay,organizer,bodyPreview",
        "$orderby": "start/dateTime",
        "$top": "50",
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Prefer": 'outlook.timezone="UTC"',
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(f"{GRAPH_BASE_URL}/me/calendarView", params=params, headers=headers)
    res.raise_for_status()
    data = res.json()
    return data.get("value", [])


def compute_expires_at(expires_in: int) -> datetime:
    now = datetime.now(timezone.utc)
    buffer_seconds = 60
    return now + timedelta(seconds=max(expires_in - buffer_seconds, 0))
