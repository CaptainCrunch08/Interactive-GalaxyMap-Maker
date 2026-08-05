import {
  flatHexToPixel,
  hexKey,
  hexesInRadius,
  type HexCoord,
} from "./hex";
import type { SphereDir } from "../types/campaign";

/** Axial radius of a warp-gate station map (~61 tiles). */
export const STATION_HEX_RADIUS = 4;

const AXIAL_DIRS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export type StationGrid = {
  tiles: HexCoord[];
  /** Axial key → tile index. */
  indexByKey: Map<string, number>;
  neighbors: number[][];
};

let cached: StationGrid | null = null;

/** Stable flat hex grid for warp-gate interiors (center = tile 0). */
export function buildStationGrid(radius = STATION_HEX_RADIUS): StationGrid {
  if (cached && cached.tiles.length === hexesInRadius(radius).length) {
    return cached;
  }
  const tiles = hexesInRadius(radius);
  // Put origin first so relay crown can sit at index 0.
  tiles.sort((a, b) => {
    const da = Math.abs(a.q) + Math.abs(a.r) + Math.abs(-a.q - a.r);
    const db = Math.abs(b.q) + Math.abs(b.r) + Math.abs(-b.q - b.r);
    if (da !== db) return da - db;
    if (a.q !== b.q) return a.q - b.q;
    return a.r - b.r;
  });
  const indexByKey = new Map<string, number>();
  tiles.forEach((t, i) => indexByKey.set(hexKey(t.q, t.r), i));
  const neighbors: number[][] = tiles.map(() => []);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    for (const d of AXIAL_DIRS) {
      const k = hexKey(t.q + d.q, t.r + d.r);
      const j = indexByKey.get(k);
      if (j != null) neighbors[i]!.push(j);
    }
  }
  cached = { tiles, indexByKey, neighbors };
  return cached;
}

export function stationTileCount(radius = STATION_HEX_RADIUS): number {
  return buildStationGrid(radius).tiles.length;
}

/** Direction vector used to place markers (planar; z = 0). */
export function stationDirFromTile(
  tileIndex: number,
  radius = STATION_HEX_RADIUS,
): SphereDir {
  const grid = buildStationGrid(radius);
  const tile = grid.tiles[tileIndex] ?? grid.tiles[0]!;
  const p = flatHexToPixel(tile.q, tile.r, 1);
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len, z: 0 };
}

export function nearestStationTile(
  dir: SphereDir,
  radius = STATION_HEX_RADIUS,
): number {
  const grid = buildStationGrid(radius);
  let best = 0;
  let bestDot = -Infinity;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const dx = dir.x / len;
  const dy = dir.y / len;
  for (let i = 0; i < grid.tiles.length; i++) {
    const d = stationDirFromTile(i, radius);
    const dot = d.x * dx + d.y * dy;
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

/** BFS distance on the station grid. */
export function stationTileDistance(
  start: number,
  goal: number,
  radius = STATION_HEX_RADIUS,
): number {
  if (start === goal) return 0;
  const { neighbors } = buildStationGrid(radius);
  const q = [start];
  const dist = new Map<number, number>([[start, 0]]);
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    for (const n of neighbors[cur] ?? []) {
      if (dist.has(n)) continue;
      if (n === goal) return d + 1;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function stationTilesInRange(
  start: number,
  range: number,
  radius = STATION_HEX_RADIUS,
): Set<number> {
  const { neighbors } = buildStationGrid(radius);
  const out = new Set<number>([start]);
  if (range <= 0) return out;
  const q = [start];
  const dist = new Map<number, number>([[start, 0]]);
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    if (d >= range) continue;
    for (const n of neighbors[cur] ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      out.add(n);
      q.push(n);
    }
  }
  return out;
}
