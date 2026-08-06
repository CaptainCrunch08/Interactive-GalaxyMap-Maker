import type { SphereDir } from "../types/campaign";

/** Station floorplan size (taller than wide for a bottom→top climb). */
export const STATION_GRID_COLS = 21;
export const STATION_GRID_ROWS = 27;

/** @deprecated Use STATION_GRID_COLS / ROWS — kept for call-site compatibility. */
export const STATION_HEX_RADIUS = STATION_GRID_COLS;

export type StationCoord = { x: number; y: number };

export type StationGrid = {
  cols: number;
  rows: number;
  /** Row-major tile count. */
  tileCount: number;
  /** 4-neighbor indices per tile (edge-clipped). */
  neighbors: number[][];
};

const ORTHO: StationCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

let cached: StationGrid | null = null;

export function stationTileIndex(x: number, y: number, cols = STATION_GRID_COLS): number {
  return y * cols + x;
}

export function stationTileCoord(
  tileIndex: number,
  cols = STATION_GRID_COLS,
): StationCoord {
  return {
    x: tileIndex % cols,
    y: Math.floor(tileIndex / cols),
  };
}

export function buildStationGrid(
  cols = STATION_GRID_COLS,
  rows = STATION_GRID_ROWS,
): StationGrid {
  if (cached && cached.cols === cols && cached.rows === rows) return cached;

  const tileCount = cols * rows;
  const neighbors: number[][] = Array.from({ length: tileCount }, () => []);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = stationTileIndex(x, y, cols);
      for (const d of ORTHO) {
        const nx = x + d.x;
        const ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        neighbors[i]!.push(stationTileIndex(nx, ny, cols));
      }
    }
  }
  cached = { cols, rows, tileCount, neighbors };
  return cached;
}

/** Accept legacy `(radius)` calls — ignored; square grid is fixed. */
export function stationTileCount(_radius?: number): number {
  return buildStationGrid().tileCount;
}

export function stationTilePixelX(tileIndex: number, tileSize = 1): number {
  const { x } = stationTileCoord(tileIndex);
  const { cols } = buildStationGrid();
  return (x - (cols - 1) / 2) * tileSize;
}

export function stationTilePixelY(tileIndex: number, tileSize = 1): number {
  const { y } = stationTileCoord(tileIndex);
  const { rows } = buildStationGrid();
  return (y - (rows - 1) / 2) * tileSize;
}

/**
 * Planar placement for station armies (unnormalized so each tile is unique).
 * z stays 0 — station maps are 2D corridors, not sphere hexes.
 */
export function stationDirFromTile(
  tileIndex: number,
  _radius?: number,
): SphereDir {
  return {
    x: stationTilePixelX(tileIndex),
    y: stationTilePixelY(tileIndex),
    z: 0,
  };
}

export function nearestStationTile(
  dir: SphereDir,
  _radius?: number,
  walkable?: ReadonlySet<number> | null,
): number {
  const grid = buildStationGrid();
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < grid.tileCount; i++) {
    if (walkable && !walkable.has(i)) continue;
    const px = stationTilePixelX(i);
    const py = stationTilePixelY(i);
    const d = (px - dir.x) ** 2 + (py - dir.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (walkable && !walkable.has(best)) {
    for (const t of walkable) return t;
  }
  return best;
}

function bfsOnWalkable(
  start: number,
  walkable: ReadonlySet<number> | null | undefined,
  visit: (tile: number, dist: number) => boolean,
) {
  const { neighbors } = buildStationGrid();
  const q = [start];
  const dist = new Map<number, number>([[start, 0]]);
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    const d = dist.get(cur)!;
    if (visit(cur, d)) return;
    for (const n of neighbors[cur] ?? []) {
      if (dist.has(n)) continue;
      if (walkable && !walkable.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
}

export function stationTileDistance(
  start: number,
  goal: number,
  _radius?: number,
  walkable?: ReadonlySet<number> | null,
): number {
  if (start === goal) return 0;
  if (walkable && (!walkable.has(start) || !walkable.has(goal))) {
    return Number.POSITIVE_INFINITY;
  }
  let found = Number.POSITIVE_INFINITY;
  bfsOnWalkable(start, walkable, (tile, d) => {
    if (tile === goal) {
      found = d;
      return true;
    }
    return false;
  });
  return found;
}

export function stationTilesInRange(
  start: number,
  range: number,
  _radius?: number,
  walkable?: ReadonlySet<number> | null,
): Set<number> {
  const out = new Set<number>();
  if (walkable && !walkable.has(start)) return out;
  bfsOnWalkable(start, walkable, (tile, d) => {
    if (d > range) return true;
    out.add(tile);
    return false;
  });
  return out;
}
