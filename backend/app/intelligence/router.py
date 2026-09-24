from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.db import get_db
from app.intelligence.models import NewsSource
from app.intelligence.schemas import NewsSourceCreate, NewsSourceOut, NewsSourceUpdate
from app.models.user import User

router = APIRouter()


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


@router.put("/sources/{source_id}", response_model=NewsSourceOut)
async def update_source(source_id: uuid.UUID, payload: NewsSourceUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> NewsSource:
    source = await _get_source(db, source_id)
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
