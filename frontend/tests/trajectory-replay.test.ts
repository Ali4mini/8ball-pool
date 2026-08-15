import { describe, expect, it } from "vitest";
import {
  buildTrajectoryFrame,
  sampleTrajectory,
  TrajectoryFrame,
} from "../src/utils/trajectory";

describe("buildTrajectoryFrame", () => {
  it("rounds positions to 0.1px and keeps numeric ball numbers", () => {
    const frame = buildTrajectoryFrame(123, {
      "0": [100.05, 200.44],
      "1": [300.19, 400.99],
    });
    expect(frame.t).toBe(123);
    expect(frame.balls).toEqual([
      [0, 100.1, 200.4],
      [1, 300.2, 401.0],
    ]);
  });
});

describe("sampleTrajectory", () => {
  const frames: TrajectoryFrame[] = [
    { t: 0, balls: [[0, 0, 0]] },
    { t: 100, balls: [[0, 100, 0]] },
    { t: 200, balls: [[0, 200, 0]] },
  ];

  it("returns the exact first frame at the start", () => {
    const state = sampleTrajectory(frames, 0);
    expect(state.finished).toBe(false);
    expect(state.balls).toEqual([{ num: 0, x: 0, y: 0, vx: 1000, vy: 0 }]);
  });

  it("interpolates at the midpoint of two frames", () => {
    const state = sampleTrajectory(frames, 50);
    expect(state.balls[0]).toMatchObject({ num: 0, x: 50, y: 0 });
    expect(state.balls[0].vx).toBeCloseTo(1000);
  });

  it("interpolates between any adjacent pair, not just the first", () => {
    const state = sampleTrajectory(frames, 150);
    expect(state.balls[0]).toMatchObject({ num: 0, x: 150, y: 0 });
  });

  it("clamps to the final frame and marks the replay finished", () => {
    const state = sampleTrajectory(frames, 500);
    expect(state.finished).toBe(true);
    expect(state.balls[0]).toMatchObject({ num: 0, x: 200, y: 0 });
    expect(state.balls[0].vx).toBe(0);
  });

  it("marks the replay finished exactly at the last frame timestamp", () => {
    const state = sampleTrajectory(frames, 200);
    expect(state.finished).toBe(true);
    expect(state.balls[0]).toMatchObject({ num: 0, x: 200, y: 0 });
  });

  it("drops balls that vanish from a later frame", () => {
    const vanishing = [
      { t: 0, balls: [[0, 0, 0], [3, 10, 10]] },
      { t: 50, balls: [[0, 50, 0]] },
    ];
    const before = sampleTrajectory(vanishing, 25);
    expect(before.balls.map((b) => b.num)).toEqual([0, 3]);

    const atPocket = sampleTrajectory(vanishing, 50);
    expect(atPocket.balls.map((b) => b.num)).toEqual([0]);
  });

  it("holds a ball that is about to be pocketed instead of teleporting", () => {
    const vanishing = [
      { t: 0, balls: [[0, 0, 0], [3, 10, 10]] },
      { t: 50, balls: [[0, 50, 0]] },
    ];
    const held = sampleTrajectory(vanishing, 25).balls.find(
      (b) => b.num === 3,
    )!;
    expect(held).toMatchObject({ num: 3, x: 10, y: 10 });
    expect(held.vx).toBe(0);
  });

  it("handles a single-frame trajectory (finishes immediately)", () => {
    const single = [{ t: 0, balls: [[0, 42, 24]] }];
    const state = sampleTrajectory(single, 0);
    expect(state.finished).toBe(true);
    expect(state.balls[0]).toMatchObject({ num: 0, x: 42, y: 24 });
    expect(sampleTrajectory(single, 100).finished).toBe(true);
  });

  it("handles an empty trajectory as finished", () => {
    const state = sampleTrajectory([], 0);
    expect(state.finished).toBe(true);
    expect(state.balls).toEqual([]);
  });
});