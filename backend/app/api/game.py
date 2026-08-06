import json
import asyncio
import logging
import random
import time
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from app.redis_client import get_redis
from app.managers.room_manager import room_manager
from app.services.game_service import game_service, GameState, CUE_BALL, EIGHT_BALL

logger = logging.getLogger(__name__)
router = APIRouter()

# Active game rooms: room_id -> GameState
active_games: dict[str, GameState] = {}

# WebSocket connections: player_id -> WebSocket
player_connections: dict[str, WebSocket] = {}
room_connections: dict[str, dict[str, WebSocket]] = {}  # room_id -> {player_id -> ws}

# Disconnect grace period tasks: (room_id, player_id) -> asyncio.Task
disconnect_tasks: dict[tuple[str, str], asyncio.Task] = {}

# Track which rooms have had their credit callback sent
credited_rooms: set[str] = set()

# Reconnection timeout in seconds
RECONNECT_TIMEOUT_SEC = 25


async def send_to_player(player_id: str, message: dict):
    """Send a JSON message to a specific player."""
    ws = player_connections.get(player_id)
    if ws:
        try:
            await ws.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send to player {player_id}: {e}")


async def broadcast_to_room(room_id: str, message: dict, exclude: Optional[str] = None):
    """Send a message to all players in a room."""
    if room_id in room_connections:
        for pid, ws in room_connections[room_id].items():
            if pid != exclude:
                if pid not in player_connections:
                    continue
                try:
                    await ws.send_json(message)
                except Exception as e:
                    logger.warning(f"Broadcast to {pid} failed: {e}")


async def send_credit_callback(state: GameState, winner: str, loser: str):
    """Call the main backend to credit the winner's coins."""
    from app.config import MAIN_BACKEND_URL, GAME_CALLBACK_API_KEY
    if not MAIN_BACKEND_URL:
        logger.info(f"Skipping credit callback (MAIN_BACKEND_URL not set) — winner={winner}")
        return
    
    import aiohttp
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "player_id": winner,
                "amount": 0,
                "room_id": state.room_id,
                "win_type": "8ball_win",
                "game_id": "8ball",
            }
            async with session.post(
                f"{MAIN_BACKEND_URL}/api/internal/game-winner",
                json=payload,
                headers={"X-Api-Key": GAME_CALLBACK_API_KEY},
                timeout=10,
            ) as resp:
                result = await resp.json()
                logger.info(f"Credit callback result: {result}")
    except Exception as e:
        logger.error(f"Credit callback failed: {e}")


async def handle_disconnect_grace_period(room_id: str, player_id: str):
    """Waits for player to reconnect within grace period. If expired, finishes game."""
    try:
        logger.info(f"Starting {RECONNECT_TIMEOUT_SEC}s disconnect grace period for player {player_id} in room {room_id}")
        await asyncio.sleep(RECONNECT_TIMEOUT_SEC)

        # Timeout expired — check if game is still active and player is still missing
        state = active_games.get(room_id)
        if state and not state.is_game_over:
            connected_in_room = room_connections.get(room_id, {})
            if player_id not in connected_in_room:
                logger.info(f"Player {player_id} failed to reconnect within timeout. Forfeiting match.")
                state.is_game_over = True
                
                winner_id = state.player2_id if player_id == state.player1_id else state.player1_id
                winner_name = state.player2_name if player_id == state.player1_id else state.player1_name

                await broadcast_to_room(room_id, {
                    "type": "game_over",
                    "winner": winner_id,
                    "winner_name": winner_name,
                    "reason": "opponent_disconnected",
                })

                if room_id not in credited_rooms:
                    credited_rooms.add(room_id)
                    loser = state.opponent_id(1) if winner_id == state.player1_id else state.player1_id
                    await send_credit_callback(state, winner_id, loser)
    except asyncio.CancelledError:
        logger.info(f"Disconnect grace period cancelled for player {player_id} in room {room_id} (player reconnected).")
    finally:
        disconnect_tasks.pop((room_id, player_id), None)


