import {
  buildStationGrid,
  stationTileCoord,
  stationTileIndex,
  STATION_GRID_COLS,
  STATION_GRID_ROWS,
} from "./stationHex";

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(id: string): number {
  let s = 2166136261;
  for (let i = 0; i < id.length; i++) {
    s ^= id.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  return s >>> 0;
}

function shuffle<T>(rng: Rng, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export type StationMaze = {
  walkable: Set<number>;
  /** Boarding entry tiles along the bottom apron. */
  dockTiles: number[];
  /** Relay crown chamber (near the top). */
  crownTile: number;
  /** Objective / glow chamber centers (mid-maze). */
  chamberTiles: number[];
  /**
   * Deck index: 0 = docking apron (bottom), higher climbs toward the crown.
   */
  layerByTile: Map<number, number>;
  layerCount: number;
  cols: number;
  rows: number;
};

const mazeCache = new Map<string, StationMaze>();

/**
 * Procedural orthogonal square-tile station maze.
 * Each warp gate id yields a stable but unique corridor layout:
 * boarding locks at the bottom, Relay Crown near the top.
 */
export function buildStationMaze(planetId: string): StationMaze {
  const cacheKey = `${planetId}:sq-v2:${STATION_GRID_COLS}x${STATION_GRID_ROWS}`;
  const hit = mazeCache.get(cacheKey);
  if (hit) return hit;

  const rng = mulberry32(seedFromString(planetId + ":sq-maze-v2"));
  const grid = buildStationGrid();
  const { cols, rows, neighbors } = grid;

  // Classic odd-cell maze: corridor cells on odd coords, walls on even.
  const isCell = (x: number, y: number) => x % 2 === 1 && y % 2 === 1;
  const cells: number[] = [];
  for (let y = 1; y < rows - 1; y += 2) {
    for (let x = 1; x < cols - 1; x += 2) {
      cells.push(stationTileIndex(x, y, cols));
    }
  }

  const walkable = new Set<number>();
  const visited = new Set<number>();

  // Bias corridor growth: some stations favor long vertical climbs,
  // others sprawl sideways (seeded per gate).
  const verticalBias = 0.35 + rng() * 0.5;

  const cellNeighbors = (tile: number): number[] => {
    const { x, y } = stationTileCoord(tile, cols);
    const dirs = shuffle(rng, [
      { dx: 2, dy: 0, w: 1 - verticalBias },
      { dx: -2, dy: 0, w: 1 - verticalBias },
      { dx: 0, dy: 2, w: verticalBias },
      { dx: 0, dy: -2, w: verticalBias },
    ] as const);
    // Weighted shuffle: higher weight dirs tend to come first.
    dirs.sort((a, b) => b.w + rng() * 0.35 - (a.w + rng() * 0.35));
    const out: number[] = [];
    for (const { dx, dy } of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1) continue;
      if (!isCell(nx, ny)) continue;
      out.push(stationTileIndex(nx, ny, cols));
    }
    return out;
  };

  const wallBetween = (a: number, b: number): number => {
    const ca = stationTileCoord(a, cols);
    const cb = stationTileCoord(b, cols);
    return stationTileIndex((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, cols);
  };

  // Start near the bottom so docks naturally feed into the maze.
  const bottomCells = cells.filter((c) => {
    const { y } = stationTileCoord(c, cols);
    return y >= rows - 8;
  });
  const startCell =
    bottomCells[Math.floor(rng() * bottomCells.length)] ??
    cells[Math.floor(rng() * cells.length)]!;

  const stack = [startCell];
  visited.add(startCell);
  walkable.add(startCell);

  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    const unused = cellNeighbors(cur).filter((n) => !visited.has(n));
    if (!unused.length) {
      stack.pop();
      continue;
    }
    const next = unused[0]!;
    visited.add(next);
    walkable.add(next);
    walkable.add(wallBetween(cur, next));
    stack.push(next);
  }

  // Bridge any disconnected pockets.
  for (const c of shuffle(rng, cells)) {
    if (visited.has(c)) continue;
    visited.add(c);
    walkable.add(c);
    const bridge = cellNeighbors(c).find((n) => walkable.has(n));
    if (bridge != null) walkable.add(wallBetween(c, bridge));
  }

  // --- Boarding locks: 2–4 vertical shafts from the bottom edge ---
  const dockCount = randInt(rng, 2, 4);
  const dockXs: number[] = [];
  for (let attempt = 0; attempt < 24 && dockXs.length < dockCount; attempt++) {
    let x = randInt(rng, 2, cols - 3);
    if (x % 2 === 0) x += rng() < 0.5 ? 1 : -1;
    x = Math.max(1, Math.min(cols - 2, x));
    if (dockXs.some((ox) => Math.abs(ox - x) < 3)) continue;
    dockXs.push(x);
  }
  while (dockXs.length < 2) {
    let x = Math.round(((dockXs.length + 1) / 3) * (cols - 1));
    if (x % 2 === 0) x += 1;
    dockXs.push(Math.max(1, Math.min(cols - 2, x)));
  }

  const dockTiles: number[] = [];
  const shaftLen = randInt(rng, 4, 7);
  for (const x of dockXs) {
    for (let y = rows - 1; y >= rows - shaftLen; y--) {
      walkable.add(stationTileIndex(x, y, cols));
    }
    const dock = stationTileIndex(x, rows - 1, cols);
    dockTiles.push(dock);
    const linkY = rows - shaftLen;
    const lx = x % 2 === 1 ? x : Math.max(1, x - 1);
    const ly = linkY % 2 === 1 ? linkY : Math.max(1, linkY - 1);
    const link = stationTileIndex(lx, ly, cols);
    walkable.add(link);
    connectOrtho(neighbors, walkable, dock, link);
  }

  // --- Crown chamber near the top (offset left/right per seed) ---
  let crownX = Math.floor(cols / 2) + randInt(rng, -4, 4);
  if (crownX % 2 === 0) crownX += rng() < 0.5 ? 1 : -1;
  crownX = Math.max(3, Math.min(cols - 4, crownX));
  let crownY = randInt(rng, 2, 5);
  if (crownY % 2 === 0) crownY += 1;
  const crownTile = stationTileIndex(crownX, crownY, cols);
  const crownRx = randInt(rng, 1, 2);
  const crownRy = randInt(rng, 1, 2);
  carveRoom(walkable, cols, rows, crownX, crownY, crownRx, crownRy);
  connectOrtho(neighbors, walkable, crownTile, startCell);

  // --- Glow chambers scattered through mid decks ---
  const chamberTiles: number[] = [];
  const chamberCount = randInt(rng, 2, 5);
  for (let n = 0; n < chamberCount; n++) {
    let cx = randInt(rng, 3, cols - 4);
    let cy = randInt(rng, 6, rows - 8);
    if (cx % 2 === 0) cx += 1;
    if (cy % 2 === 0) cy += 1;
    cx = Math.max(3, Math.min(cols - 4, cx));
    cy = Math.max(5, Math.min(rows - 6, cy));
    // Avoid overlapping crown / other chambers.
    if (
      Math.abs(cx - crownX) + Math.abs(cy - crownY) < 5 ||
      chamberTiles.some((t) => {
        const c = stationTileCoord(t, cols);
        return Math.abs(c.x - cx) + Math.abs(c.y - cy) < 4;
      })
    ) {
      continue;
    }
    const center = stationTileIndex(cx, cy, cols);
    const rx = rng() < 0.35 ? 2 : 1;
    const ry = rng() < 0.35 ? 2 : 1;
    carveRoom(walkable, cols, rows, cx, cy, rx, ry);
    chamberTiles.push(center);
    const nearby = [...walkable].find((t) => {
      if (t === center) return false;
      const c = stationTileCoord(t, cols);
      return Math.abs(c.x - cx) + Math.abs(c.y - cy) <= 5;
    });
    if (nearby != null) connectOrtho(neighbors, walkable, center, nearby);
  }

  // Extra loops / shortcuts — density varies by gate.
  const loopCount = randInt(rng, 8, 22);
  for (let n = 0; n < loopCount; n++) {
    const a = cells[Math.floor(rng() * cells.length)]!;
    const opts = cellNeighbors(a).filter((b) => walkable.has(b));
    if (!opts.length) continue;
    const b = opts[Math.floor(rng() * opts.length)]!;
    if (rng() < 0.7) walkable.add(wallBetween(a, b));
  }

  // Occasional dead-end niches branching off corridors.
  const nicheCount = randInt(rng, 3, 9);
  for (let n = 0; n < nicheCount; n++) {
    const base = [...walkable][Math.floor(rng() * walkable.size)]!;
    const { x, y } = stationTileCoord(base, cols);
    const opts = shuffle(rng, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const);
    for (const [dx, dy] of opts) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1) continue;
      const t = stationTileIndex(nx, ny, cols);
      if (walkable.has(t)) continue;
      walkable.add(t);
      break;
    }
  }

  // Guarantee a climb path from every dock to the crown.
  for (const dock of dockTiles) {
    connectOrtho(neighbors, walkable, dock, crownTile);
  }

  // Layer map by row (bottom = 0).
  const layerCount = 8;
  const layerByTile = new Map<number, number>();
  for (const t of walkable) {
    const { y } = stationTileCoord(t, cols);
    const tNorm = 1 - y / Math.max(1, rows - 1);
    const layer = Math.min(
      layerCount - 1,
      Math.max(0, Math.floor(tNorm * layerCount)),
    );
    layerByTile.set(t, layer);
  }

  const maze: StationMaze = {
    walkable,
    dockTiles,
    crownTile,
    chamberTiles,
    layerByTile,
    layerCount,
    cols,
    rows,
  };
  mazeCache.set(cacheKey, maze);
  return maze;
}

function carveRoom(
  walkable: Set<number>,
  cols: number,
  rows: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1) continue;
      walkable.add(stationTileIndex(x, y, cols));
    }
  }
}

function connectOrtho(
  neighbors: number[][],
  walkable: Set<number>,
  start: number,
  goal: number,
) {
  if (start === goal) {
    walkable.add(start);
    return;
  }
  const q = [start];
  const prev = new Map<number, number>([[start, -1]]);
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    if (cur === goal) break;
    for (const n of neighbors[cur] ?? []) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      q.push(n);
    }
  }
  if (!prev.has(goal)) return;
  let cur: number | undefined = goal;
  while (cur != null && cur >= 0) {
    walkable.add(cur);
    cur = prev.get(cur);
  }
}

export function clearStationMazeCache() {
  mazeCache.clear();
}
