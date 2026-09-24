"""Poll connected Intelligence sources and persist each direct item URL once."""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionLocal
from app.intelligence.ai_service import analyze_news_item
from app.intelligence.linkedin_adapter import BrightDataLinkedInAdapter, LinkedInCollectionError
from app.intelligence.models import NewsAnalysis, NewsItem, NewsSource
from app.intelligence.services import CollectedNewsItem
from app.intelligence.website_adapter import OfficialWebsiteAdapter, WebsiteCollectionError, WebsiteEntry, source_kind

logger = logging.getLogger(__name__)
INITIAL_LOOKBACK_DAYS = 60


def linkedin_configured() -> bool:
    return bool(settings.BRIGHTDATA_API_TOKEN)


def collection_start_date(last_checked_at: datetime | None, now: datetime) -> str:
    if last_checked_at is None:
        return (now.date() - timedelta(days=INITIAL_LOOKBACK_DAYS)).isoformat()
    return (last_checked_at.date() - timedelta(days=1)).isoformat()


async def _store_post(db: AsyncSession, source: NewsSource, post: CollectedNewsItem) -> bool:
    content_hash = hashlib.sha256(post.url.encode("utf-8")).hexdigest()
    exists = await db.scalar(select(NewsItem.id).where(
        NewsItem.source_id == source.id,
        or_(NewsItem.external_id == post.external_id, NewsItem.content_hash == content_hash, NewsItem.url == post.url),
    ).limit(1))
    if exists:
        return False
    analysis = await analyze_news_item(post, source)
    item = NewsItem(
        source_id=source.id, external_id=post.external_id, url=post.url,
        title=post.title, original_text=post.original_text,
        published_at=post.published_at, image_url=post.image_url, content_hash=content_hash,
    )
    db.add(item)
    await db.flush()
    db.add(NewsAnalysis(
        news_item_id=item.id, summary=analysis.summary, category=analysis.category,
        importance_score=analysis.importanceScore, relevance_score=analysis.relevanceScore,
        why_it_matters=analysis.whyItMatters, deadline=analysis.deadline,
        funding_amount=analysis.fundingAmount, eligibility=analysis.eligibility,
        opportunity_type=analysis.opportunityType, tags=analysis.tags,
    ))
    return True


def website_entry_is_current(entry: WebsiteEntry, now: datetime) -> bool:
    if entry.closes_at:
        return entry.closes_at.date() >= now.date()
    return not entry.published_at or entry.published_at >= now - timedelta(days=60)


async def _check_website_source(db: AsyncSession, source: NewsSource, now: datetime, force: bool) -> str:
    minimum_interval = 5 if force else source.fetch_interval_minutes
    if source.last_started_at and source.last_started_at > now - timedelta(minutes=minimum_interval):
        return "pending"
    adapter = OfficialWebsiteAdapter(source.url)
    cutoff = now - timedelta(days=60)
    async with adapter._client() as client:
        entries = await adapter.discover(client)
        for entry in entries:
            if not website_entry_is_current(entry, now):
                continue
            exists = await db.scalar(select(NewsItem.id).where(
                NewsItem.source_id == source.id, NewsItem.url == entry.url,
            ).limit(1))
            if exists:
                continue
            try:
                post = await adapter.article(client, entry)
            except (WebsiteCollectionError, httpx.HTTPError) as exc:
                logger.warning("Could not read official article %s: %s", entry.url, exc)
                continue
            if post.published_at and post.published_at < cutoff and not entry.closes_at:
                continue
            await _store_post(db, source, post)
    source.last_started_at = now
    source.last_checked_at = now
    source.last_error = None
    await db.commit()
    return "completed"


async def check_source(db: AsyncSession, source_id: uuid.UUID, *, force: bool = False) -> str:
    source = (await db.execute(
        select(NewsSource).where(NewsSource.id == source_id).with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if source is None:
        return "pending"
    if source.type not in {"LINKEDIN", "WEBSITE"} or (source.type == "WEBSITE" and not source_kind(source.url)):
        raise LinkedInCollectionError("No collector is available for this source URL yet.")
    if source.status != "ACTIVE":
        raise LinkedInCollectionError("Activate this source before checking it.")

    now = datetime.now(timezone.utc)
    try:
        if source.type == "WEBSITE":
            return await _check_website_source(db, source, now, force)
        if not settings.BRIGHTDATA_API_TOKEN:
            return "unavailable"
        adapter = BrightDataLinkedInAdapter(settings.BRIGHTDATA_API_TOKEN, settings.BRIGHTDATA_LINKEDIN_POSTS_DATASET_ID)
        if source.pending_snapshot_id:
            if source.last_started_at and source.last_started_at < now - timedelta(days=1):
                source.pending_snapshot_id = None
                source.last_error = "Previous collection timed out. A new check will start."
            else:
                progress = await adapter.progress(source.pending_snapshot_id)
                if progress in {"starting", "running"}:
                    return "pending"
                if progress == "failed":
                    source.pending_snapshot_id = None
                    source.last_error = "Provider could not complete this check. Try again later."
                    await db.commit()
                    return "error"
                posts = await adapter.download(source.pending_snapshot_id, source)
                seen: set[str] = set()
                for post in posts:
                    if post.url in seen:
                        continue
                    seen.add(post.url)
                    await _store_post(db, source, post)
                source.pending_snapshot_id = None
                source.last_checked_at = now
                source.last_error = None
                await db.commit()
                return "completed"

        minimum_interval = 5 if force else source.fetch_interval_minutes
        if source.last_started_at and source.last_started_at > now - timedelta(minutes=minimum_interval):
            return "pending"
        snapshot = await adapter.trigger(
            source,
            start_date=collection_start_date(None if force else source.last_checked_at, now),
            end_date=now.date().isoformat(),
        )
        source.pending_snapshot_id = snapshot
        source.last_started_at = now
        source.last_error = None
        await db.commit()
        return "started"
    except (LinkedInCollectionError, WebsiteCollectionError, httpx.HTTPError) as exc:
        await db.rollback()
        source = await db.get(NewsSource, source_id)
        if source is None:
            return "error"
        source.last_error = str(exc)[:500]
        source.last_started_at = now
        await db.commit()
        logger.warning("Intelligence source %s: %s", source.id, exc)
        return "error"


async def check_due_sources() -> dict[str, int]:
    async with SessionLocal() as db:
        sources = list((await db.execute(select(NewsSource).where(
            NewsSource.type.in_(["LINKEDIN", "WEBSITE"]), NewsSource.status == "ACTIVE",
        ))).scalars().all())
    ids = [source.id for source in sources if
           (source.type == "LINKEDIN" and linkedin_configured()) or
           (source.type == "WEBSITE" and source_kind(source.url))]
    checked = 0
    for source_id in ids:
        try:
            async with SessionLocal() as db:
                state = await check_source(db, source_id)
            if state in {"started", "completed"}:
                checked += 1
        except Exception:
            logger.exception("Intelligence collection failed for source %s", source_id)
    return {"checked": checked}
