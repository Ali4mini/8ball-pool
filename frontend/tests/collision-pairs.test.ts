import { describe, expect, it } from "vitest";
import {
  addUniqueNumbers,
  getCollisionPairs,
} from "../src/utils/collisionPairs";

describe("collision pair processing", () => {
  it("returns every pair from a Matter collision event", () => {
    const first = { label: "ball_1" };
    const second = { label: "pocket" };
    const third = { label: "ball_2" };
    const fourth = { label: "pocket" };

    expect(
      getCollisionPairs(
        { pairs: [
          { bodyA: first, bodyB: second },
          { bodyA: third, bodyB: fourth },
        ] },
        { label: "ignored" },
        { label: "ignored" },
      ),
    ).toEqual([
      { bodyA: first, bodyB: second },
      { bodyA: third, bodyB: fourth },
    ]);
  });

  it("keeps the legacy callback pair when event.pairs is unavailable", () => {
    const bodyA = { label: "ball_1" };
    const bodyB = { label: "pocket" };
    expect(getCollisionPairs({}, bodyA, bodyB)).toEqual([{ bodyA, bodyB }]);
  });
});

describe("pocketed-ball bookkeeping", () => {
  it("records duplicate notifications only once", () => {
    const pocketed: number[] = [];
    addUniqueNumbers(pocketed, [3, 3, 8]);
    addUniqueNumbers(pocketed, [8, 3, 11]);
    expect(pocketed).toEqual([3, 8, 11]);
  });

  it("keeps the same unique state when applied to both clients", () => {
    const serverResult = [2, 7, 14, 7];
    const shooterView: number[] = [];
    const opponentView: number[] = [];

    addUniqueNumbers(shooterView, serverResult);
    addUniqueNumbers(opponentView, serverResult);

    expect(opponentView).toEqual(shooterView);
  });
});
