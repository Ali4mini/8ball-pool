import { describe, expect, it } from "vitest";
import { calculateRollDelta } from "../src/utils/rolling";

describe("calculateRollDelta", () => {
  it("uses travelled distance for horizontal, vertical, and diagonal movement", () => {
    expect(calculateRollDelta(10, 0, 5)).toBe(2);
    expect(calculateRollDelta(0, -10, 5)).toBe(2);
    expect(calculateRollDelta(3, 4, 5)).toBe(-1);
    expect(calculateRollDelta(-3, 4, 5)).toBe(-1);
    expect(calculateRollDelta(3, -4, 5)).toBe(1);
    expect(calculateRollDelta(-3, -4, 5)).toBe(1);
  });

  it("reverses rotation when movement reverses", () => {
    expect(calculateRollDelta(-10, 0, 5)).toBe(-2);
    expect(calculateRollDelta(0, 10, 5)).toBe(-2);
    expect(calculateRollDelta(-3, 4, 5)).toBe(-1);
    expect(calculateRollDelta(3, -4, 5)).toBe(1);
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
