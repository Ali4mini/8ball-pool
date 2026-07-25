import asyncio
import json
import logging
from typing import Dict, Optional
from redis.asyncio import Redis
from app.redis_client import get_redis

logger = logging.getLogger(__name__)

class RoomManager:
    def __init__(self):
        self.redis: Optional[Redis] = None
        self.queues: Dict[str, Dict[str, asyncio.Queue]] = {}
        self.pubsub_tasks: Dict[str, asyncio.Task] = {}

    async def _get_redis(self) -> Redis:
        if self.redis is None:
            self.redis = await get_redis()
        return self.redis

    async def _start_pubsub_listener(self, room_id: str):
        redis = await self._get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"room:{room_id}")

        async def listener():
            try:
                async for message in pubsub.listen():
                    if message['type'] == 'message':
                        data = json.loads(message['data'])
                        if room_id in self.queues:
                            for q in self.queues[room_id].values():
                                await q.put(data)
            except asyncio.CancelledError:
                pass
            finally:
                await pubsub.unsubscribe(f"room:{room_id}")
                await pubsub.close()

        task = asyncio.create_task(listener())
        self.pubsub_tasks[room_id] = task

    async def connect(self, room_id: str, player_id: str) -> asyncio.Queue:
        await self._get_redis()
        if room_id not in self.queues:
            self.queues[room_id] = {}
            await self._start_pubsub_listener(room_id)
        q = asyncio.Queue()
        self.queues[room_id][player_id] = q
        logger.info(f"Player {player_id} connected to room {room_id}")
        return q

    async def disconnect(self, room_id: str, player_id: str):
        if room_id in self.queues:
            self.queues[room_id].pop(player_id, None)
            if not self.queues[room_id]:
                if room_id in self.pubsub_tasks:
                    self.pubsub_tasks[room_id].cancel()
                    del self.pubsub_tasks[room_id]
                del self.queues[room_id]
                logger.info(f"Room {room_id} is now empty, listener stopped.")
        logger.info(f"Player {player_id} disconnected from room {room_id}")

    async def broadcast(self, room_id: str, message: dict):
        redis = await self._get_redis()
        await redis.publish(f"room:{room_id}", json.dumps(message))

room_manager = RoomManager()