@router.websocket("/ws/game/{room_id}")
async def game_websocket(websocket: WebSocket, room_id: str):
    await websocket.accept()
    redis = await get_redis()
    
    player_id = None
    player_name = None
    player_number = None
    
    try:
        # First message must be join_room
        data = await websocket.receive_json()
        
        if data.get("type") != "join_room":
            await websocket.send_json({"type": "error", "message": "First message must be join_room"})
            await websocket.close()
            return
        
        player_id = data.get("player_id", f"guest_{random.randint(1000, 9999)}")
        player_name = data.get("player_name", player_id)

        # ─── RECONNECTION CHECK ───
        state = active_games.get(room_id)
        is_reconnecting_player = (
            state is not None and 
            not state.is_game_over and 
            (player_id == state.player1_id or player_id == state.player2_id)
        )

        if is_reconnecting_player:
            player_number = 1 if player_id == state.player1_id else 2

            # Cancel disconnect grace period task
            task_key = (room_id, player_id)
            if task_key in disconnect_tasks:
                disconnect_tasks[task_key].cancel()
                disconnect_tasks.pop(task_key, None)

            # Re-register WS connection
            player_connections[player_id] = websocket
            if room_id not in room_connections:
                room_connections[room_id] = {}
            room_connections[room_id][player_id] = websocket

            await redis.sadd(f"room:{room_id}:players", player_id)
            await redis.hset(f"room:{room_id}:names", player_id, player_name)

            logger.info(f"Player {player_id} reconnected to active room {room_id}")

            # Send reconnected event with full current state
            p1_grp = "solids" if state.player1_group == 1 else ("stripes" if state.player1_group == 2 else None)
            p2_grp = "solids" if state.player2_group == 1 else ("stripes" if state.player2_group == 2 else None)

            await websocket.send_json({
                "type": "reconnected",
                "player_id": player_id,
                "player_number": player_number,
                "current_player": state.current_player,
                "player1_id": state.player1_id,
                "player1_name": state.player1_name,
                "player2_id": state.player2_id,
                "player2_name": state.player2_name,
                "ball_positions": {str(k): v for k, v in state.balls.items()},
                "player1_group": p1_grp,
                "player2_group": p2_grp,
                "is_my_turn": state.current_player == player_number,
            })

            # Notify opponent that player reconnected
            await broadcast_to_room(room_id, {
                "type": "player_reconnected",
                "player_id": player_id,
                "player_name": player_name,
                "message": "حریف دوباره متصل شد",
            }, exclude=player_id)

        else:
            # ─── NORMAL ROOM JOINING ───
            player_count = await redis.scard(f"room:{room_id}:players")
            room_exists = player_count > 0

            if room_exists and room_id not in room_connections:
                await redis.delete(f"room:{room_id}:players")
                await redis.delete(f"room:{room_id}:names")
                active_games.pop(room_id, None)
                room_exists = False
                player_count = 0

            if player_count >= 2:
                await websocket.send_json({"type": "error", "message": "این اتاق پر است"})
                await websocket.close()
                return

            if not room_exists:
                await redis.sadd(f"room:{room_id}:players", player_id)
                await redis.hset(f"room:{room_id}:names", player_id, player_name)
                await redis.expire(f"room:{room_id}:players", 300)
                await redis.expire(f"room:{room_id}:names", 300)
                player_number = 1
                
                player_connections[player_id] = websocket
                room_connections[room_id] = {player_id: websocket}
                await room_manager.connect(room_id, player_id)
                
                await websocket.send_json({
                    "type": "room_joined",
                    "player_id": player_id,
                    "player_number": 1,
                    "is_first": True,
                })
                
                await websocket.send_json({
                    "type": "waiting_for_opponent",
                    "message": "Waiting for opponent to connect...",
                })
            else:
                player_number = 2

                await redis.sadd(f"room:{room_id}:players", player_id)
                await redis.hset(f"room:{room_id}:names", player_id, player_name)
                await redis.expire(f"room:{room_id}:players", 300)
                await redis.expire(f"room:{room_id}:names", 300)
                
                player_connections[player_id] = websocket
                room_connections[room_id][player_id] = websocket
                await room_manager.connect(room_id, player_id)
                
                p1_id = None
                p1_name = None
                members = await redis.smembers(f"room:{room_id}:players")
                for mid in members:
                    if mid != player_id:
                        p1_id = mid
                        p1_name = await redis.hget(f"room:{room_id}:names", mid) or mid
                
                await websocket.send_json({
                    "type": "room_joined",
                    "player_id": player_id,
                    "player_number": 2,
                    "is_first": False,
                    "opponent_name": p1_name,
                })
                
                await broadcast_to_room(room_id, {
                    "type": "opponent_joined",
                    "opponent_id": player_id,
                    "opponent_name": player_name,
                }, exclude=player_id)
                
                state = game_service.create_initial_state(
                    room_id=room_id,
                    p1_id=p1_id,
                    p2_id=player_id,
                    p1_name=p1_name or "Player 1",
                    p2_name=player_name,
                )
                active_games[room_id] = state
                
                await broadcast_to_room(room_id, {
                    "type": "game_start",
                    "player1_id": p1_id,
                    "player1_name": p1_name,
                    "player2_id": player_id,
                    "player2_name": player_name,
                    "break_player": 1,
                    "ball_positions": {str(k): v for k, v in state.balls.items()},
                })
                
                await broadcast_to_room(room_id, {
                    "type": "your_turn",
                    "player": 1,
                    "player_id": p1_id,
                    "message": "Break!",
                })

        # ─── MAIN MESSAGE LOOP ───
        async def process_shot(shot_data: dict):
            state = active_games.get(room_id)
            if not state or state.is_game_over:
                await websocket.send_json({"type": "error", "message": "Game not active"})
                return

            if state.current_player != player_number:
                await websocket.send_json({"type": "error", "message": "Not your turn"})
                return

            angle_deg = shot_data.get("angle_deg", 0)
            power = shot_data.get("power", 5)
            pocketed = shot_data.get("pocketed", [])
            cue_pocketed = shot_data.get("cue_pocketed", False)
            first_contact = shot_data.get("first_contact")
            cushion_hits = shot_data.get("cushion_hits")

            if shot_data.get("ball_positions"):
                state.balls = {int(k): v for k, v in shot_data["ball_positions"].items()}

            for b in pocketed:
                if b in state.balls:
                    del state.balls[b]

            if cue_pocketed:
                state.balls[CUE_BALL] = (380.0, 380.0)

            result = game_service.apply_rules(state, pocketed, cue_pocketed, first_contact, cushion_hits)
            state = result["new_state"]
            active_games[room_id] = state

            events = result.get("events", [])

            # Broadcast generated events (such as groups_assigned)
            for evt in events:
                if evt.get("type") == "groups_assigned":
                    await broadcast_to_room(room_id, evt)

            shot_event = next((e for e in events if e.get("type") == "shot_complete"), events[-1] if events else {})

            p1_grp = "solids" if state.player1_group == 1 else ("stripes" if state.player1_group == 2 else None)
            p2_grp = "solids" if state.player2_group == 1 else ("stripes" if state.player2_group == 2 else None)

            await broadcast_to_room(room_id, {
                "type": "shot_result",
                "player": player_number,
                "player_name": player_name,
                "angle_deg": angle_deg,
                "power": power,
                "pocketed": pocketed,
                "cue_pocketed": cue_pocketed,
                "foul": shot_event.get("foul", False),
                "foul_reason": shot_event.get("foul_reason", ""),
                "ball_positions": {str(k): v for k, v in state.balls.items()},
                "player1_group": p1_grp,
                "player2_group": p2_grp,
                "switch_turn": shot_event.get("switch_turn", False),
                "current_player": state.current_player,
                "turn_count": state.turn_count,
                "ball_in_hand": shot_event.get("ball_in_hand", False),
            })

            if result["game_over"]:
                winner_id = result["winner"]
                await asyncio.sleep(1.5)
                await broadcast_to_room(room_id, {
                    "type": "game_over",
                    "winner": winner_id,
                    "winner_name": state.player_name_for_number(1) if state.player_id_for_number(1) == winner_id else state.player_name_for_number(2),
                    "reason": shot_event.get("foul_reason", "pocketed_8_ball"),
                })

                if room_id not in credited_rooms:
                    credited_rooms.add(room_id)
                    loser = state.opponent_id(1) if winner_id == state.player1_id else state.player1_id
                    await send_credit_callback(state, winner_id, loser)
                return

            next_player = state.current_player
            next_pid = state.player1_id if next_player == 1 else state.player2_id
            other_pid = state.opponent_id(next_player)
            await send_to_player(next_pid, {
                "type": "your_turn",
                "player": next_player,
                "player_id": next_pid,
                "player_name": state.player_name_for_number(next_player),
            })
            await send_to_player(other_pid, {
                "type": "opponent_turn",
                "player": next_player,
                "player_id": next_pid,
                "player_name": state.player_name_for_number(next_player),
            })

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "shoot":
                await process_shot(data)
            elif msg_type == "aim_update":
                # Forward live aiming angle/power to opponent
                state = active_games.get(room_id)
                if state and not state.is_game_over and state.current_player == player_number:
                    await broadcast_to_room(room_id, {
                        "type": "aim_update",
                        "player": player_number,
                        "angle_deg": data.get("angle_deg", 0),
                        "power": data.get("power", 0),
                    }, exclude=player_id)
            elif msg_type == "shot_init":
                state = active_games.get(room_id)
                if state and not state.is_game_over and state.current_player == player_number:
                    await broadcast_to_room(room_id, {
                        "type": "shot_init",
                        "player": player_number,
                        "angle_deg": data.get("angle_deg", 0),
                        "power": data.get("power", 0),
                        "cue_ball_position": data.get("cue_ball_position"),
                        "ball_positions": data.get("ball_positions"),
                    }, exclude=player_id)
            elif msg_type == "shot_sync":
                state = active_games.get(room_id)
                if state and not state.is_game_over and state.current_player == player_number:
                    await broadcast_to_room(room_id, {
                        "type": "shot_sync",
                        "player": player_number,
                        "balls": data.get("balls"),
                    }, exclude=player_id)
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"Player {player_id} disconnected from room {room_id}")
    except Exception as e:
        logger.error(f"WebSocket error in room {room_id}, player {player_id}: {e}")
    finally:
        if player_id:
            player_connections.pop(player_id, None)
            if room_id in room_connections:
                room_connections[room_id].pop(player_id, None)

            state = active_games.get(room_id)
            if state and not state.is_game_over:
                # Notify opponent of disconnection
                await broadcast_to_room(room_id, {
                    "type": "player_disconnected",
                    "player_id": player_id,
                    "timeout": RECONNECT_TIMEOUT_SEC,
                    "message": f"حریف قطع شد. {RECONNECT_TIMEOUT_SEC} ثانیه مهلت برای اتصال مجدد...",
                }, exclude=player_id)

                # Start grace period task
                task_key = (room_id, player_id)
                if task_key not in disconnect_tasks:
                    disconnect_tasks[task_key] = asyncio.create_task(
                        handle_disconnect_grace_period(room_id, player_id)
                    )

            if redis:
                await redis.srem(f"room:{room_id}:players", player_id)
                remaining = await redis.scard(f"room:{room_id}:players")
                if remaining == 0 and (not state or state.is_game_over):
                    await redis.delete(f"room:{room_id}:players")
                    await redis.delete(f"room:{room_id}:names")
                    active_games.pop(room_id, None)
                    credited_rooms.discard(room_id)


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/game/{room_id}/end")
async def force_end_game(room_id: str):
    """Admin endpoint to force-end a game."""
    state = active_games.get(room_id)
    if state:
        state.is_game_over = True
        await broadcast_to_room(room_id, {
            "type": "game_over",
            "winner": "",
            "winner_name": "Game ended",
            "reason": "admin_force_end",
        })
        return {"status": "ended"}
    return {"status": "not_found"}
