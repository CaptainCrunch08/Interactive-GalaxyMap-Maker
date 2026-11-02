import type { Campaign, Planet, StarSystem } from "../types/campaign";
import { GALAXY_EDGE_PADDING } from "../types/campaign";
import { campaignWithSystemPlaced } from "./hyperlanes";
import { generatePlanetsForNewSystem } from "./generateSystemPlanets";
import { pickRandomStarClass } from "./stars";
import {
  allocateUniqueSystemName,
  usedSystemNameKeys,
} from "./systemNames";

export type MapRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type StarDensityPreset = "sparse" | "standard" | "dense" | "crowded";

export const STAR_DENSITY_PRESETS: Record<
  StarDensityPreset,
  { label: string; blurb: string; /** <1 packs tighter */ spacingScale: number }
> = {
  sparse: {
    label: "Sparse",
    blurb: "Wide, even gaps",
    spacingScale: 1.35,
  },
  standard: {
    label: "Standard",
    blurb: "Even coverage, roomy lanes",
    spacingScale: 1.1,
  },
  dense: {
    label: "Dense",
    blurb: "Even fill, closer stars (default)",
    spacingScale: 0.88,
  },
  crowded: {
    label: "Crowded",
    blurb: "Even fill at maximum density",
    spacingScale: 0.7,
  },
};

export const STAR_DENSITY_ORDER: StarDensityPreset[] = [
  "sparse",
  "standard",
  "dense",
  "crowded",
];

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable seed so density previews match the confirm pack. */
export function packSeedForRect(
  rect: MapRect,
  density: StarDensityPreset,
): number {
  const n =
    Math.floor(rect.left) * 73856093 +
    Math.floor(rect.top) * 19349663 +
    Math.floor(rect.right) * 83492791 +
    Math.floor(rect.bottom) * 12347 +
    density.length * 9973 +
    density.charCodeAt(0) * 131;
  return n >>> 0;
}

/** Base spacing before density preset scaling. */
export function minDistForRegionFill(
  mapSize: number,
  density: StarDensityPreset = "dense",
): number {
  const base =
    mapSize <= 5600 ? 195 : mapSize <= 10000 ? 230 : 265;
  const scale = STAR_DENSITY_PRESETS[density].spacingScale;
  return Math.max(110, Math.round(base * scale));
}

/**
 * Pack star positions evenly across a rectangle (lattice covering the full
 * box), keeping clear of existing systems. Avoids tight random clumps.
 */
export function packPointsInRect(
  rect: MapRect,
  existing: ReadonlyArray<{ x: number; y: number }>,
  opts: {
    mapSize: number;
    minDist?: number;
    density?: StarDensityPreset;
    maxPoints?: number;
    rng?: () => number;
    /** When set, packing is deterministic (preview matches generate). */
    seed?: number;
  },
): { x: number; y: number }[] {
  const rng =
    opts.rng ??
    (opts.seed != null ? mulberry32(opts.seed) : Math.random);
  const pad = GALAXY_EDGE_PADDING;
  const minDist =
    opts.minDist ??
    minDistForRegionFill(opts.mapSize, opts.density ?? "dense");
  const minDist2 = minDist * minDist;
  const mapSize = opts.mapSize;

  const left = Math.max(pad, Math.min(rect.left, rect.right));
  const right = Math.min(mapSize - pad, Math.max(rect.left, rect.right));
  const top = Math.max(pad, Math.min(rect.top, rect.bottom));
  const bottom = Math.min(mapSize - pad, Math.max(rect.top, rect.bottom));
  const width = right - left;
  const height = bottom - top;
  if (width < minDist * 0.4 || height < minDist * 0.4) return [];

  // Cell size a bit above minDist so neighbors stay clear with light jitter.
  const cell = minDist * 1.12;
  let cols = Math.max(1, Math.floor(width / cell));
  let rows = Math.max(1, Math.floor(height / cell));

  // Prefer a grid that actually spans the box (at least 2×2 when space allows).
  if (width >= minDist * 1.6) cols = Math.max(cols, 2);
  if (height >= minDist * 1.6) rows = Math.max(rows, 2);

  const maxPoints = Math.min(
    opts.maxPoints ?? 120,
    cols * rows,
    150,
  );
  // If the naive floor under-fills a large rect, bump grid toward target count.
  const targetByArea = Math.max(
    1,
    Math.floor((width * height) / (minDist * minDist * 1.15)),
  );
  const target = Math.min(maxPoints, targetByArea);
  while (cols * rows < target) {
    const nextCols = cols + (width / cols >= height / rows ? 1 : 0);
    const nextRows = rows + (height / rows > width / cols ? 1 : 0);
    const c = Math.max(cols, nextCols === cols ? cols + 1 : nextCols);
    const r = Math.max(rows, nextRows === rows ? rows + 1 : nextRows);
    if (width / c < minDist * 0.92 || height / r < minDist * 0.92) break;
    cols = c;
    rows = r;
    if (cols * rows >= target) break;
  }

  const cellW = width / cols;
  const cellH = height / rows;
  const jitterX = cellW * 0.18;
  const jitterY = cellH * 0.18;

  const blockers = existing.map((p) => ({ x: p.x, y: p.y }));
  const points: { x: number; y: number }[] = [];

  const tooClose = (x: number, y: number) => {
    for (const p of blockers) {
      if (dist2(x, y, p.x, p.y) < minDist2) return true;
    }
    for (const p of points) {
      if (dist2(x, y, p.x, p.y) < minDist2) return true;
    }
    return false;
  };

  // Visit cells in shuffled order so blocked cells don't bias one side.
  const cells: { col: number; row: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ col, row });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cells[i]!;
    cells[i] = cells[j]!;
    cells[j] = tmp;
  }

  for (const { col, row } of cells) {
    if (points.length >= maxPoints) break;
    const cx = left + (col + 0.5) * cellW;
    const cy = top + (row + 0.5) * cellH;
    let placed = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = cx + (rng() - 0.5) * 2 * jitterX;
      const y = cy + (rng() - 0.5) * 2 * jitterY;
      if (x < left || x > right || y < top || y > bottom) continue;
      if (tooClose(x, y)) continue;
      points.push({ x, y });
      placed = true;
      break;
    }
    if (!placed) {
      // Fall back to exact cell center if jitter couldn't clear neighbors.
      if (!tooClose(cx, cy)) points.push({ x: cx, y: cy });
    }
  }

  return points;
}

/**
 * Create systems (+ planets with settlements) at the given positions and
 * stitch them into the campaign with sticky hyperlane links.
 */
export function campaignWithMassGeneratedSystems(
  campaign: Campaign,
  points: ReadonlyArray<{ x: number; y: number }>,
  rng: () => number = Math.random,
): Campaign {
  if (points.length === 0) return campaign;

  const used = usedSystemNameKeys(campaign.systems.map((s) => s.name));
  let next: Campaign = campaign;
  const newPlanets: Planet[] = [];

  for (const pt of points) {
    const system: StarSystem = {
      id: crypto.randomUUID(),
      name: allocateUniqueSystemName(used, rng),
      x: pt.x,
      y: pt.y,
      notes: "",
      starClass: pickRandomStarClass(rng),
    };
    const planets = generatePlanetsForNewSystem(system, rng);
    newPlanets.push(...planets);
    next = campaignWithSystemPlaced(next, system);
  }

  return {
    ...next,
    planets: [...next.planets, ...newPlanets],
  };
}
