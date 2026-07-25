import logging
from typing import Optional
import redis.asyncio as redis
from app.config import REDIS_HOST, REDIS_PORT, REDIS_DB

logger = logging.getLogger(__name__)

redis_client: Optional[redis.Redis] = None

async def init_redis() -> redis.Redis:
    global redis_client
    if redis_client is not None:
        return redis_client
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        socket_connect_timeout=2.0,
        socket_timeout=2.0,
        decode_responses=True,
    )
    try:
        await redis_client.ping()
        logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise
    return redis_client

async def get_redis() -> redis.Redis:
    if redis_client is None:
        return await init_redis()
    return redis_client

async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None
