# Ball Rolling Visual Fix

## Summary

Pool balls now visibly roll based on the distance they actually travel between rendered frames. The change applies consistently to the cue ball, numbered balls, local Matter.js simulation, and recorded remote-shot replay.

## Problem

`BallRenderer.updateShadows()` previously calculated rotation from the current physics speed. Its direction was chosen only from `vx >= 0`, so vertical movement did not have a meaningful direction and diagonal movement could not roll correctly. Rotation was also tied to render-frame timing instead of the distance covered by the ball.

## Implementation

### Displacement-based rotation

Each ball stores its previous rendered position. On every render update:

1. Calculate `dx` and `dy` from the current and previous positions.
2. Calculate travelled distance with `Math.hypot(dx, dy)`.
3. Convert distance to visual rotation using `distance / BALL_RADIUS`.
4. Use the complete movement vector to determine the visual spin direction.

The shared helper is `frontend/src/utils/rolling.ts`. It treats the dominant component of the 2D movement vector as the screen-space rolling direction. This keeps horizontal, vertical, and all diagonal directions visually active while reversing the movement reverses the spin.

### Stationary and repositioned balls

Movement at or below the rolling epsilon produces no rotation. Large position jumps are treated as teleports rather than travelled distance, preventing artificial rotation when a ball is corrected or moved outside the table.

Previous-position state is reset when balls are:

- Created or re-racked
- Pocketed
- Respawned as the cue ball
- Repositioned from an authoritative state
- Entering or leaving remote trajectory playback

### Physics and replay behavior

Matter.js physics parameters were not changed. The renderer still uses the live sprite positions for local physics. Remote replay continues to interpolate recorded positions through `updateRemotePlayback()`, after which `updateShadows()` applies the same displacement-based rolling logic. No second animation path was introduced.

## Files changed

- `frontend/src/rendering/BallRenderer.ts` — tracks rendered positions, applies rolling deltas, and resets state during ball lifecycle transitions.
- `frontend/src/utils/rolling.ts` — contains the testable rolling calculation.
- `frontend/tests/rolling.test.ts` — covers cardinal and diagonal movement, direction reversal, stationary movement, and distance scaling.

## Verification

- `npm test` — 28 tests passed.
- `npm run build` — passed.

## Review checklist

- [x] Balls roll in the direction of travel.
- [x] Horizontal, vertical, and diagonal movement are covered.
- [x] Stationary or nearly stationary balls stop rotating.
- [x] Cue and numbered balls share the same renderer behavior.
- [x] Local physics and remote replay use the same visual update path.
- [x] Matter.js gameplay physics remains unchanged.
- [x] Production build succeeds.
