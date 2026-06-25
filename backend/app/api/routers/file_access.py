from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models.enums import NotificationType
from app.models.file_access_request import FileAccessRequest
from app.models.user import User
from app.schemas.file_access import (
    FileAccessAccessOut,
    FileAccessDecision,
    FileAccessFolderOut,
    FileAccessRemove,
    FileAccessRequestCreate,
    FileAccessRequestOut,
    FileAccessUserMappingOut,
)
from app.services.notifications import add_notification, publish_notification


router = APIRouter()

APPROVER_NAMES = {"laurent hoxha", "endi hyseni"}
EXPLICIT_SAM_MAPPINGS = {
    "endi hyseni": "eh",
    "enesa sharku": "ESH",
    "elsa ferati": "EF",
    "rinesa ahmedi": "RA",
}


def _normalize_name(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def _primeflow_user_to_sam(user: User) -> str:
    name = _normalize_name(user.full_name)
    if name in EXPLICIT_SAM_MAPPINGS:
        return EXPLICIT_SAM_MAPPINGS[name]
    parts = re.findall(r"[A-Za-z0-9]+", user.full_name or user.username or user.email.split("@")[0])
    if len(parts) >= 2:
        return "".join(part[0] for part in parts[:3]).upper()
    if user.username:
        return user.username.strip().upper()
    return user.email.split("@")[0].strip().upper()


def _is_file_access_approver(user: User) -> bool:
    return _normalize_name(user.full_name) in APPROVER_NAMES


def _require_file_access_approver(user: User) -> None:
    if not _is_file_access_approver(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Laurent Hoxha or Endi Hyseni can approve file access",
        )


def _file_access_headers() -> dict[str, str]:
    if not settings.FILE_ACCESS_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="FileAccess API key is not configured",
        )
    return {"X-FileAccess-Api-Key": settings.FILE_ACCESS_API_KEY}


async def _file_access_request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
) -> Any:
    base_url = settings.FILE_ACCESS_API_BASE_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
            response = await client.request(
                method,
                f"{base_url}{path}",
                params=params,
                json=json,
                headers=_file_access_headers(),
            )
            response.raise_for_status()
            if response.content:
                return response.json()
            return {}
    except httpx.HTTPStatusError as exc:
        detail: Any = exc.response.text
        try:
            detail = exc.response.json()
        except ValueError:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"FileAccess API is unavailable: {exc}",
        )


def _folder_to_out(folder: dict[str, Any]) -> FileAccessFolderOut:
    return FileAccessFolderOut(
        id=int(folder["id"]),
        fullPath=folder.get("fullPath"),
        relativePath=folder.get("relativePath"),
        folderName=folder.get("folderName") or folder.get("relativePath") or folder.get("fullPath") or str(folder["id"]),
        parentFolderId=folder.get("parentFolderId"),
        isManaged=folder.get("isManaged"),
        accessGroupName=folder.get("accessGroupName"),
        hasChildren=folder.get("hasChildren"),
    )


def _request_to_out(request: FileAccessRequest) -> FileAccessRequestOut:
    return FileAccessRequestOut(
        id=request.id,
        requester_user_id=request.requester_user_id,
        requester_name=request.requester.full_name if request.requester else "",
        requester_sam_account_name=request.requester_sam_account_name,
        folder_id=request.folder_id,
        folder_path=request.folder_path,
        folder_name=request.folder_name,
        reason=request.reason,
        status=request.status,
        approver_user_id=request.approver_user_id,
        approver_name=request.approver.full_name if request.approver else None,
        decision_note=request.decision_note,
        decided_at=request.decided_at,
        created_at=request.created_at,
        updated_at=request.updated_at,
    )


async def _get_approvers(db: AsyncSession) -> list[User]:
    users = (await db.execute(select(User).where(User.is_active.is_(True)))).scalars().all()
    return [user for user in users if _is_file_access_approver(user)]


@router.get("/users/map", response_model=list[FileAccessUserMappingOut])
async def list_user_mappings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[FileAccessUserMappingOut]:
    users = (await db.execute(select(User).where(User.is_active.is_(True)).order_by(User.full_name))).scalars().all()
    return [
        FileAccessUserMappingOut(
            user_id=user.id,
            full_name=user.full_name,
            username=user.username,
            email=user.email,
            sam_account_name=_primeflow_user_to_sam(user),
            can_approve=_is_file_access_approver(user),
        )
        for user in users
    ]


@router.get("/folders", response_model=list[FileAccessFolderOut])
async def search_folders(
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_user),
) -> list[FileAccessFolderOut]:
    data = await _file_access_request("GET", "/api/folders", params={"search": search, "limit": limit})
    folders = data if isinstance(data, list) else data.get("items", [])
    return [_folder_to_out(folder) for folder in folders]


