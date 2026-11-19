/** World size of the system map canvas (square). */
export const SYSTEM_VIEW_SIZE = 1400;

const STAR_CLEARANCE = 110;
const ORBIT_GAP = 95;
/** Slight stagger so planets aren't stacked on one radial line. */
const ANGLE_STEP = 2.399963; // ≈ golden angle in radians

/**
 * How far below a planet orbiting fleets sit (past disc + nameplate) so the
 * world stays easy to click. Legacy grid stacks used this; ring layout orbits
 * the body center instead.
 */
export const ORBIT_FLEET_CLEARANCE = 88;

/** Offset of fleets parked at the system star (from star center). Legacy. */
export const STAR_FLEET_OFFSET = { x: 56, y: -64 };

/** Ring radius for fleets orbiting a planet (grows gently with stack size). */
export function planetFleetRingRadius(fleetCount: number): number {
  const n = Math.max(1, fleetCount);
  return Math.min(96, 44 + Math.max(0, n - 1) * 3.5);
}

/** Ring radius for fleets at the system star. */
export function starFleetRingRadius(
  fleetCount: number,
  starDisplaySize: number,
): number {
  const n = Math.max(1, fleetCount);
  return Math.min(
    160,
    starDisplaySize * 0.55 + 28 + Math.max(0, n - 1) * 3,
  );
}

/** Ring radius for fleets around a galaxy-map system node. */
export function galaxyFleetRingRadius(fleetCount: number): number {
  const n = Math.max(1, fleetCount);
  return Math.min(72, 26 + Math.max(0, n - 1) * 2.75);
}

/**
 * Place fleet `index` of `count` on a ring around a body.
 * Leaves a gap at the bottom so planet nameplates stay readable; a lone
 * fleet sits above the body.
 */
export function fleetRingOffset(
  index: number,
  count: number,
  radius: number,
): { x: number; y: number } {
  const n = Math.max(1, count);
  if (n === 1) return { x: 0, y: -radius };
  // ~70° gap centered on the bottom (+Y in screen space).
  const gap = (70 * Math.PI) / 180;
  const span = Math.PI * 2 - gap;
  const start = Math.PI / 2 + gap / 2;
  const angle = start + (index / n) * span;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

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
