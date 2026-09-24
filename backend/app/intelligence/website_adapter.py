"""Small, allowlisted collectors for official website sources."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.intelligence.services import CollectedNewsItem

KIESA_HOST = "kiesa.rks-gov.net"
EU_DIGITAL_HOST = "digital-strategy.ec.europa.eu"
MAX_HTML_BYTES = 2_000_000
KIESA_DATE = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
EU_DATE = re.compile(r"\b(\d{1,2}) ([A-Za-z]+) (\d{4})\b")


class WebsiteCollectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class WebsiteEntry:
    url: str
    title: str
    text: str
    published_at: datetime | None = None
    closes_at: datetime | None = None


def source_kind(url: str) -> str | None:
    parsed = urlparse(url)
    try:
        port = parsed.port
    except ValueError:
        return None
    if parsed.scheme != "https" or parsed.username or parsed.password or port:
        return None
    if parsed.hostname == KIESA_HOST and parsed.path.lower() == "/page.aspx":
        section = parse_qs(parsed.query).get("id", [""])[0]
        return "kiesa_news" if section == "1,5" else "kiesa_calls" if section == "1,134" else None
    if parsed.hostname == EU_DIGITAL_HOST and not parsed.query:
        return "eu_news" if parsed.path == "/en/news" else "eu_funding" if parsed.path == "/en/funding" else None
    return None


def _date(value: str, *, kiesa: bool = False) -> datetime | None:
    match = (KIESA_DATE if kiesa else EU_DATE).search(value)
    if not match:
        return None
    try:
        if kiesa:
            day, month, year = map(int, match.groups())
            return datetime(year, month, day, tzinfo=timezone.utc)
        return datetime.strptime(match.group(), "%d %B %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _clean(value: str) -> str:
    return " ".join(value.split())


def parse_listing(html: str, source_url: str) -> list[WebsiteEntry]:
    kind = source_kind(source_url)
    if kind is None:
        raise WebsiteCollectionError("No website connector is available for this source URL.")
    soup = BeautifulSoup(html, "html.parser")
    entries: list[WebsiteEntry] = []
    seen: set[str] = set()
    if kind.startswith("kiesa_"):
        for link in soup.select("a[href]"):
            href = link.get("href", "")
            if not re.fullmatch(r"(?i)page\.aspx\?id=1,(?:5|134),\d+", href):
                continue
            url = urljoin(source_url, href)
            title = _clean(link.get_text(" ", strip=True))
            if not title or url in seen:
                continue
            seen.add(url)
            entries.append(WebsiteEntry(url, title[:500], title))
    else:
        path_prefix = "/en/news/" if kind == "eu_news" else "/en/funding/"
        for card in soup.select("article.ecl-content-item"):
            link = card.select_one("a[href]")
            if link is None or not link.get("href", "").startswith(path_prefix):
                continue
            url = urljoin(source_url, link["href"])
            title = _clean(link.get_text(" ", strip=True))
            if not title or url in seen:
                continue
            seen.add(url)
            metadata = " ".join(node.get_text(" ", strip=True) for node in card.select(".ecl-content-block__primary-meta-item"))
            description = card.select_one(".ecl-content-block__description")
            text = _clean(" ".join(part for part in [metadata, title, description.get_text(" ", strip=True) if description else ""] if part))
            dates = [_date(match.group()) for match in EU_DATE.finditer(metadata)]
            entries.append(WebsiteEntry(
                url, title[:500], text[:12_000], dates[0] if dates else None,
                dates[-1] if kind == "eu_funding" and len(dates) > 1 else None,
            ))
    if not entries:
        raise WebsiteCollectionError("No article links were found on the source page.")
    return entries[:20]


def parse_article(html: str, entry: WebsiteEntry) -> CollectedNewsItem:
    soup = BeautifulSoup(html, "html.parser")
    parsed = urlparse(entry.url)
    if parsed.hostname == KIESA_HOST:
        panel = soup.select_one("#MainContent_ctl00_pnlLajmetDetails")
        if panel is None:
            raise WebsiteCollectionError("KIESA article content was not found.")
        title_node = panel.select_one("h2")
        title = _clean(title_node.get_text(" ", strip=True)) if title_node else entry.title
        for node in panel.select("script, style, nav"):
            node.decompose()
        text = _clean(panel.get_text(" ", strip=True))
        published_at = _date(text[:500], kiesa=True)
    else:
        title_node = soup.select_one("h1.ecl-page-header__title")
        title = _clean(title_node.get_text(" ", strip=True)) if title_node else entry.title
        article = soup.select_one("main article")
        for node in article.select("script, style, nav") if article else []:
            node.decompose()
        text = _clean(article.get_text(" ", strip=True))[:12_000] if article else entry.text
        metadata = soup.select_one(".ecl-page-header__meta")
        published_at = _date(metadata.get_text(" ", strip=True)) if metadata else entry.published_at
    return CollectedNewsItem(
        external_id=entry.url[:500], url=entry.url, title=title[:500],
        original_text=(text or entry.text)[:20_000], published_at=published_at or entry.published_at,
    )


class OfficialWebsiteAdapter:
    def __init__(self, source_url: str) -> None:
        self.kind = source_kind(source_url)
        if self.kind is None:
            raise WebsiteCollectionError("No website connector is available for this source URL.")
        self.source_url = source_url
        self.host = urlparse(source_url).hostname

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=httpx.Timeout(20.0), follow_redirects=False)

    async def _html(self, client: httpx.AsyncClient, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != self.host or parsed.username or parsed.password or parsed.port:
            raise WebsiteCollectionError("Article URL is outside the configured official website.")
        response = await client.get(url)
        response.raise_for_status()
        if not response.headers.get("content-type", "").lower().startswith("text/html") or len(response.content) > MAX_HTML_BYTES:
            raise WebsiteCollectionError("Website returned an unsupported page format.")
        return response.text

    async def discover(self, client: httpx.AsyncClient) -> list[WebsiteEntry]:
        return parse_listing(await self._html(client, self.source_url), self.source_url)

    async def article(self, client: httpx.AsyncClient, entry: WebsiteEntry) -> CollectedNewsItem:
        if self.kind == "eu_funding":
            # These cards redirect to individual Funding & Tenders Portal topics.
            return CollectedNewsItem(
                external_id=entry.url[:500], url=entry.url, title=entry.title,
                original_text=entry.text, published_at=entry.published_at,
            )
        return parse_article(await self._html(client, entry.url), entry)
