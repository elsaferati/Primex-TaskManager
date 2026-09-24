"""Collect public RSS and Atom entries without fetching individual articles."""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import feedparser
import httpx
from bs4 import BeautifulSoup

from app.intelligence.services import CollectedNewsItem

MAX_FEED_BYTES = 2_000_000
MAX_ENTRIES = 50
REDIRECT_LIMIT = 3
REDIRECT_STATUSES = {301, 302, 303, 307, 308}


class RSSCollectionError(RuntimeError):
    pass


def rss_url_is_supported(url: str) -> bool:
    """Accept public web URLs; DNS is checked again before every request."""
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
        return False
    if port and port != (443 if parsed.scheme == "https" else 80):
        return False
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True


async def _check_public_dns(url: str) -> None:
    if not rss_url_is_supported(url):
        raise RSSCollectionError("Use a public HTTP or HTTPS RSS feed URL without credentials or a custom port.")
    parsed = urlsplit(url)
    try:
        addresses = await asyncio.get_running_loop().getaddrinfo(
            parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except OSError as exc:
        raise RSSCollectionError("Could not resolve the RSS feed host.") from exc
    if not addresses or any(not ipaddress.ip_address(address[4][0].split("%")[0]).is_global for address in addresses):
        raise RSSCollectionError("RSS feeds must be hosted on a public internet address.")


def _plain_text(value: str) -> str:
    soup = BeautifulSoup(value, "html.parser")
    for node in soup.select("script, style, iframe"):
        node.decompose()
    return " ".join(soup.get_text(" ", strip=True).split())


def _published(entry: feedparser.FeedParserDict) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    try:
        return datetime(*parsed[:6], tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def parse_feed(payload: bytes, feed_url: str) -> list[CollectedNewsItem]:
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", payload, re.IGNORECASE):
        raise RSSCollectionError("RSS feeds with DTD or entity declarations are not supported.")
    feed = feedparser.parse(payload)
    if not feed.version.startswith(("rss", "atom")):
        raise RSSCollectionError("This URL does not return an RSS or Atom feed. Use the feed URL, not the website homepage.")
    posts: list[CollectedNewsItem] = []
    seen: set[str] = set()
    for entry in feed.entries[:MAX_ENTRIES]:
        raw_link = str(entry.get("link") or "")
        if not raw_link:
            continue
        link = urljoin(feed_url, raw_link)
        if not rss_url_is_supported(link) or link in seen:
            continue
        title = _plain_text(str(entry.get("title") or ""))[:500]
        if not title:
            continue
        seen.add(link)
        content = entry.get("content") or []
        raw_text = str(content[0].get("value") or "") if content else str(entry.get("summary") or entry.get("description") or "")
        description = _plain_text(raw_text)
        posts.append(CollectedNewsItem(
            external_id=str(entry.get("id") or link)[:500],
            url=link, title=title,
            original_text=(f"{title}. {description}" if description else title)[:20_000],
            published_at=_published(entry),
        ))
    return posts


class RSSAdapter:
    def __init__(self, source_url: str) -> None:
        if not rss_url_is_supported(source_url):
            raise RSSCollectionError("Use a public HTTP or HTTPS RSS feed URL without credentials or a custom port.")
        self.source_url = source_url

    async def collect(self) -> list[CollectedNewsItem]:
        current_url = self.source_url
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0), follow_redirects=False, trust_env=False) as client:
            for _ in range(REDIRECT_LIMIT + 1):
                await _check_public_dns(current_url)
                async with client.stream("GET", current_url, headers={
                    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.2",
                    "User-Agent": "PrimeFlow-Intelligence/1.0",
                }) as response:
                    if response.status_code in REDIRECT_STATUSES:
                        location = response.headers.get("location")
                        if not location:
                            raise RSSCollectionError("RSS feed redirected without a destination.")
                        current_url = urljoin(current_url, location)
                        continue
                    response.raise_for_status()
                    if response.headers.get("content-type", "").lower().startswith("text/html"):
                        raise RSSCollectionError("This URL returned a web page. Enter its RSS or Atom feed URL.")
                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > MAX_FEED_BYTES:
                            raise RSSCollectionError("RSS feed is larger than the supported 2 MB limit.")
                        chunks.append(chunk)
                    return parse_feed(b"".join(chunks), current_url)
        raise RSSCollectionError("RSS feed redirected too many times.")
