import { Delaunay } from "d3-delaunay";
import type { Campaign, Faction, StarSystem } from "../types/campaign";
import { campaignMapSize } from "../types/campaign";
import type { TerritoryBorder, TerritoryFill } from "./metaball";
import { getSystemOwnership } from "./territory";

type ClaimPaint = {
  id: string;
  color: string;
  kind: "owned" | "contested";
  stripeColors?: [string, string];
};

type SiteClaim = {
  system: StarSystem;
  paint: ClaimPaint | null;
};

type Pt = [number, number];

export type VoronoiTerritoryOptions = {
  /**
   * Smooth Voronoi: inset cells with rounded corners and empty gaps between
   * different claims. Same-claim neighbors stay flush (no gap).
   */
  soft?: boolean;
  /**
   * Organic wobble on shared edges (deterministic); neighbors stay seamless.
   */
  shaky?: boolean;
};

const BOUND_EPS = 0.75;
/** Inset from edges that face a different claim / void / map border. */
const SOFT_INSET = 32;
/** Corner fillet on inset exterior corners. */
const SOFT_CORNER_R = 48;
/** Shaky edge subdivision + amplitude. */
const SHAKY_STEPS = 5;
const SHAKY_AMP_FRAC = 0.14;
const SHAKY_AMP_MAX = 48;

function contestedKey(factions: Faction[]): string {
  return [...factions.map((f) => f.id)].sort().join("|");
}

function claimPaintForOwnership(
  ownership: ReturnType<typeof getSystemOwnership>,
): ClaimPaint | null {
  if (ownership.status === "owned") {
    const faction = ownership.factions[0]!;
    return {
      id: faction.id,
      color: faction.color,
      kind: "owned",
    };
  }
  if (ownership.status === "contested") {
    const a = ownership.factions[0]!;
    const b = ownership.factions[1] ?? a;
    return {
      id: `contested:${contestedKey(ownership.factions)}`,
      color: a.color,
      kind: "contested",
      stripeColors: [
        a.color,
        ownership.factions.length > 1 ? b.color : "#3a4550",
      ],
    };
  }
  return null;
}

function polygonPath(ring: Pt[]): string {
  if (ring.length < 3) return "";
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i]!;
    d += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
  }
  return `${d}Z`;
}

function edgeOnMapBorder(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mapSize: number,
): boolean {
  const near = (v: number, edge: number) => Math.abs(v - edge) <= BOUND_EPS;
  if (near(x0, 0) && near(x1, 0)) return true;
  if (near(x0, mapSize) && near(x1, mapSize)) return true;
  if (near(y0, 0) && near(y1, 0)) return true;
  if (near(y0, mapSize) && near(y1, mapSize)) return true;
  return false;
}

function appendEdge(
  paths: Map<string, string>,
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  paths.set(id, `${paths.get(id) ?? ""}M${x0} ${y0}L${x1} ${y1}`);
}

function appendPolyline(
  paths: Map<string, string>,
  id: string,
  pts: Pt[],
): void {
  if (pts.length < 2) return;
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    d += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
  }
  paths.set(id, `${paths.get(id) ?? ""}${d}`);
}

function roundKey(v: number): number {
  return Math.round(v * 100) / 100;
}

