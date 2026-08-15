export interface CollisionPair {
  bodyA: any;
  bodyB: any;
}

/**
 * Phaser's collisionstart event includes all Matter collision pairs in
 * `event.pairs`. The bodyA/bodyB callback arguments are only a compatibility
 * fallback for integrations that do not provide that collection.
 */
export function getCollisionPairs(
  event: { pairs?: CollisionPair[] } | null | undefined,
  bodyA: any,
  bodyB: any,
): CollisionPair[] {
  if (Array.isArray(event?.pairs) && event.pairs.length > 0) {
    return event.pairs.filter((pair) => pair?.bodyA && pair?.bodyB);
  }

  return bodyA && bodyB ? [{ bodyA, bodyB }] : [];
}

/** Add numbers once while preserving the order in which they were observed. */
export function addUniqueNumbers(target: number[], values: number[]): void {
  values.forEach((value) => {
    if (!target.includes(value)) target.push(value);
  });
}