@router.get("/access", response_model=FileAccessAccessOut)
async def list_current_access(
    folder_id: int | None = None,
    user_id: int | None = None,
    current_user: User = Depends(get_current_user),
) -> FileAccessAccessOut:
    _require_file_access_approver(current_user)
    params = {key: value for key, value in {"folderId": folder_id, "userId": user_id}.items() if value is not None}
    data = await _file_access_request("GET", "/api/access", params=params)
    items = data if isinstance(data, list) else data.get("items", [])
    return FileAccessAccessOut(items=items)


@router.get("/requests", response_model=list[FileAccessRequestOut])
async def list_requests(
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FileAccessRequestOut]:
    stmt = select(FileAccessRequest)
    if not _is_file_access_approver(current_user):
        stmt = stmt.where(FileAccessRequest.requester_user_id == current_user.id)
    if status_filter:
        stmt = stmt.where(FileAccessRequest.status == status_filter)
    requests = (await db.execute(stmt.order_by(FileAccessRequest.created_at.desc()))).scalars().all()
    return [_request_to_out(request) for request in requests]


@router.post("/requests", response_model=FileAccessRequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: FileAccessRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileAccessRequestOut:
    request = FileAccessRequest(
        requester_user_id=current_user.id,
        requester_sam_account_name=_primeflow_user_to_sam(current_user),
        folder_id=payload.folder_id,
        folder_path=payload.folder_path.strip() if payload.folder_path else None,
        folder_name=payload.folder_name.strip(),
        reason=payload.reason.strip() if payload.reason else None,
        status="pending",
    )
    db.add(request)
    await db.flush()
    await db.refresh(request, attribute_names=["requester", "approver"])
    approvers = await _get_approvers(db)
    notifications = [
        add_notification(
            db=db,
            user_id=approver.id,
            type=NotificationType.assignment,
            title="File access request",
            body=f"{current_user.full_name} requested access to {request.folder_name}.",
            data={"href": "/file-access", "request_id": str(request.id)},
        )
        for approver in approvers
    ]
    await db.commit()
    await db.refresh(request)
    for approver, notification in zip(approvers, notifications):
        await publish_notification(user_id=approver.id, notification=notification)
    return _request_to_out(request)


@router.post("/requests/{request_id}/approve", response_model=FileAccessRequestOut)
async def approve_request(
    request_id: uuid.UUID,
    payload: FileAccessDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileAccessRequestOut:
    _require_file_access_approver(current_user)
    request = (await db.execute(select(FileAccessRequest).where(FileAccessRequest.id == request_id))).scalar_one_or_none()
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if request.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is already decided")

    assign_payload: dict[str, Any] = {
        "samAccountName": request.requester_sam_account_name,
        "reason": payload.note or f"Approved PrimeFlow request {request.id}",
    }
    if request.folder_id is not None:
        assign_payload["folderId"] = request.folder_id
    elif request.folder_path:
        assign_payload["folderPath"] = request.folder_path
    await _file_access_request("POST", "/api/access/assign", json=assign_payload)

    request.status = "approved"
    request.approver_user_id = current_user.id
    request.decision_note = payload.note.strip() if payload.note else None
    request.decided_at = datetime.now(timezone.utc)
    requester = request.requester
    notification = add_notification(
        db=db,
        user_id=request.requester_user_id,
        type=NotificationType.assignment,
        title="File access approved",
        body=f"{current_user.full_name} approved access to {request.folder_name}.",
        data={"href": "/file-access", "request_id": str(request.id)},
    )
    await db.commit()
    await db.refresh(request)
    if requester:
        await publish_notification(user_id=requester.id, notification=notification)
    return _request_to_out(request)


@router.post("/requests/{request_id}/reject", response_model=FileAccessRequestOut)
async def reject_request(
    request_id: uuid.UUID,
    payload: FileAccessDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileAccessRequestOut:
    _require_file_access_approver(current_user)
    request = (await db.execute(select(FileAccessRequest).where(FileAccessRequest.id == request_id))).scalar_one_or_none()
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if request.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is already decided")

    request.status = "rejected"
    request.approver_user_id = current_user.id
    request.decision_note = payload.note.strip() if payload.note else None
    request.decided_at = datetime.now(timezone.utc)
    requester = request.requester
    notification = add_notification(
        db=db,
        user_id=request.requester_user_id,
        type=NotificationType.assignment,
        title="File access rejected",
        body=f"{current_user.full_name} rejected access to {request.folder_name}.",
        data={"href": "/file-access", "request_id": str(request.id)},
    )
    await db.commit()
    await db.refresh(request)
    if requester:
        await publish_notification(user_id=requester.id, notification=notification)
    return _request_to_out(request)


@router.post("/access/remove")
async def remove_access(
    payload: FileAccessRemove,
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    _require_file_access_approver(current_user)
    remove_payload: dict[str, Any] = {"samAccountName": payload.sam_account_name}
    if payload.folder_id is not None:
        remove_payload["folderId"] = payload.folder_id
    elif payload.folder_path:
        remove_payload["folderPath"] = payload.folder_path
    await _file_access_request("POST", "/api/access/remove", json=remove_payload)
    return {"status": "ok"}
