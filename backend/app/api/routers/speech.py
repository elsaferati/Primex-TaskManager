from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
import httpx

from app.api.deps import get_current_user
from app.config import settings


router = APIRouter()


def _parse_allowed_mime() -> set[str] | None:
    if not settings.SPEECH_ALLOWED_MIME:
        return None
    return {item.strip().lower() for item in settings.SPEECH_ALLOWED_MIME.split(",") if item.strip()}


async def _read_upload_with_limit(upload: UploadFile, max_bytes: int) -> bytes:
    size = 0
    chunks: list[bytes] = []
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Max {settings.SPEECH_MAX_FILE_MB}MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    prompt: str | None = Form(None),
    user=Depends(get_current_user),
) -> dict[str, str]:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Speech service not configured")

    if not file:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No audio file provided")

    allowed = _parse_allowed_mime()
    content_type = (file.content_type or "").lower()
    if allowed and content_type not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported audio format")

    max_bytes = settings.SPEECH_MAX_FILE_MB * 1024 * 1024
    try:
        data = await _read_upload_with_limit(file, max_bytes)
    finally:
        await file.close()

    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file")

    filename = file.filename or "audio"
    payload: dict[str, str] = {"model": settings.SPEECH_TRANSCRIBE_MODEL}
    if language:
        payload["language"] = language
    if prompt:
        payload["prompt"] = prompt

    headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers=headers,
                data=payload,
                files={"file": (filename, data, content_type or "application/octet-stream")},
            )
    except httpx.RequestError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription service unreachable")

    if response.status_code >= 400:
        detail = "Transcription failed"
        try:
            body = response.json()
            detail = body.get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    try:
        body = response.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Invalid transcription response")

    text = str(body.get("text", "")).strip()
    return {"text": text}
