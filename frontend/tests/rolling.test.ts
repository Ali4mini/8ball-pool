import { describe, expect, it } from "vitest";
import { calculateRollDelta } from "../src/utils/rolling";

describe("calculateRollDelta", () => {
  it("uses travelled distance for horizontal, vertical, and diagonal movement", () => {
    expect(calculateRollDelta(10, 0, 5)).toBeCloseTo(2 * Math.cos(Math.PI / 8));
    expect(calculateRollDelta(0, -10, 5)).toBeLessThan(0);
    expect(calculateRollDelta(3, 4, 5)).toBeGreaterThan(0);
    expect(calculateRollDelta(-3, 4, 5)).toBeLessThan(0);
    expect(calculateRollDelta(3, -4, 5)).toBeGreaterThan(0);
    expect(calculateRollDelta(-3, -4, 5)).toBeLessThan(0);
  });

  it("reverses rotation when movement reverses", () => {
    expect(calculateRollDelta(-10, 0, 5)).toBeCloseTo(-2 * Math.cos(Math.PI / 8));
    expect(calculateRollDelta(0, 10, 5)).toBeGreaterThan(0);
    expect(calculateRollDelta(-3, 4, 5)).toBeLessThan(0);
    expect(calculateRollDelta(3, -4, 5)).toBeGreaterThan(0);
  });

  it("changes continuously around the 45-degree diagonal", () => {
    const justBefore = calculateRollDelta(1, 0.99, 5);
    const justAfter = calculateRollDelta(0.99, 1, 5);

    expect(justBefore).toBeGreaterThan(0);
    expect(justAfter).toBeGreaterThan(0);
    expect(Math.abs(justBefore - justAfter)).toBeLessThan(0.01);
  });

  it("preserves the unavoidable zero crossings of the signed 2D mapping", () => {
    const distance = 5;
    const radius = 5;
    const angleA = (5 * Math.PI) / 8;
    const angleB = (-3 * Math.PI) / 8;

    expect(
      calculateRollDelta(
        distance * Math.cos(angleA),
        distance * Math.sin(angleA),
        radius,
      ),
    ).toBeCloseTo(0);
    expect(
      calculateRollDelta(
        distance * Math.cos(angleB),
        distance * Math.sin(angleB),
        radius,
      ),
    ).toBeCloseTo(0);
  });

  it("stops rotating for stationary or nearly stationary movement", () => {
    expect(calculateRollDelta(0, 0, 5)).toBe(0);
    expect(calculateRollDelta(0.005, 0.005, 5)).toBe(0);
  });

  it("scales linearly with distance", () => {
    expect(calculateRollDelta(20, 0, 5)).toBe(
      calculateRollDelta(10, 0, 5) * 2,
    );
  });
});
