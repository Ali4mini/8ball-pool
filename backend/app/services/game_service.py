"""
8-Ball Pool Game Service

Core game state management and rules engine.
Ball positions use a coordinate system where:
  - Origin (0,0) is top-left of the game world (including the margin around the table)
  - X axis: left to right
  - Y axis: top to bottom
  - World size: 1360 x 820
  - Table size: 1200 x 660
  - Play area (cloth): 1120 x 600, offset by (120, 120)
"""
import math
import random
import logging
from typing import Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

# Ball types
CUE_BALL = 0
SOLIDS = [1, 2, 3, 4, 5, 6, 7]
STRIPES = [9, 10, 11, 12, 13, 14, 15]
EIGHT_BALL = 8

# World/table/play area constants
WORLD_W = 960
WORLD_H = 580
TABLE_W = WORLD_W - 32  # 928
TABLE_H = WORLD_H - 32  # 548
TABLE_X = 16
TABLE_Y = 16
CUSHION_W = 30
PLAY_L = TABLE_X + CUSHION_W     # 46
PLAY_T = TABLE_Y + CUSHION_W     # 46
PLAY_R = TABLE_X + TABLE_W - CUSHION_W  # 914
PLAY_B = TABLE_Y + TABLE_H - CUSHION_W  # 534
PLAY_W = PLAY_R - PLAY_L         # 868
PLAY_H = PLAY_B - PLAY_T         # 488
HEAD_SPOT = (PLAY_L + 151.0, (PLAY_T + PLAY_B) / 2.0)   # (197, 290)
FOOT_SPOT = (PLAY_R - 151.0, (PLAY_T + PLAY_B) / 2.0)   # (763, 290)

# Starting ball positions (triangle rack) — shifted to sit inside the play area
# Apex at ~72% of play width, rows spread by sqrt(3)*R spacing
BALL_RADIUS = 11
BALL_DIAM = BALL_RADIUS * 2
ROW_SPACING_X = (3 ** 0.5) * BALL_RADIUS + 0.25  # ~19.30
ROW_SPACING_Y = BALL_DIAM + 0.3                   # ~22.30
RACK_APEX_X = PLAY_L + 630
RACK_CENTER_Y = (PLAY_T + PLAY_B) / 2

RACK_POSITIONS: dict[int, tuple[float, float]] = {}
# Cue ball
RACK_POSITIONS[0] = HEAD_SPOT

# Rows: each row i has i+1 balls, offset from apex
rack_rows = [
    [1],           # row 0: apex
    [11, 2],       # row 1
    [3, 10, 15],   # row 2
    [4, 8, 14, 7], # row 3 — 8-ball center
    [5, 12, 9, 13, 6],  # row 4
]

# Clear placeholder and build from rows
RACK_POSITIONS.clear()

for row_idx, ball_nums in enumerate(rack_rows):
    row_x = RACK_APEX_X + row_idx * ROW_SPACING_X
    for col_idx, ball_num in enumerate(ball_nums):
        y_off = col_idx * ROW_SPACING_Y - row_idx * BALL_RADIUS
        pos = (row_x, RACK_CENTER_Y + y_off)
        RACK_POSITIONS[ball_num] = pos

# Cue ball on head spot (overwrite)
RACK_POSITIONS[0] = HEAD_SPOT


class InvalidRackError(Exception):
    """Raised when a rack cannot be constructed correctly."""


