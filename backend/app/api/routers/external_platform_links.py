from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_manager_or_admin
from app.db import get_db
from app.models.external_platform_link import ExternalPlatformLink
from app.models.user import User
from app.schemas.external_platform_link import (
    ExternalPlatformLinkCreate,
    ExternalPlatformLinkOut,
    ExternalPlatformLinkUpdate,
)


router = APIRouter()


def _to_out(link: ExternalPlatformLink) -> ExternalPlatformLinkOut:
    return ExternalPlatformLinkOut(
        id=link.id,
        label=link.label,
        href=link.href,
        description=link.description,
        sort_order=link.sort_order,
        is_active=link.is_active,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


@router.get("", response_model=list[ExternalPlatformLinkOut])
async def list_external_platform_links(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ExternalPlatformLinkOut]:
    can_manage = user.role.value in {"ADMIN", "MANAGER"}
    stmt = select(ExternalPlatformLink)
    if include_inactive and can_manage:
        stmt = stmt.order_by(ExternalPlatformLink.sort_order, ExternalPlatformLink.label)
    else:
        stmt = stmt.where(ExternalPlatformLink.is_active.is_(True)).order_by(
            ExternalPlatformLink.sort_order, ExternalPlatformLink.label
        )
    links = (await db.execute(stmt)).scalars().all()
    return [_to_out(link) for link in links]


@router.post("", response_model=ExternalPlatformLinkOut, status_code=status.HTTP_201_CREATED)
async def create_external_platform_link(
    payload: ExternalPlatformLinkCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager_or_admin),
) -> ExternalPlatformLinkOut:
    link = ExternalPlatformLink(
        label=payload.label.strip(),
        href=payload.href.strip(),
        description=payload.description.strip() if payload.description else None,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return _to_out(link)


@router.patch("/{link_id}", response_model=ExternalPlatformLinkOut)
async def update_external_platform_link(
    link_id: uuid.UUID,
    payload: ExternalPlatformLinkUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager_or_admin),
) -> ExternalPlatformLinkOut:
    link = (await db.execute(select(ExternalPlatformLink).where(ExternalPlatformLink.id == link_id))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    fields_set = payload.model_fields_set

    if "label" in fields_set and payload.label is not None:
        link.label = payload.label.strip()
    if "href" in fields_set and payload.href is not None:
        link.href = payload.href.strip()
    if "description" in fields_set:
        link.description = payload.description.strip() if payload.description else None
    if "sort_order" in fields_set and payload.sort_order is not None:
        link.sort_order = payload.sort_order
    if "is_active" in fields_set and payload.is_active is not None:
        link.is_active = payload.is_active

    await db.commit()
    await db.refresh(link)
    return _to_out(link)


@router.delete(
    "/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
)
async def delete_external_platform_link(
    link_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager_or_admin),
 ) -> Response:
    link = (await db.execute(select(ExternalPlatformLink).where(ExternalPlatformLink.id == link_id))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    await db.delete(link)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