function edgeKey(x0: number, y0: number, x1: number, y1: number): string {
  const a = `${roundKey(x0)},${roundKey(y0)}`;
  const b = `${roundKey(x1)},${roundKey(y1)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Deterministic [-1, 1] from string + salt. */
function hashUnit(key: string, salt: number): number {
  let h = (salt * 374761393) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 2246822519) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function clampToMap(x: number, y: number, mapSize: number): Pt {
  return [
    Math.min(mapSize, Math.max(0, x)),
    Math.min(mapSize, Math.max(0, y)),
  ];
}

/**
 * Ghost sites just outside the map frame so the border participates in the
 * Voronoi diagram (cells meet the frame along true bisectors, not only a clip).
 */
function makeBorderGhostSites(mapSize: number, starCount: number): Pt[] {
  const ghosts: Pt[] = [];
  const steps = Math.max(8, Math.min(48, Math.ceil(Math.sqrt(Math.max(1, starCount)) * 2.5)));
  const spacing = mapSize / steps;
  const pad = spacing * 0.55;

  for (let i = 0; i <= steps; i++) {
    const t = i * spacing;
    ghosts.push([t, -pad]);
    ghosts.push([t, mapSize + pad]);
  }
  for (let i = 1; i < steps; i++) {
    const t = i * spacing;
    ghosts.push([-pad, t]);
    ghosts.push([mapSize + pad, t]);
  }
  // Corners reinforced so corner cells don't collapse oddly.
  ghosts.push([-pad, -pad], [mapSize + pad, -pad], [-pad, mapSize + pad], [
    mapSize + pad,
    mapSize + pad,
  ]);
  return ghosts;
}

function claimPaintAt(
  sites: SiteClaim[],
  index: number,
): ClaimPaint | null {
  if (index < 0 || index >= sites.length) return null;
  return sites[index]!.paint;
}

/**
 * Shared shaky edge polyline from (x0,y0) → (x1,y1).
 * Cached by canonical endpoints so adjacent cells deform identically.
 * Map-border edges wobble too — the frame is part of the tessellation.
 */
function shakyEdgePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mapSize: number,
  cache: Map<string, Pt[]>,
): Pt[] {
  const key = edgeKey(x0, y0, x1, y1);
  let canonical = cache.get(key);
  if (!canonical) {
    const aFirst =
      roundKey(x0) < roundKey(x1) ||
      (roundKey(x0) === roundKey(x1) && roundKey(y0) <= roundKey(y1));
    const sx = aFirst ? x0 : x1;
    const sy = aFirst ? y0 : y1;
    const ex = aFirst ? x1 : x0;
    const ey = aFirst ? y1 : y0;
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy);
    if (len < 8) {
      canonical = [
        [sx, sy],
        [ex, ey],
      ];
    } else {
      const nx = -dy / len;
      const ny = dx / len;
      const amp = Math.min(SHAKY_AMP_MAX, len * SHAKY_AMP_FRAC);
      // Keep endpoints on the frame if the edge already sits on it.
      const onFrame = edgeOnMapBorder(sx, sy, ex, ey, mapSize);
      const pts: Pt[] = [[sx, sy]];
      for (let i = 1; i < SHAKY_STEPS; i++) {
        const t = i / SHAKY_STEPS;
        const px = sx + dx * t;
        const py = sy + dy * t;
        const envelope = Math.sin(Math.PI * t);
        const wobble =
          (hashUnit(key, i) * 0.7 + hashUnit(key, i + 31) * 0.3) *
          amp *
          envelope;
        let qx = px + nx * wobble;
        let qy = py + ny * wobble;
        if (onFrame) {
          // Slide along the frame only — don't pull the border inward/outward.
          if (Math.abs(sx) <= BOUND_EPS && Math.abs(ex) <= BOUND_EPS) {
            qx = 0;
          } else if (
            Math.abs(sx - mapSize) <= BOUND_EPS &&
            Math.abs(ex - mapSize) <= BOUND_EPS
          ) {
            qx = mapSize;
          } else if (Math.abs(sy) <= BOUND_EPS && Math.abs(ey) <= BOUND_EPS) {
            qy = 0;
          } else if (
            Math.abs(sy - mapSize) <= BOUND_EPS &&
            Math.abs(ey - mapSize) <= BOUND_EPS
          ) {
            qy = mapSize;
          }
        }
        pts.push(clampToMap(qx, qy, mapSize));
      }
      pts.push([ex, ey]);
      canonical = pts;
    }
    cache.set(key, canonical);
  }

  const startMatches =
    Math.abs(canonical[0]![0] - x0) < 1e-3 &&
    Math.abs(canonical[0]![1] - y0) < 1e-3;
  return startMatches ? canonical : [...canonical].reverse();
}

function ringFromShakyCell(
  ring: Pt[],
  mapSize: number,
  cache: Map<string, Pt[]>,
): Pt[] {
  const out: Pt[] = [];
  for (let e = 0; e < ring.length; e++) {
    const a = ring[e]!;
    const b = ring[(e + 1) % ring.length]!;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4) continue;
    const pts = shakyEdgePoints(a[0], a[1], b[0], b[1], mapSize, cache);
    const start = out.length === 0 ? 0 : 1;
    for (let i = start; i < pts.length; i++) out.push(pts[i]!);
  }
  if (out.length > 1) {
    const f = out[0]!;
    const l = out[out.length - 1]!;
    if (Math.abs(f[0] - l[0]) < 1e-3 && Math.abs(f[1] - l[1]) < 1e-3) {
      out.pop();
    }
  }
  return out;
}

function buildShakyRegions(
  sites: SiteClaim[],
  cellRings: Array<Pt[] | null>,
  points: Pt[],
  delaunay: Delaunay<Pt>,
  mapSize: number,
): { fills: TerritoryFill[]; borders: TerritoryBorder[] } {
  const softCache = new Map<string, Pt[]>();
  const fillPaths = new Map<string, string>();
  const borderPaths = new Map<string, string>();
  const paintById = new Map<string, ClaimPaint>();
  const starCount = sites.length;
  const shakyRings: Array<Pt[] | null> = cellRings.map((ring) => {
    if (!ring || ring.length < 3) return null;
    return ringFromShakyCell(ensureCcw(ring), mapSize, softCache);
  });

  for (let i = 0; i < sites.length; i++) {
    const paint = sites[i]!.paint;
    const ring = shakyRings[i];
    if (!paint || !ring || ring.length < 3) continue;
    paintById.set(paint.id, paint);
    const path = polygonPath(ring);
    if (!path) continue;
    fillPaths.set(paint.id, `${fillPaths.get(paint.id) ?? ""}${path}`);
  }

  for (let i = 0; i < sites.length; i++) {
    const paintI = sites[i]!.paint;
    if (!paintI) continue;
    const raw = cellRings[i];
    if (!raw || raw.length < 2) continue;
    const ring = ensureCcw(raw);
    const neighborIds = [...delaunay.neighbors(i)];

    for (let e = 0; e < ring.length; e++) {
      const a = ring[e]!;
      const b = ring[(e + 1) % ring.length]!;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4) continue;
      const mx = (a[0] + b[0]) * 0.5;
      const my = (a[1] + b[1]) * 0.5;
      const neighbor = neighborAcrossEdge(mx, my, neighborIds, points);
      const paintJ =
        neighbor >= 0 && neighbor < starCount
          ? claimPaintAt(sites, neighbor)
          : null;
      if (paintJ && paintJ.id === paintI.id) continue;

      const pts = shakyEdgePoints(a[0], a[1], b[0], b[1], mapSize, softCache);
      appendPolyline(borderPaths, paintI.id, pts);
    }
  }

  const fills: TerritoryFill[] = [];
  for (const [id, path] of fillPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    fills.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  const borders: TerritoryBorder[] = [];
  for (const [id, path] of borderPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    borders.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  return { fills, borders };
}

function cellToRing(cell: ArrayLike<number>[]): Pt[] {
  const ring: Pt[] = [];
  for (let i = 0; i < cell.length; i++) {
    const p = cell[i]!;
    ring.push([p[0]!, p[1]!]);
  }
  if (ring.length > 1) {
    const f = ring[0]!;
    const l = ring[ring.length - 1]!;
    if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) {
      ring.pop();
    }
  }
  return ring;
}

function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[(i + 1) % ring.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a * 0.5;
}

function ensureCcw(ring: Pt[]): Pt[] {
  return ringArea(ring) < 0 ? [...ring].reverse() : ring;
}

function lineIntersection(p: Pt, r: Pt, q: Pt, s: Pt): Pt | null {
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
  return [p[0] + t * r[0], p[1] + t * r[1]];
}

/**
 * Per-edge parallel inset. `edgeInsets[i]` applies to edge ring[i]→ring[i+1].
 * Same-claim flush edges use 0 so neighbors stay seamless.
 */
function insetRingSelective(
  ringIn: Pt[],
  edgeInsets: number[],
  cx: number,
  cy: number,
): Pt[] | null {
  const ring = ensureCcw(ringIn);
  if (ring.length < 3) return null;
  const n = ring.length;
  if (edgeInsets.length !== n) return null;

  const lines: { o: Pt; d: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    let nx = -dy / len;
    let ny = dx / len;
    const mx = (a[0] + b[0]) * 0.5;
    const my = (a[1] + b[1]) * 0.5;
    if ((cx - mx) * nx + (cy - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const inset = Math.max(0, edgeInsets[i]!);
    lines.push({
      o: [a[0] + nx * inset, a[1] + ny * inset],
      d: [dx, dy],
    });
  }

  const out: Pt[] = [];
  for (let i = 0; i < lines.length; i++) {
    const prev = lines[(i - 1 + lines.length) % lines.length]!;
    const cur = lines[i]!;
    const hit = lineIntersection(prev.o, prev.d, cur.o, cur.d);
    if (!hit || !Number.isFinite(hit[0]) || !Number.isFinite(hit[1])) {
      return null;
    }
    out.push(hit);
  }

  if (Math.abs(ringArea(out)) < 64) return null;
  return ensureCcw(out);
}

type SoftCorner = { start: Pt; mid: Pt; end: Pt; round: boolean };

function softCorners(
  ring: Pt[],
  radius: number,
  edgeInsets: number[],
): SoftCorner[] {
  const n = ring.length;
  const corners: SoftCorner[] = [];

  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const curr = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const insetPrev = edgeInsets[(i - 1 + n) % n]!;
    const insetNext = edgeInsets[i]!;
    // Only round where the territory faces a gap on at least one side.
    const round = insetPrev > 0 || insetNext > 0;

    const d0x = curr[0] - prev[0];
    const d0y = curr[1] - prev[1];
    const d1x = next[0] - curr[0];
    const d1y = next[1] - curr[1];
    const len0 = Math.hypot(d0x, d0y);
    const len1 = Math.hypot(d1x, d1y);
    if (len0 < 1e-6 || len1 < 1e-6 || !round || radius <= 1) {
      corners.push({ start: curr, mid: curr, end: curr, round: false });
      continue;
    }

    const r = Math.min(radius, len0 * 0.42, len1 * 0.42);
    corners.push({
      start: [curr[0] - (d0x / len0) * r, curr[1] - (d0y / len0) * r],
      mid: curr,
      end: [curr[0] + (d1x / len1) * r, curr[1] + (d1y / len1) * r],
      round: true,
    });
  }
  return corners;
}

/**
 * Fillet corners. Vertices between two flush (0-inset) edges stay sharp so
 * same-claim neighbors keep identical shared vertices.
 */
function roundedPolygonPath(
  ring: Pt[],
  radius: number,
  edgeInsets: number[],
): string {
  const n = ring.length;
  if (n < 3) return "";
  if (radius <= 1) return polygonPath(ring);

  const corners = softCorners(ring, radius, edgeInsets);
  if (corners.length < 3) return polygonPath(ring);

  let d = `M${corners[0]!.start[0]} ${corners[0]!.start[1]}`;
  for (const c of corners) {
    d += `L${c.start[0]} ${c.start[1]}`;
    if (c.round) {
      d += `Q${c.mid[0]} ${c.mid[1]} ${c.end[0]} ${c.end[1]}`;
    } else {
      d += `L${c.end[0]} ${c.end[1]}`;
    }
  }
  d += "Z";
  return d;
}

function neighborAcrossEdge(
  mx: number,
  my: number,
  neighborIds: number[],
  points: Pt[],
): number {
  let neighbor = -1;
  let best = Infinity;
  for (const j of neighborIds) {
    const p = points[j]!;
    const dist = (p[0] - mx) ** 2 + (p[1] - my) ** 2;
    if (dist < best) {
      best = dist;
      neighbor = j;
    }
  }
  return neighbor;
}

function buildSoftRegions(
  sites: SiteClaim[],
  cellRings: Array<Pt[] | null>,
  points: Pt[],
  delaunay: Delaunay<Pt>,
  _mapSize: number,
): { fills: TerritoryFill[]; borders: TerritoryBorder[] } {
  const fillPaths = new Map<string, string>();
  const borderPaths = new Map<string, string>();
  const paintById = new Map<string, ClaimPaint>();
  const starCount = sites.length;

  for (let i = 0; i < sites.length; i++) {
    const paint = sites[i]!.paint;
    const raw = cellRings[i];
    if (!paint || !raw || raw.length < 3) continue;

    const ring = ensureCcw(raw);
    const site = points[i]!;
    const neighborIds = [...delaunay.neighbors(i)];
    const edgeInsets: number[] = [];
    let hasExterior = false;

    for (let e = 0; e < ring.length; e++) {
      const a = ring[e]!;
      const b = ring[(e + 1) % ring.length]!;
      const mx = (a[0] + b[0]) * 0.5;
      const my = (a[1] + b[1]) * 0.5;
      const neighbor = neighborAcrossEdge(mx, my, neighborIds, points);
      // Ghost / missing neighbor = map-frame side of the tessellation.
      const paintJ =
        neighbor >= 0 && neighbor < starCount
          ? claimPaintAt(sites, neighbor)
          : null;

      // Flush with same claim; inset against rivals / void / map frame.
      if (paintJ && paintJ.id === paint.id) {
        edgeInsets.push(0);
      } else {
        edgeInsets.push(SOFT_INSET);
        hasExterior = true;
      }
    }

    // All flush (fully interior) — still draw the raw cell so empire stays solid.
    const inset =
      edgeInsets.every((v) => v === 0)
        ? ring
        : insetRingSelective(ring, edgeInsets, site[0], site[1]);
    if (!inset || inset.length < 3) continue;

    const path = roundedPolygonPath(inset, SOFT_CORNER_R, edgeInsets);
    if (!path) continue;

    paintById.set(paint.id, paint);
    fillPaths.set(paint.id, `${fillPaths.get(paint.id) ?? ""}${path}`);
    // Full rounded outline — FactionTerritoryLayer applies thick clipped strokes.
    if (hasExterior) {
      borderPaths.set(paint.id, `${borderPaths.get(paint.id) ?? ""}${path}`);
    }
  }

  const fills: TerritoryFill[] = [];
  for (const [id, path] of fillPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    fills.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  const borders: TerritoryBorder[] = [];
  for (const [id, path] of borderPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    borders.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  return { fills, borders };
}

/**
 * Star-driven Voronoi territories: each system owns a cell clipped to the map.
 * Clean: sharp shared edges. Soft: inset + rounded gaps. Shaky: organic wobble.
 */
export function buildVoronoiTerritories(
  campaign: Campaign,
  options: VoronoiTerritoryOptions = {},
): {
  fills: TerritoryFill[];
  borders: TerritoryBorder[];
} {
  const soft = options.soft === true;
  const shaky = options.shaky === true;
  const mapSize = campaignMapSize(campaign);
  const systems = campaign.systems;
  if (systems.length === 0) {
    return { fills: [], borders: [] };
  }

  const sites: SiteClaim[] = systems.map((system) => ({
    system,
    paint: claimPaintForOwnership(getSystemOwnership(campaign, system.id)),
  }));

  const seen = new Map<string, number>();
  const points = sites.map((site) => {
    let x = site.system.x;
    let y = site.system.y;
    const key = `${x | 0},${y | 0}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n > 0) {
      x += (n % 7) * 0.37 + 0.11;
      y += Math.floor(n / 7) * 0.37 + 0.07;
    }
    x = Math.min(mapSize - 1e-3, Math.max(1e-3, x));
    y = Math.min(mapSize - 1e-3, Math.max(1e-3, y));
    return [x, y] as Pt;
  });

  const starCount = points.length;
  const ghosts = makeBorderGhostSites(mapSize, starCount);
  const allPoints: Pt[] = [...points, ...ghosts];
  const delaunay = Delaunay.from(allPoints);
  const voronoi = delaunay.voronoi([0, 0, mapSize, mapSize]);

  // Only build rings for real stars — ghost cells are the map-frame side.
  const cellRings: Array<Pt[] | null> = sites.map((_, i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell || cell.length < 3) return null;
    return cellToRing(cell);
  });

  if (soft) {
    return buildSoftRegions(sites, cellRings, allPoints, delaunay, mapSize);
  }
  if (shaky) {
    return buildShakyRegions(sites, cellRings, allPoints, delaunay, mapSize);
  }

  const fillPaths = new Map<string, string>();
  const borderPaths = new Map<string, string>();
  const paintById = new Map<string, ClaimPaint>();

  for (let i = 0; i < sites.length; i++) {
    const paint = sites[i]!.paint;
    const ring = cellRings[i];
    if (!paint || !ring || ring.length < 3) continue;
    paintById.set(paint.id, paint);
    const path = polygonPath(ring);
    if (!path) continue;
    fillPaths.set(paint.id, `${fillPaths.get(paint.id) ?? ""}${path}`);
  }

  for (let i = 0; i < sites.length; i++) {
    const paintI = sites[i]!.paint;
    if (!paintI) continue;
    const ring = cellRings[i];
    if (!ring || ring.length < 2) continue;

    const neighborIds = [...delaunay.neighbors(i)];

    for (let e = 0; e < ring.length; e++) {
      const a = ring[e]!;
      const b = ring[(e + 1) % ring.length]!;
      const x0 = a[0];
      const y0 = a[1];
      const x1 = b[0];
      const y1 = b[1];
      if (Math.hypot(x1 - x0, y1 - y0) < 1e-4) continue;

      const mx = (x0 + x1) * 0.5;
      const my = (y0 + y1) * 0.5;
      const neighbor = neighborAcrossEdge(mx, my, neighborIds, allPoints);
      const paintJ =
        neighbor >= 0 && neighbor < starCount
          ? claimPaintAt(sites, neighbor)
          : null;
      if (paintJ && paintJ.id === paintI.id) continue;

      appendEdge(borderPaths, paintI.id, x0, y0, x1, y1);
    }
  }

  const fills: TerritoryFill[] = [];
  for (const [id, path] of fillPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    fills.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  const borders: TerritoryBorder[] = [];
  for (const [id, path] of borderPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    borders.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  return { fills, borders };
}
