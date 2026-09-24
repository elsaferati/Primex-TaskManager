from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.db import get_db
from app.intelligence.collection import check_source, linkedin_configured
from app.intelligence.linkedin_adapter import LinkedInCollectionError
from app.intelligence.models import NewsAnalysis, NewsItem, NewsSource
from app.intelligence.schemas import IntelligenceStatusOut, NewsFeedOut, NewsSourceCreate, NewsSourceOut, NewsSourceUpdate, SourceCheckOut
from app.models.user import User

router = APIRouter()


@router.get("/status", response_model=IntelligenceStatusOut)
async def intelligence_status(_: User = Depends(require_admin)) -> IntelligenceStatusOut:
    return IntelligenceStatusOut(linkedinConfigured=linkedin_configured())


@router.get("/items", response_model=NewsFeedOut)
async def list_items(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)) -> NewsFeedOut:
    has_live_sources = bool(await db.scalar(select(func.count()).select_from(NewsSource).where(NewsSource.type == "LINKEDIN")))
    rows = (await db.execute(
        select(NewsItem, NewsSource, NewsAnalysis)
        .join(NewsSource, NewsSource.id == NewsItem.source_id)
        .join(NewsAnalysis, NewsAnalysis.news_item_id == NewsItem.id)
        .order_by(NewsItem.published_at.desc().nullslast(), NewsItem.created_at.desc())
        .limit(200)
    )).all()
    return NewsFeedOut(hasLiveSources=has_live_sources, items=[{
        "id": str(item.id), "sourceId": str(source.id), "sourceName": source.name,
        "sourceType": source.type, "externalId": item.external_id,
        "url": item.url, "title": item.title, "originalText": item.original_text,
        "publishedAt": (item.published_at or item.created_at).isoformat(),
        "imageUrl": item.image_url, "contentHash": item.content_hash,
        "createdAt": item.created_at.isoformat(), "location": None,
        "priority": "HIGH" if source.priority == "HIGH" else "NORMAL",
        "analysis": {
            "summary": analysis.summary, "category": analysis.category,
            "importanceScore": analysis.importance_score, "relevanceScore": analysis.relevance_score,
            "whyItMatters": analysis.why_it_matters,
            "deadline": analysis.deadline.isoformat() if analysis.deadline else None,
            "fundingAmount": analysis.funding_amount, "eligibility": analysis.eligibility,
            "opportunityType": analysis.opportunity_type, "tags": analysis.tags,
        },
    } for item, source, analysis in rows])


@router.get("/sources", response_model=list[NewsSourceOut])
async def list_sources(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> list[NewsSource]:
    return list((await db.execute(select(NewsSource).order_by(NewsSource.created_at.desc()))).scalars().all())


@router.post("/sources", response_model=NewsSourceOut, status_code=status.HTTP_201_CREATED)
async def create_source(payload: NewsSourceCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> NewsSource:
    source = NewsSource(**payload.model_dump())
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return source


async def _get_source(db: AsyncSession, source_id: uuid.UUID) -> NewsSource:
    source = await db.get(NewsSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.post("/sources/{source_id}/check", response_model=SourceCheckOut)
async def check_linkedin_source(source_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> SourceCheckOut:
    await _get_source(db, source_id)
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
async def update_source(source_id: uuid.UUID, payload: NewsSourceUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> NewsSource:
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
    return source


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> Response:
    source = await _get_source(db, source_id)
    await db.delete(source)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
