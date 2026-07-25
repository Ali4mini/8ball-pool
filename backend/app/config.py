import os
from typing import Final

# Redis
REDIS_HOST: Final[str] = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT: Final[int] = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB: Final[int] = int(os.getenv("REDIS_DB", 0))

# Game
SHOT_TIMEOUT: Final[int] = 30  # seconds before auto-pass

# Server
HOST: Final[str] = os.getenv("HOST", "0.0.0.0")
PORT: Final[int] = int(os.getenv("PORT", "8080"))

# CORS
ALLOWED_ORIGINS: Final[list[str]] = ["*"]

# Main Backend callback for coin management
MAIN_BACKEND_URL: Final[str] = os.getenv("MAIN_BACKEND_URL", "")
GAME_CALLBACK_API_KEY: Final[str] = os.getenv("GAME_CALLBACK_API_KEY", "")

# Physics constants (in game units)
BALL_RADIUS = 11
POCKET_RADIUS = 16
CUSHION_WIDTH = 30
