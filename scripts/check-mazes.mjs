import { clearStationMazeCache, buildStationMaze } from "../src/lib/stationMaze.ts";
import { buildStationGrid, stationTileCoord } from "../src/lib/stationHex.ts";

clearStationMazeCache();
const { neighbors } = buildStationGrid();

function reachable(maze, start) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const c = q.pop();
    for (const n of neighbors[c] || []) {
      if (!maze.walkable.has(n) || seen.has(n)) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}

function openings(maze) {
  const { x: cx, y: cy } = stationTileCoord(maze.crownTile);
  const opens = new Set();
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      const t = y * 16 + x;
      for (const n of neighbors[t] || []) {
        const { x: nx, y: ny } = stationTileCoord(n);
        if (nx < cx - 1 || nx > cx + 1 || ny < cy - 1 || ny > cy + 1) {
          if (maze.walkable.has(n)) opens.add(n);
        }
      }
    }
  }
  return opens;
}

for (let i = 0; i < 20; i++) {
  const m = buildStationMaze(i);
  const fromA = reachable(m, m.entranceA);
  const fromB = reachable(m, m.entranceB);
  console.log(
    i,
    "A->C",
    fromA.has(m.crownTile),
    "B->C",
    fromB.has(m.crownTile),
    "opens",
    openings(m).size,
    "A↔B",
    fromA.has(m.entranceB),
  );
}