def shuffle_rack() -> dict:
    """Create a random valid rack arrangement.
    Returns dict of ball_number -> (x, y)"""
    # The rack pattern positions
    rows = [
        [1],                # apex
        [11, 2],            # row 2
        [3, 10, 15],        # row 3
        [4, 8, 14, 7],      # row 4 - 8-ball in middle
        [5, 12, 9, 13, 6],  # row 5
    ]

    # The apex ball can be any solid
    apex_solid = random.choice(SOLIDS)
    all_solids = [s for s in SOLIDS if s != apex_solid]
    random.shuffle(all_solids)
    all_stripes = list(STRIPES)
    random.shuffle(all_stripes)

    # Build the rack: 8-ball in center (row 3, position 2 = index 1)
    positions = [0] * 15  # indexed by position in rack (0-14)

    # Row 1 (pos 0): apex_solid
    positions[0] = apex_solid

    # Row 2 (pos 1-2): one solid, one stripe
    positions[1] = all_solids.pop()
    positions[2] = all_stripes.pop()

    # Row 3 (pos 3-5): solid, 8-ball, stripe
    positions[3] = all_solids.pop()
    positions[4] = EIGHT_BALL
    positions[5] = all_stripes.pop()

    # Row 4 (pos 6-9): fill with remaining
    pool = all_solids + all_stripes
    random.shuffle(pool)
    for i in range(6, 10):
        positions[i] = pool.pop()

    # Row 5 (pos 10-14): fill with remaining
    for i in range(10, 15):
        positions[i] = pool.pop()

    # Rack keys in the insertion order of RACK_POSITIONS (excluding cue ball placeholder 0).
    # Python preserves dict insertion order, and the dict is laid out in the intended rack order.
    rack_keys = [k for k in RACK_POSITIONS.keys() if k != 0]

    if len(rack_keys) != 15:
        raise InvalidRackError("RACK_POSITIONS must contain exactly 15 object-ball keys")

    result: dict[int, tuple[float, float]] = {}
    for i, ball_num in enumerate(rack_keys):
        result[positions[i]] = RACK_POSITIONS[ball_num]

    # Cue ball on head spot
    result[0] = HEAD_SPOT

    return result


@dataclass
class GameState:
    room_id: str
    balls: dict[int, tuple[float, float]]  # ball_number -> (x, y)
    player1_id: str = ""
    player2_id: str = ""
    player1_name: str = ""
    player2_name: str = ""
    current_player: int = 0  # 1 or 2 (player number, not ID)
    player1_group: Optional[int] = None  # 1=solids, 2=stripes
    player2_group: Optional[int] = None
    is_break: bool = True
    is_game_over: bool = False
    winner: Optional[str] = None
    foul: bool = False
    pocketed: list[int] = field(default_factory=list)
    turn_count: int = 0

    def to_dict(self) -> dict:
        d = asdict(self)
        d['balls'] = {str(k): v for k, v in self.balls.items()}  # JSON needs string keys
        return d

    def player_id_for_number(self, num: int) -> str:
        return self.player1_id if num == 1 else self.player2_id

    def player_name_for_number(self, num: int) -> str:
        return self.player1_name if num == 1 else self.player2_name

    def opponent_id(self, player_num: int) -> str:
        return self.player2_id if player_num == 1 else self.player1_id

    def group_for_player(self, player_num: int) -> Optional[int]:
        return self.player1_group if player_num == 1 else self.player2_group


