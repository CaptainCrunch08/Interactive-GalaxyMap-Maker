/** World size of the system map canvas (square). */
export const SYSTEM_VIEW_SIZE = 1400;

const STAR_CLEARANCE = 110;
const ORBIT_GAP = 95;
/** Slight stagger so planets aren't stacked on one radial line. */
const ANGLE_STEP = 2.399963; // ≈ golden angle in radians

/**
 * How far below a planet orbiting fleets sit (past disc + nameplate) so the
 * world stays easy to click. Stacks are centered on this anchor horizontally.
 */
export const ORBIT_FLEET_CLEARANCE = 88;

/** Offset of fleets parked at the system star (from star center). */
export const STAR_FLEET_OFFSET = { x: 56, y: -64 };

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

/** Anchor for fleets in orbit of a planet (clear of the planet hit target). */
export function orbitFleetAnchor(
  orbitIndex: number,
  center: number,
): { x: number; y: number } {
  const pos = orbitPosition(Math.max(0, orbitIndex));
  return {
    x: center + pos.x,
    y: center + pos.y + ORBIT_FLEET_CLEARANCE,
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
