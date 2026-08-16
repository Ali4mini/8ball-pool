/**
 * Returns the visual rotation to apply for one rendered movement step.
 *
 * A sprite only has one screen-space rotation, so this is a 2D approximation
 * of rolling: the travelled distance controls the amount of rotation and the
 * dominant component of the movement vector controls its sign. Using the
 * dominant component keeps all cardinal and diagonal directions visible,
 * while reversing the movement reverses the spin.
 */
export function calculateRollDelta(
  dx: number,
  dy: number,
  radius: number,
  epsilon = 0.01,
): number {
  const distance = Math.hypot(dx, dy);
  if (distance <= epsilon || radius <= 0) return 0;

  const direction =
    Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : -Math.sign(dy);
  return (distance / radius) * direction;
}
