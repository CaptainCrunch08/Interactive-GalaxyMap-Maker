/** World size of the system map canvas (square). */
export const SYSTEM_VIEW_SIZE = 1400;

const STAR_CLEARANCE = 110;
const ORBIT_GAP = 95;
/** Slight stagger so planets aren't stacked on one radial line. */
const ANGLE_STEP = 2.399963; // ≈ golden angle in radians

export function orbitRadiusForIndex(orbitIndex: number): number {
  return STAR_CLEARANCE + Math.max(0, orbitIndex) * ORBIT_GAP;
}

export function orbitAngleForIndex(orbitIndex: number): number {
  return orbitIndex * ANGLE_STEP - Math.PI / 2;
}

export function orbitPosition(
  orbitIndex: number,
  radius = orbitRadiusForIndex(orbitIndex),
): { x: number; y: number } {
  const angle = orbitAngleForIndex(orbitIndex);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

/** Outermost orbit radius for a set of planets (for empty-state / framing). */
export function maxOrbitRadius(planetCount: number): number {
  if (planetCount <= 0) return STAR_CLEARANCE;
  return orbitRadiusForIndex(planetCount - 1);
}

/** @deprecated Prefer orbitRadiusForIndex — kept for any leftover callers. */
export function orbitRadius(planetCount: number): number {
  return maxOrbitRadius(Math.max(1, planetCount));
}
