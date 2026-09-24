"""Bright Data LinkedIn post discovery. Credentials stay on the backend."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import httpx

from app.intelligence.models import NewsSource
from app.intelligence.services import CollectedNewsItem

API_BASE = "https://api.brightdata.com/datasets/v3/"
SNAPSHOT_ID = re.compile(r"^(?:s|sd)_[A-Za-z0-9]+$")


class LinkedInCollectionError(RuntimeError):
    pass


def _post_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname not in {"linkedin.com", "www.linkedin.com"}:
        return None
    if not (parsed.path.startswith("/posts/") or parsed.path.startswith("/feed/update/")):
        return None
    return value[:2000]


def _published(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def parse_posts(records: object, source: NewsSource) -> list[CollectedNewsItem]:
    if not isinstance(records, list):
        raise LinkedInCollectionError("The provider returned an unexpected snapshot format.")
    posts: list[CollectedNewsItem] = []
    for record in records:
        if not isinstance(record, dict) or record.get("error"):
            continue
        url = _post_url(record.get("url") or record.get("post_url"))
        if not url:
            continue
        body = record.get("post_text") or record.get("text") or record.get("headline") or ""
        body = " ".join(body.split()) if isinstance(body, str) else ""
        title = record.get("title")
        if not isinstance(title, str) or not title.strip():
            title = body[:140].rstrip(" .") + ("…" if len(body) > 140 else "") if body else f"Post by {source.name}"
        identifier = record.get("id") or record.get("post_id") or url
        posts.append(CollectedNewsItem(
            external_id=str(identifier)[:500], url=url, title=title.strip()[:500],
            original_text=body[:20_000] or None,
            published_at=_published(record.get("date_posted") or record.get("published_at")),
        ))
    if records and not posts:
        raise LinkedInCollectionError("Provider returned no usable direct post links for this source.")
    return posts


class BrightDataLinkedInAdapter:
    def __init__(self, token: str, dataset_id: str) -> None:
        self.token = token
        self.dataset_id = dataset_id

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=API_BASE, timeout=httpx.Timeout(25.0), follow_redirects=False,
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"},
        )

    def _json(self, response: httpx.Response) -> object:
        try:
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            detail = ""
            try:
                payload = response.json()
                if isinstance(payload, dict):
                    value = payload.get("error") or payload.get("message")
                    if isinstance(value, str):
                        detail = value.replace(self.token, "[redacted]")[:250]
            except ValueError:
                pass
            suffix = f" {detail}" if detail else ""
            raise LinkedInCollectionError(f"Provider request failed (HTTP {response.status_code}).{suffix}") from exc
        except ValueError as exc:
            raise LinkedInCollectionError("Provider returned invalid JSON.") from exc

    async def trigger(self, source: NewsSource, *, start_date: str, end_date: str) -> str:
        discovery = "company_url" if urlparse(source.url).path.startswith("/company/") else "profile_url"
        async with self._client() as client:
            response = await client.post(
                "trigger",
                params={"dataset_id": self.dataset_id, "type": "discover_new", "discover_by": discovery, "limit_per_input": 100},
                json=[{"url": source.url, "start_date": start_date, "end_date": end_date}],
            )
        payload = self._json(response)
        snapshot_id = payload.get("snapshot_id") if isinstance(payload, dict) else None
        if not isinstance(snapshot_id, str) or not SNAPSHOT_ID.fullmatch(snapshot_id):
            raise LinkedInCollectionError("Provider did not return a valid snapshot ID.")
        return snapshot_id

    async def progress(self, snapshot_id: str) -> str:
        if not SNAPSHOT_ID.fullmatch(snapshot_id):
            raise LinkedInCollectionError("Invalid snapshot ID.")
        async with self._client() as client:
            response = await client.get(f"progress/{snapshot_id}")
        payload = self._json(response)
        state = payload.get("status") if isinstance(payload, dict) else None
        if state not in {"starting", "running", "ready", "failed"}:
            raise LinkedInCollectionError("Provider returned an unknown collection status.")
        return state

    async def download(self, snapshot_id: str, source: NewsSource) -> list[CollectedNewsItem]:
        if not SNAPSHOT_ID.fullmatch(snapshot_id):
            raise LinkedInCollectionError("Invalid snapshot ID.")
        async with self._client() as client:
            response = await client.get(f"snapshot/{snapshot_id}", params={"format": "json"})
        return parse_posts(self._json(response), source)
