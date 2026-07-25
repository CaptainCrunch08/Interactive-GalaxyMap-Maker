/** Flat-top hex helpers + hemispheric projection for strategic maps. */

export type HexCoord = { q: number; r: number };

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** All axial hexes within `radius` of the origin (inclusive). */
export function hexesInRadius(radius: number): HexCoord[] {
  const cells: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      cells.push({ q, r });
    }
  }
  return cells;
}

/** Center of a flat-top hex in pixel space. */
export function flatHexToPixel(
  q: number,
  r: number,
  size: number,
): { x: number; y: number } {
  return {
    x: size * (1.5 * q),
    y: size * (Math.sqrt(3) * (r + q / 2)),
  };
}

/** Vertex list for a flat-top hex centered at (cx, cy). */
export function flatHexCorners(
  cx: number,
  cy: number,
  size: number,
): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle),
    });
  }
  return corners;
}

export function flatHexPath(cx: number, cy: number, size: number): string {
  return flatHexCorners(cx, cy, size)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ")
    .concat(" Z");
}

/** Stable 0–1 hash from axial coords (for subtle terrain variation). */
export function hexNoise(q: number, r: number): number {
  const n = Math.sin(q * 127.1 + r * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export type HemisphereProjection = {
  /** Horizontal layout stretch (keep near 1 so hexes stay readable). */
  stretchX: number;
  /** Vertical layout stretch (keep near 1 so hexes stay readable). */
  stretchY: number;
  /** 0–1 vertical perspective bias (far limb slightly smaller). */
  perspective: number;
  /** Flat-map radius used to normalize into the unit disk. */
  flatRadius: number;
  /** Final pixel scale of the projected globe. */
  worldScale: number;
};

export const DEFAULT_HEMISPHERE: HemisphereProjection = {
  stretchX: 1.08,
  stretchY: 0.96,
  perspective: 0.08,
  flatRadius: 1,
  worldScale: 300,
};

/**
 * Map a flat point into survey space. Stretch is layout-only and kept mild
 * so neighboring hexes still tile cleanly.
 */
export function projectToHemisphere(
  x: number,
  y: number,
  proj: HemisphereProjection = DEFAULT_HEMISPHERE,
): { x: number; y: number; z: number } | null {
  const nx = x / proj.flatRadius;
  const ny = y / proj.flatRadius;
  const rr = nx * nx + ny * ny;
  if (rr > 1) return null;

  const edge = Math.sqrt(rr);
  const limb = 1 - 0.08 * edge * edge;
  const persp = 1 - proj.perspective * (0.5 - ny * 0.5);

  const px = nx * proj.stretchX * limb * persp;
  const py = ny * proj.stretchY * limb * persp;
  const z = Math.sqrt(Math.max(0, 1 - rr));

  return {
    x: px * proj.worldScale,
    y: py * proj.worldScale,
    z,
  };
}

/**
 * Draw a regular flat-top hex at the projected cell center.
 * Vertices are NOT run through the stretch transform (that was squashing tiles).
 */
export function projectedHexPath(
  q: number,
  r: number,
  size: number,
  proj: HemisphereProjection,
): { d: string; cx: number; cy: number; z: number } | null {
  const flat = flatHexToPixel(q, r, size);
  const center = projectToHemisphere(flat.x, flat.y, proj);
  if (!center) return null;

  // Scale regular hexes with the map; keep aspect ratio 1:1 (true hexagons).
  const mapScale = proj.worldScale / proj.flatRadius;
  const hexRadius = size * 0.94 * mapScale * (0.9 + 0.1 * center.z);

  return {
    d: flatHexPath(center.x, center.y, hexRadius),
    cx: center.x,
    cy: center.y,
    z: center.z,
  };
}

export function hemisphereViewBox(
  proj: HemisphereProjection = DEFAULT_HEMISPHERE,
) {
  const w = proj.worldScale * Math.max(proj.stretchX, 1) * 2.2;
  const h = proj.worldScale * Math.max(proj.stretchY, 1) * 2.2;
  return {
    minX: -w / 2,
    minY: -h / 2,
    width: w,
    height: h,
  };
}
