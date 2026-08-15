/**
 * Trajectory record/replay helpers.
 *
 * The shooter records compact position-only frames while its local physics
 * simulation runs, then transfers them in chunks. The viewer never renders
 * anything until the full trajectory has arrived, so playback is purely
 * local and time-based — no network jitter can reach the animation.
 *
 * Frames are sorted by `t` (ms since shot start). Each ball is `[num, x, y]`.
 */

export type TrajectoryFrame = { t: number; balls: Array<[number, number, number]> };

export interface ReplayedBallState {
  num: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TrajectoryReplayState {
  balls: ReplayedBallState[];
  /** True once `elapsedMs` has reached the final frame. */
  finished: boolean;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Builds a compact frame from a `{ num: [x, y] }` position snapshot.
 * Positions are rounded to 0.1px so serialized payloads stay small.
 */
export function buildTrajectoryFrame(
  tMs: number,
  positions: Record<string, [number, number]>,
): TrajectoryFrame {
  const balls: Array<[number, number, number]> = [];
  Object.entries(positions).forEach(([numStr, [x, y]]) => {
    balls.push([parseInt(numStr, 10), round1(x), round1(y)]);
  });
  return { t: Math.round(tMs), balls };
}

/**
 * Samples a recorded trajectory at `elapsedMs` (ms since the shot started).
 *
 * - Interpolates each ball between the two surrounding frames.
 * - Derives velocity from the position delta so shadow rolling stays correct.
 * - A ball missing from the following frame is held at its last position and
 *   drops out on the next sample (it was pocketed in that segment).
 */
export function sampleTrajectory(
  frames: TrajectoryFrame[],
  elapsedMs: number,
): TrajectoryReplayState {
  if (frames.length === 0) return { balls: [], finished: true };

  if (frames.length === 1) {
    const frame = frames[0];
    return {
      balls: frame.balls.map(([num, x, y]) => ({ num, x, y, vx: 0, vy: 0 })),
      finished: elapsedMs >= frame.t,
    };
  }

  let index = 0;
  while (index + 1 < frames.length && frames[index + 1].t <= elapsedMs) {
    index++;
  }

  const from = frames[index];
  const to = index + 1 < frames.length ? frames[index + 1] : from;
  const finished = index === frames.length - 1;

  const dtMs = to.t - from.t;
  const alpha =
    dtMs > 0 ? Math.min(Math.max((elapsedMs - from.t) / dtMs, 0), 1) : 1;

  const toPositions = new Map(to.balls.map(([num, x, y]) => [num, [x, y]]));

  const balls: ReplayedBallState[] = [];
  for (const [num, x, y] of from.balls) {
    const next = toPositions.get(num);
    if (next) {
      const [tx, ty] = next;
      balls.push({
        num,
        x: x + (tx - x) * alpha,
        y: y + (ty - y) * alpha,
        vx: dtMs > 0 ? ((tx - x) * 1000) / dtMs : 0,
        vy: dtMs > 0 ? ((ty - y) * 1000) / dtMs : 0,
      });
    } else {
      // Pocketed somewhere inside this segment: hold, then drop out next sample.
      balls.push({ num, x, y, vx: 0, vy: 0 });
    }
  }

  return { balls, finished };
}