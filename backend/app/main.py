from __future__ import annotations

import asyncio
import uuid

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.auth.security import ACCESS_TOKEN_TYPE, decode_token, require_token_type
from app.api.routers import api_router
from app.config import settings
from app.websocket.redis_listener import start_notification_listener
from app.websocket.manager import manager


app = FastAPI(title="Primex Nexus", default_response_class=ORJSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(api_router, prefix="/api")

listener_task: asyncio.Task | None = None

@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.on_event("startup")
async def _startup() -> None:
    global listener_task
    if settings.REDIS_ENABLED:
        listener_task = asyncio.create_task(start_notification_listener())


@app.on_event("shutdown")
async def _shutdown() -> None:
    global listener_task
    if listener_task is not None:
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass
        listener_task = None


@app.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str = Query(...)) -> None:
    try:
        payload = decode_token(token)
        require_token_type(payload, ACCESS_TOKEN_TYPE)
        user_id = uuid.UUID(str(payload.get("sub")))
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)

