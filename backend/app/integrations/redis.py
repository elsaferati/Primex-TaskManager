from __future__ import annotations

from functools import lru_cache

import redis
from redis.asyncio import Redis as AsyncRedis

from app.config import settings


@lru_cache
def get_redis_sync() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def create_redis_async() -> AsyncRedis:
    return AsyncRedis.from_url(settings.REDIS_URL, decode_responses=True)
