/**
 * Returns the visual rotation to apply for one rendered movement step.
 *
 * A sprite only has one screen-space rotation, so this is a 2D approximation
 * of rolling: the travelled distance controls the amount of rotation and a
 * continuous function of the travel angle controls its sign. The small phase
 * offset keeps the common cardinal and diagonal directions visibly rolling,
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

  const travelAngle = Math.atan2(dy, dx);
  const directionFactor = Math.cos(travelAngle - Math.PI / 8);
  return (distance / radius) * directionFactor;
}