class GameService:
    """Server-side game logic. Note: physics simulation is done client-side.
    The server validates moves and manages game rules/state."""

    @staticmethod
    def calculate_break_power() -> tuple[float, float]:
        """Generate a break shot: moderate angle randomness, full power"""
        angle = math.radians(random.uniform(-5, 5))  # slight randomness
        power = 18.5  # near max power for break
        dx = math.cos(angle) * power
        dy = math.sin(angle) * power
        return (dx, dy)

    @staticmethod
    def estimate_shot_outcome(
        balls: dict[int, tuple[float, float]],
        angle_deg: float,
        power: float
    ) -> dict:
        """Simplified shot simulation to determine pocketed balls and fouls.

        The real physics simulation happens client-side in Phaser/Matter.js.
        """
        # For now, return a simple result
        # In a full implementation, we'd trace the cue ball path and
        # compute collisions using basic math
        return {
            "pocketed": [],
            "foul": False,
            "cue_ball_pocketed": False,
            "balls": balls,  # unchanged (simplified)
        }

    @staticmethod
    def determine_group(ball_number: int) -> int:
        if ball_number in SOLIDS:
            return 1  # solids group
        elif ball_number in STRIPES:
            return 2  # stripes group
        return 0

    @staticmethod
    def is_valid_shot(state: GameState, shot: dict) -> tuple[bool, str]:
        """Basic validation that the shot is legal."""
        if state.is_game_over:
            return False, "Game is already over"

        # Check ball positions
        cue_pos = state.balls.get(0)
        if not cue_pos:
            return False, "Cue ball not on table"

        return True, ""

    @staticmethod
    def _remaining_group_balls(state: GameState, player_num: int) -> list[int]:
        group = state.group_for_player(player_num)
        if group is None:
            return []
        remaining = []
        for bnum in state.balls.keys():
            if bnum == CUE_BALL or bnum == EIGHT_BALL:
                continue
            if GameService.determine_group(bnum) == group:
                remaining.append(bnum)
        return remaining

    @staticmethod
    def _is_group_cleared(state: GameState, player_num: int) -> bool:
        return len(GameService._remaining_group_balls(state, player_num)) == 0

    @staticmethod
    def apply_rules(
        state: GameState,
        pocketed: list[int],
        cue_pocketed: bool,
        first_contact: Optional[int],
        cushion_hits: Optional[int] = None,
    ) -> dict:
        """Apply 8-ball rules and return the updated state + events.

        Returns: dict with keys:
          - new_state: GameState
          - events: list of event dicts to broadcast
          - game_over: bool
          - winner: Optional[str]
        """
        events = []
        is_foul = False
        foul_reason = ""
        opponent = 2 if state.current_player == 1 else 1

        current_group = state.group_for_player(state.current_player)
        opponent_group = state.group_for_player(opponent)

        legal_pockets = [b for b in pocketed if b != CUE_BALL and b != EIGHT_BALL]
        eight_ball_pocketed = EIGHT_BALL in pocketed

        # --- Handle break shot ---
        was_break = state.is_break
        if was_break:
            state.is_break = False
            # Illegal break: no ball pocketed and fewer than 4 cushion hits.
            # If client does not report cushion hits, we skip this check.
            if not legal_pockets and (cushion_hits is not None and cushion_hits < 4):
                is_foul = True
                foul_reason = "illegal_break"

            # 8-ball pocketed on break: spot it and give opponent ball-in-hand.
            if eight_ball_pocketed:
                state.balls[EIGHT_BALL] = FOOT_SPOT
                eight_ball_pocketed = False  # no longer counts as pocketed
                if not is_foul:
                    is_foul = True
                    foul_reason = "eight_ball_on_break"

        # --- Validate first contact ---
        if first_contact is not None:
            contact_group = GameService.determine_group(first_contact)
            if current_group is not None:
                # Shooting at 8-ball only allowed after clearing own group.
                if GameService._is_group_cleared(state, state.current_player):
                    if first_contact != EIGHT_BALL:
                        is_foul = True
                        foul_reason = "wrong_first_contact"
                else:
                    # Normal shot: must hit own group first.
                    if contact_group != current_group:
                        is_foul = True
                        foul_reason = "wrong_first_contact"
            else:
                # Open table: first contact must be a solid or stripe (not 8-ball).
                if contact_group == 0:
                    is_foul = True
                    foul_reason = "wrong_first_contact"
        else:
            # No contact at all is a foul (unless break with cushion data overrides — not implemented).
            # Skip if balls were pocketed — client physics may miss collision event at high speed,
            # but pocketing a ball proves contact was made.
            if not was_break and not legal_pockets:
                is_foul = True
                foul_reason = "no_contact"

        # --- Assign groups on first legal pocket after break ---
        if current_group is None and opponent_group is None and not was_break:
            if legal_pockets:
                first_ball = legal_pockets[0]
                group = GameService.determine_group(first_ball)
                if state.current_player == 1:
                    state.player1_group = group
                    state.player2_group = 2 if group == 1 else 1
                else:
                    state.player2_group = group
                    state.player1_group = 2 if group == 1 else 1
                events.append({
                    "type": "groups_assigned",
                    "player1_group": "solids" if state.player1_group == 1 else "stripes",
                    "player2_group": "solids" if state.player2_group == 1 else "stripes",
                })
                # Re-read groups after assignment
                current_group = state.group_for_player(state.current_player)
                opponent_group = state.group_for_player(opponent)

        # --- Cue ball pocketed (scratch) ---
        if cue_pocketed:
            is_foul = True
            foul_reason = "scratch"

        # --- Process pocketed object balls ---
        correct_pockets: list[int] = []
        for b in pocketed:
            if b == CUE_BALL:
                continue
            if b == EIGHT_BALL:
                continue  # handled below
            group = GameService.determine_group(b)
            if current_group is not None:
                if group == current_group:
                    correct_pockets.append(b)
                else:
                    # Pocketed opponent's ball
                    is_foul = True
                    if foul_reason == "":
                        foul_reason = "opponent_ball"
            else:
                # Open table: any legal pocket is fine
                correct_pockets.append(b)

        # --- No rail / no pocket rule ---
        # If no own-group ball pocketed and (when available) no cushion hit after contact,
        # treat it as a foul.  We only enforce this when the client reports cushion hits.
        if not is_foul and not correct_pockets:
            if cushion_hits is not None and cushion_hits == 0:
                is_foul = True
                foul_reason = "no_rail"

        # --- Handle 8-ball ---
        if eight_ball_pocketed:
            if current_group is None:
                # 8-ball pocketed on an open non-break shot = instant loss.
                state.is_game_over = True
                state.winner = state.opponent_id(state.current_player)
                events.append({
                    "type": "game_over",
                    "winner": state.winner,
                    "winner_name": state.player_name_for_number(opponent),
                    "reason": "early_8_ball",
                })
                return {
                    "new_state": state,
                    "events": events,
                    "game_over": True,
                    "winner": state.winner,
                }

            if GameService._is_group_cleared(state, state.current_player):
                if cue_pocketed:
                    # Pocketed 8-ball but also scratched = loss
                    state.is_game_over = True
                    state.winner = state.opponent_id(state.current_player)
                    events.append({
                        "type": "game_over",
                        "winner": state.winner,
                        "winner_name": state.player_name_for_number(opponent),
                        "reason": "scratch_on_8_ball",
                    })
                    return {
                        "new_state": state,
                        "events": events,
                        "game_over": True,
                        "winner": state.winner,
                    }
                # Legal win
                state.is_game_over = True
                state.winner = state.player_id_for_number(state.current_player)
                events.append({
                    "type": "game_over",
                    "winner": state.winner,
                    "winner_name": state.player_name_for_number(state.current_player),
                    "reason": "pocketed_8_ball",
                })
                return {
                    "new_state": state,
                    "events": events,
                    "game_over": True,
                    "winner": state.winner,
                }
            else:
                # Early 8-ball = loss
                state.is_game_over = True
                state.winner = state.opponent_id(state.current_player)
                events.append({
                    "type": "game_over",
                    "winner": state.winner,
                    "winner_name": state.player_name_for_number(opponent),
                    "reason": "early_8_ball",
                })
                return {
                    "new_state": state,
                    "events": events,
                    "game_over": True,
                    "winner": state.winner,
                }

        # --- Cue ball respawn after scratch ---
        ball_in_hand = False
        if cue_pocketed:
            state.balls[CUE_BALL] = HEAD_SPOT
            ball_in_hand = True

        # --- Determine next turn ---
        # Continue if not fouled and pocketed at least one correct ball.
        turn_switches = is_foul or not bool(correct_pockets)

        if turn_switches:
            state.current_player = opponent
            state.turn_count += 1
            if is_foul:
                ball_in_hand = True

        events.append({
            "type": "shot_complete",
            "pocketed": pocketed,
            "foul": is_foul,
            "foul_reason": foul_reason,
            "cue_pocketed": cue_pocketed,
            "current_player": state.current_player,
            "player_name": state.player_name_for_number(state.current_player),
            "switch_turn": turn_switches,
            "ball_in_hand": ball_in_hand,
        })

        return {
            "new_state": state,
            "events": events,
            "game_over": False,
            "winner": None,
        }

    @staticmethod
    def create_initial_state(
        room_id: str,
        p1_id: str,
        p2_id: str,
        p1_name: str = "Player 1",
        p2_name: str = "Player 2",
    ) -> GameState:
        balls = shuffle_rack()
        return GameState(
            room_id=room_id,
            balls=balls,
            player1_id=p1_id,
            player2_id=p2_id,
            player1_name=p1_name,
            player2_name=p2_name,
            current_player=1,
            is_break=True,
            turn_count=0,
        )


game_service = GameService()
