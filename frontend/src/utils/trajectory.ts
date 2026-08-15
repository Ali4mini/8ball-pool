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

// ═══════════════════════════════════════════════════════════
//  Aim recording / replay
// ═══════════════════════════════════════════════════════════

/** One recorded aim sample. `a` is angle in degrees, `p` is power (0..1). */
export type AimSample = { t: number; a: number; p: number };

export interface AimReplayState {
  angleDeg: number;
  power: number;
  /** True once `elapsedMs` has reached the final sample. */
  finished: boolean;
}

const wrapAngleDeg = (delta: number): number => {
  let wrapped = delta % 360;
  if (wrapped > 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return Math.abs(wrapped) < 1e-9 ? 0 : wrapped;
};

const normalizeDeg = (angle: number): number => ((angle % 360) + 360) % 360;

/**
 * Samples a recorded aim trajectory at `elapsedMs` (ms since replay start).
 * The angle interpolates along the shortest path across 0°/360°.
 */
export function sampleAim(
  samples: AimSample[],
  elapsedMs: number,
): AimReplayState {
  if (samples.length === 0) {
    return { angleDeg: 0, power: 0, finished: true };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (elapsedMs <= first.t) {
    return { angleDeg: first.a, power: first.p, finished: false };
  }
  if (elapsedMs >= last.t) {
    return { angleDeg: last.a, power: last.p, finished: true };
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const from = samples[i];
    const to = samples[i + 1];
    if (elapsedMs >= from.t && elapsedMs <= to.t) {
      const dt = to.t - from.t;
      const alpha = dt > 0 ? (elapsedMs - from.t) / dt : 0;
      return {
        angleDeg: normalizeDeg(from.a + wrapAngleDeg(to.a - from.a) * alpha),
        power: from.p + (to.p - from.p) * alpha,
        finished: false,
      };
    }
  }

  return { angleDeg: last.a, power: last.p, finished: false };
}