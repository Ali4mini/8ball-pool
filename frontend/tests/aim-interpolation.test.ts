import { describe, expect, it } from "vitest";

const wrapAngle = (delta: number): number => {
  const pi = Math.PI;
  const twoPi = 2 * pi;
  let wrapped = delta % twoPi;
  if (wrapped > pi) wrapped -= twoPi;
  if (wrapped < -pi) wrapped += twoPi;
  return Math.abs(wrapped) < 1e-10 ? 0 : wrapped;
};

describe("aim interpolation", () => {
  it("uses the shortest path across 0 degrees", () => {
    expect(wrapAngle((-358 * Math.PI) / 180)).toBeCloseTo((2 * Math.PI) / 180);
    expect(wrapAngle((358 * Math.PI) / 180)).toBeCloseTo((-2 * Math.PI) / 180);
  });

  it("clamps tiny floating-point residuals", () => {
    expect(wrapAngle(1e-11)).toBe(0);
  });

  it("converges on the target angle", () => {
    let angle = 0;
    const target = Math.PI / 2;
    for (let i = 0; i < 50; i++) {
      angle += wrapAngle(target - angle) * 0.15;
    }
    expect(angle).toBeCloseTo(target, 1);
  });
});
