from __future__ import annotations

import asyncio
import json
import logging
import uuid

from app.integrations.redis import create_redis_async
from app.websocket.manager import manager


CHANNEL = "primex_notifications"
logger = logging.getLogger(__name__)


async def start_notification_listener() -> None:
    while True:
        pubsub = None
        client = None
        try:
            client = create_redis_async()
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                raw = message.get("data")
                if not raw:
                    continue
                try:
                    payload = json.loads(raw)
                    user_id = uuid.UUID(payload["user_id"])
                    await manager.send_to_user(user_id, payload["notification"])
                except Exception:
                    logger.exception("Failed to process notification message")
        except asyncio.CancelledError:
            # graceful shutdown: break the loop after cleanup
            break
        except Exception:
            logger.exception("Redis listener failed; retrying soon")
        finally:
            try:
                if pubsub is not None:
                    await pubsub.unsubscribe(CHANNEL)
                    close_result = pubsub.close()
                    if asyncio.iscoroutine(close_result):
                        await close_result
            except Exception:
                pass
            try:
                if client is not None:
                    closer = getattr(client, "aclose", None) or getattr(client, "close", None)
                    if closer is not None:
                        close_result = closer()
                        if asyncio.iscoroutine(close_result):
                            await close_result
            except Exception:
                pass
        await asyncio.sleep(2)

