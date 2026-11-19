import {
  buildStationGrid,
  stationTileCoord,
  stationTileIndex,
  STATION_GRID_COLS,
  STATION_GRID_ROWS,
} from "./stationHex";
import {
  clampStationMazeId,
  STATION_MAZE_ASCII,
  STATION_MAZE_CATALOG_COUNT,
  stationMazeIdFromPlanetId,
} from "./stationMazeCatalog";

export type StationMaze = {
  /** Catalog slot 0–11. */
  layoutId: number;
  walkable: Set<number>;
  /** The two boarding / entrance tiles (order: A then B). */
  dockTiles: number[];
  /** Primary boarding lock (entrance A). */
  entranceA: number;
  /** Secondary boarding lock (entrance B) — distinct look from A. */
  entranceB: number;
  /** Relay crown chamber center. */
  crownTile: number;
  /** Extra chamber markers (unused on compact layouts — kept for API compat). */
  chamberTiles: number[];
  /**
   * Deck index: 0 near entrances, higher toward the crown.
   */
  layerByTile: Map<number, number>;
  layerCount: number;
  cols: number;
  rows: number;
};

const mazeCache = new Map<number, StationMaze>();

function parseAsciiMaze(layoutId: number): StationMaze {
  const ascii = STATION_MAZE_ASCII[layoutId];
  if (!ascii || ascii.length !== STATION_GRID_ROWS) {
    throw new Error(`Invalid station maze catalog entry ${layoutId}`);
  }
  const cols = STATION_GRID_COLS;
  const rows = STATION_GRID_ROWS;
  const walkable = new Set<number>();
  let entranceA: number | null = null;
  let entranceB: number | null = null;
  const legacyEntrances: number[] = [];
  let crownTile = stationTileIndex(Math.floor(cols / 2), Math.floor(rows / 2));

  for (let y = 0; y < rows; y++) {
    const row = ascii[y]!;
    if (row.length !== cols) {
      throw new Error(
        `Station maze ${layoutId} row ${y} length ${row.length} !== ${cols}`,
      );
    }
    for (let x = 0; x < cols; x++) {
      const ch = row[x]!;
      if (ch === "#") continue;
      const t = stationTileIndex(x, y, cols);
      walkable.add(t);
      if (ch === "A") entranceA = t;
      else if (ch === "B") entranceB = t;
      else if (ch === "E") legacyEntrances.push(t);
      if (ch === "C") crownTile = t;
    }
  }

  if (entranceA == null && legacyEntrances[0] != null) {
    entranceA = legacyEntrances[0]!;
  }
  if (entranceB == null && legacyEntrances[1] != null) {
    entranceB = legacyEntrances[1]!;
  }
  const dockTiles: number[] = [];
  if (entranceA != null) dockTiles.push(entranceA);
  if (entranceB != null) dockTiles.push(entranceB);

  // Crown chamber: ensure a 3×3 walkable room around the crown marker.
  const { x: cx, y: cy } = stationTileCoord(crownTile, cols);
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      walkable.add(stationTileIndex(x, y, cols));
    }
  }

  if (dockTiles.length !== 2) {
    // Recover: pick two edge walkable tiles farthest apart.
    const edge = [...walkable].filter((t) => {
      const { x, y } = stationTileCoord(t, cols);
      return x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
    });
    dockTiles.length = 0;
    if (edge.length >= 2) {
      let bestA = edge[0]!;
      let bestB = edge[1]!;
      let bestD = -1;
      for (let i = 0; i < edge.length; i++) {
        for (let j = i + 1; j < edge.length; j++) {
          const a = stationTileCoord(edge[i]!, cols);
          const b = stationTileCoord(edge[j]!, cols);
          const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          if (d > bestD) {
            bestD = d;
            bestA = edge[i]!;
            bestB = edge[j]!;
          }
        }
      }
      dockTiles.push(bestA, bestB);
      entranceA = bestA;
      entranceB = bestB;
    }
  }

  const resolvedA = entranceA ?? dockTiles[0] ?? 0;
  const resolvedB = entranceB ?? dockTiles[1] ?? resolvedA;

  // Layer by distance from crown (higher = deeper toward crown for UI hints).
  const layerCount = 8;
  const layerByTile = new Map<number, number>();
  const { neighbors } = buildStationGrid();
  const dist = new Map<number, number>([[crownTile, 0]]);
  const q = [crownTile];
  let head = 0;
  let maxD = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    const d = dist.get(cur)!;
    maxD = Math.max(maxD, d);
    for (const n of neighbors[cur] ?? []) {
      if (!walkable.has(n) || dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  for (const t of walkable) {
    const d = dist.get(t) ?? maxD;
    const layer = Math.min(
      layerCount - 1,
      Math.max(0, Math.floor((1 - d / Math.max(1, maxD)) * (layerCount - 1))),
    );
    layerByTile.set(t, layer);
  }

  return {
    layoutId,
    walkable,
    dockTiles: [resolvedA, resolvedB],
    entranceA: resolvedA,
    entranceB: resolvedB,
    crownTile,
    chamberTiles: [],
    layerByTile,
    layerCount,
    cols,
    rows,
  };
}

/** Resolve catalog layout id for a warp-gate planet. */
export function resolveStationMazeId(
  planetId: string,
  explicitId?: number | null,
): number {
  if (explicitId != null && Number.isFinite(explicitId)) {
    return clampStationMazeId(explicitId);
  }
  return stationMazeIdFromPlanetId(planetId);
}

/**
 * Load a fixed catalog maze for a warp gate.
 * Pass `layoutId` (0–11) or a planet id string (legacy) / resolved id.
 */
export function buildStationMaze(
  planetIdOrLayoutId: string | number,
  explicitLayoutId?: number | null,
): StationMaze {
  const layoutId =
    typeof planetIdOrLayoutId === "number"
      ? clampStationMazeId(planetIdOrLayoutId)
      : resolveStationMazeId(planetIdOrLayoutId, explicitLayoutId);

  const hit = mazeCache.get(layoutId);
  if (hit) return hit;

  const maze = parseAsciiMaze(layoutId);
  mazeCache.set(layoutId, maze);
  return maze;
}

export function clearStationMazeCache() {
  mazeCache.clear();
}

export { STATION_MAZE_CATALOG_COUNT };
