from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.db import get_db
from app.intelligence.collection import check_source, linkedin_configured
from app.intelligence.email_service import INTELLIGENCE_RECIPIENT, send_news_email
from app.intelligence.linkedin_adapter import LinkedInCollectionError
from app.intelligence.models import NewsAnalysis, NewsItem, NewsSource, NewsUserState
from app.intelligence.priority import news_priority
from app.intelligence.rss_adapter import rss_url_is_supported
from app.intelligence.schemas import EmailShareOut, IntelligenceStatusOut, NewsFeedOut, NewsSourceCreate, NewsSourceOut, NewsSourceUpdate, SourceCheckOut
from app.intelligence.website_adapter import source_kind
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


def _source_out(source: NewsSource) -> NewsSourceOut:
    output = NewsSourceOut.model_validate(source)
    output.collection_supported = source.type == "LINKEDIN" or (source.type == "WEBSITE" and bool(source_kind(source.url))) or (source.type == "RSS" and rss_url_is_supported(source.url))
    return output


@router.get("/status", response_model=IntelligenceStatusOut)
async def intelligence_status(_: User = Depends(require_admin)) -> IntelligenceStatusOut:
    return IntelligenceStatusOut(linkedinConfigured=linkedin_configured())


@router.get("/items", response_model=NewsFeedOut)
async def list_items(
    read_state: Literal["all", "unread", "read"] = "all",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NewsFeedOut:
    source_rows = (await db.execute(select(NewsSource.type, NewsSource.url).where(
        NewsSource.type.in_(["LINKEDIN", "WEBSITE", "RSS"]),
    ))).all()
    has_live_sources = any(kind == "LINKEDIN" or (kind == "WEBSITE" and source_kind(url)) or (kind == "RSS" and rss_url_is_supported(url)) for kind, url in source_rows)
    query = (
        select(NewsItem, NewsSource, NewsAnalysis, NewsUserState.read_at, NewsUserState.emailed_at)
        .join(NewsSource, NewsSource.id == NewsItem.source_id)
        .join(NewsAnalysis, NewsAnalysis.news_item_id == NewsItem.id)
        .outerjoin(NewsUserState, and_(
            NewsUserState.news_item_id == NewsItem.id,
            NewsUserState.user_id == user.id,
        ))
        .order_by(NewsItem.published_at.desc().nullslast(), NewsItem.created_at.desc())
        .limit(200)
    )
    if read_state == "unread":
        query = query.where(NewsUserState.read_at.is_(None))
    elif read_state == "read":
        query = query.where(NewsUserState.read_at.is_not(None))
    rows = (await db.execute(query)).all()
    return NewsFeedOut(hasLiveSources=has_live_sources, items=[{
        "id": str(item.id), "sourceId": str(source.id), "sourceName": source.name,
        "sourceType": source.type, "externalId": item.external_id,
        "url": item.url, "title": item.title, "originalText": item.original_text,
        "publishedAt": (item.published_at or item.created_at).isoformat(),
        "imageUrl": item.image_url, "contentHash": item.content_hash,
        "createdAt": item.created_at.isoformat(), "location": None,
        "readAt": read_at.isoformat() if read_at else None,
        "emailedAt": emailed_at.isoformat() if emailed_at else None,
        "priority": news_priority(source.priority, analysis.importance_score, analysis.relevance_score),
        "analysis": {
            "summary": analysis.summary, "category": analysis.category,
            "importanceScore": analysis.importance_score, "relevanceScore": analysis.relevance_score,
            "whyItMatters": analysis.why_it_matters,
            "deadline": analysis.deadline.isoformat() if analysis.deadline else None,
            "fundingAmount": analysis.funding_amount, "eligibility": analysis.eligibility,
            "opportunityType": analysis.opportunity_type, "tags": analysis.tags,
        },
    } for item, source, analysis, read_at, emailed_at in rows])


@router.post("/items/{item_id}/email", response_model=EmailShareOut)
async def email_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EmailShareOut:
    result = (await db.execute(
        select(NewsItem, NewsSource, NewsAnalysis)
        .join(NewsSource, NewsSource.id == NewsItem.source_id)
        .join(NewsAnalysis, NewsAnalysis.news_item_id == NewsItem.id)
        .where(NewsItem.id == item_id)
    )).one_or_none()
    if result is None:
        raise HTTPException(status_code=404, detail="Update not found")
    item, source, analysis = result
    await db.execute(pg_insert(NewsUserState).values(
        user_id=user.id, news_item_id=item_id,
    ).on_conflict_do_nothing(index_elements=[NewsUserState.user_id, NewsUserState.news_item_id]))
    user_state = (await db.execute(select(NewsUserState).where(
        NewsUserState.user_id == user.id,
        NewsUserState.news_item_id == item_id,
    ).with_for_update())).scalar_one()
    if user_state.emailed_at:
        sent_at = user_state.emailed_at
        await db.rollback()
        return EmailShareOut(recipient=INTELLIGENCE_RECIPIENT, sentAt=sent_at, alreadySent=True)
    try:
        await send_news_email(item, source, analysis)
    except ValueError as exc:
        await db.rollback()
        logger.warning("Intelligence email configuration unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="Email sending is not configured right now.") from exc
    except Exception as exc:
        await db.rollback()
        logger.exception("Could not email Intelligence update %s", item_id)
        raise HTTPException(status_code=502, detail="Could not send this update. Please try again.") from exc
    user_state.emailed_at = datetime.now(timezone.utc)
    await db.commit()
    return EmailShareOut(recipient=INTELLIGENCE_RECIPIENT, sentAt=user_state.emailed_at, alreadySent=False)


@router.put("/items/{item_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_item_read(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    if await db.get(NewsItem, item_id) is None:
        raise HTTPException(status_code=404, detail="Update not found")
    statement = pg_insert(NewsUserState).values(
        user_id=user.id, news_item_id=item_id, read_at=func.now(),
    ).on_conflict_do_update(
        index_elements=[NewsUserState.user_id, NewsUserState.news_item_id],
        set_={"read_at": func.now()},
    )
    await db.execute(statement)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/items/{item_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_item_unread(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    await db.execute(update(NewsUserState).where(
        NewsUserState.user_id == user.id,
        NewsUserState.news_item_id == item_id,
    ).values(read_at=None))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sources", response_model=list[NewsSourceOut])
async def list_sources(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> list[NewsSourceOut]:
    sources = (await db.execute(select(NewsSource).order_by(NewsSource.created_at.desc()))).scalars().all()
    return [_source_out(source) for source in sources]


@router.post("/sources", response_model=NewsSourceOut, status_code=status.HTTP_201_CREATED)
async def create_source(payload: NewsSourceCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> NewsSourceOut:
    if payload.type == "RSS" and not rss_url_is_supported(payload.url):
        raise HTTPException(status_code=422, detail="Use a public HTTP or HTTPS RSS feed URL without credentials or a custom port.")
    source = NewsSource(**payload.model_dump())
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _source_out(source)


async def _get_source(db: AsyncSession, source_id: uuid.UUID) -> NewsSource:
    source = await db.get(NewsSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.post("/sources/{source_id}/check", response_model=SourceCheckOut)
async def check_source_now(source_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> SourceCheckOut:
    source = await _get_source(db, source_id)
    if source.type in {"WEBSITE", "RSS"}:
        if source.type == "WEBSITE" and not source_kind(source.url):
            raise HTTPException(status_code=422, detail="No collector is available for this website URL yet.")
        if source.type == "RSS" and not rss_url_is_supported(source.url):
            raise HTTPException(status_code=422, detail="Use a public HTTP or HTTPS RSS feed URL.")
        if source.status != "ACTIVE":
            raise HTTPException(status_code=422, detail="Activate this source before checking it.")
        from app.celery_tasks import check_intelligence_source
        check_intelligence_source.delay(str(source_id))
        return SourceCheckOut(state="started")
    if not linkedin_configured():
        raise HTTPException(status_code=503, detail="LinkedIn collection requires a Bright Data API token on the server.")
    try:
        state = await check_source(db, source_id, force=True)
    except LinkedInCollectionError as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=502, detail="Could not check this source right now.")
    return SourceCheckOut(state=state)


@router.put("/sources/{source_id}", response_model=NewsSourceOut)
async def update_source(source_id: uuid.UUID, payload: NewsSourceUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> NewsSourceOut:
    if payload.type == "RSS" and not rss_url_is_supported(payload.url):
        raise HTTPException(status_code=422, detail="Use a public HTTP or HTTPS RSS feed URL without credentials or a custom port.")
    source = await _get_source(db, source_id)
    if source.url != payload.url or source.type != payload.type:
        source.pending_snapshot_id = None
        source.last_started_at = None
        source.last_checked_at = None
        source.last_error = None
    for field, value in payload.model_dump().items():
        setattr(source, field, value)
    await db.commit()
    await db.refresh(source)
    return _source_out(source)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> Response:
    source = await _get_source(db, source_id)
    await db.delete(source)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
