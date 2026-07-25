/**
 * Lightweight 8-ball rules for local/debug mode.
 * Mirrors the server's GameService.apply_rules for game-over detection only.
 * Multiplayer mode uses the authoritative server rules engine.
 */

export type Group = 'solids' | 'stripes' | null;

export interface ShotEval {
  gameOver: boolean;
  winner: number | null;   // 1 or 2
  reason: string;
  player1Group: Group;
  player2Group: Group;
  groupsJustAssigned: boolean;
}

/**
 * Evaluate a shot for game-over conditions.
 * Caller provides ownRemaining (balls of shooter's group still on table).
 * Does NOT handle fouls or turn switching — those are visual/UI concerns.
 */
export function evaluateShot(
  pocketed: number[],
  cuePocketed: boolean,
  currentPlayer: number,
  ownRemaining: number,
  player1Group: Group,
  player2Group: Group,
): ShotEval {
  const result: ShotEval = {
    gameOver: false,
    winner: null,
    reason: '',
    player1Group,
    player2Group,
    groupsJustAssigned: false,
  };

  const legalPockets = pocketed.filter(b => b !== 0 && b !== 8);
  const eightBallPocketed = pocketed.includes(8);
  const opponent = currentPlayer === 1 ? 2 : 1;

  let currentGroup: Group = currentPlayer === 1 ? player1Group : player2Group;

  // Auto-assign groups if first pocket after break
  if (currentGroup === null && legalPockets.length > 0) {
    const firstBall = legalPockets[0];
    currentGroup = (firstBall >= 1 && firstBall <= 7) ? 'solids' : 'stripes';
    if (currentPlayer === 1) {
      result.player1Group = currentGroup;
      result.player2Group = currentGroup === 'solids' ? 'stripes' : 'solids';
    } else {
      result.player2Group = currentGroup;
      result.player1Group = currentGroup === 'solids' ? 'stripes' : 'solids';
    }
    result.groupsJustAssigned = true;
  }

  // 8-ball pocketed scenarios
  if (eightBallPocketed) {
    if (currentGroup === null) {
      // 8-ball on open table = loss
      result.gameOver = true;
      result.winner = opponent;
      result.reason = 'early_8_ball';
    } else if (ownRemaining <= 0) {
      if (cuePocketed) {
        result.gameOver = true;
        result.winner = opponent;
        result.reason = 'scratch_on_8_ball';
      } else {
        result.gameOver = true;
        result.winner = currentPlayer;
        result.reason = 'pocketed_8_ball';
      }
    } else {
      result.gameOver = true;
      result.winner = opponent;
      result.reason = 'early_8_ball';
    }
  }

  return result;
}
