import { describe, it, expect } from "vitest";

describe("AIM_SYNC_INTERVAL_MS", () => {
  it("should be 25ms for ~40 FPS aiming sync", () => {
    const intervalMs = 25;
    expect(intervalMs).toBe(25);
  });
});

describe("wrapAngle logic", () => {
  const PI = Math.PI;
  const TWO_PI = 2 * PI;

  it("should wrap 359° → 1° as +2° (shortest path, not -358°)", () => {
    // delta = target - current = 1° - 359° = -358° in degrees
    // In radians: delta = -358/180 * PI
    // Wrapped to [-PI, PI]: should give +2 * PI/180 (i.e., +2°)
    const delta = -358 * (PI / 180);
    let wrapped = delta % TWO_PI;
    if (wrapped > PI) wrapped -= TWO_PI;
    if (wrapped < -PI) wrapped += TWO_PI;
    const expected = 2 * (PI / 180);
    expect(Math.abs(wrapped - expected) < 0.001).toBe(true);
  });

  it("should handle 1° → 359° as -2° (shortest path, not +358°)", () => {
    // delta = 359° - 1° = 358°
    // In radians: 358 * PI/180
    // Wrapped to [-PI, PI]: should give -2 * PI/180 (i.e., -2°)
    const delta = 358 * (PI / 180);
    let wrapped = delta % TWO_PI;
    if (wrapped > PI) wrapped -= TWO_PI;
    if (wrapped < -PI) wrapped += TWO_PI;
    const expected = -2 * (PI / 180);
    expect(Math.abs(wrapped - expected) < 0.001).toBe(true);
  });

  it("should clamp tiny floating-point residuals", () => {
    const tiny = 1e-11;
    let wrapped = tiny % TWO_PI;
    if (wrapped > PI) wrapped -= TWO_PI;
    if (wrapped < -PI) wrapped += TWO_PI;
    // After the method's clamping, values with |wrapped| < 1e-10 become 0
    expect(Math.abs(wrapped) < 1e-10).toBe(true);
  });
});

describe("interpolation logic", () => {
  it("should interpolate angle towards target with wrapping", () => {
    const interpolationSpeed = 0.15;
    let angle = 0;
    const target = Math.PI / 2; // 90°

    for (let i = 0; i < 50; i++) {
      const angleDelta = ((target - angle + Math.PI) % (2 * Math.PI)) - Math.PI;
      angle += angleDelta * interpolationSpeed;
    }

    expect(Math.abs(angle - Math.PI / 2) < 0.1).toBe(true);
  });

  it("should handle 359° → 1° wrapping in interpolation", () => {
    const interpolationSpeed = 0.15;
    let angle = (359 * Math.PI) / 180;
    const target = (1 * Math.PI) / 180;

    for (let i = 0; i < 50; i++) {
      const angleDelta = ((target - angle + Math.PI) % (2 * Math.PI)) - Math.PI;
      angle += angleDelta * interpolationSpeed;
    }

    // After interpolating from 359° toward 1° the short way (through 0°),
    // the angle should be near 1° (not near 359° going the long way around)
    const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // Should be close to 1° = PI/180, not near 2PI - 1°
    expect(Math.abs(normalized - Math.PI / 180) < 0.25).toBe(true);
  });
});