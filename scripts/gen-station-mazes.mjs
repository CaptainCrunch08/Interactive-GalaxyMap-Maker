/**
 * Build 20 fixed 16×16 station mazes:
 * - crown chamber 3×3 at center with exactly TWO openings
 * - entrance A and B each connected by exactly one corridor to one opening
 * - dead-end spurs allowed, but no extra doors into the crown
 */
import fs from "node:fs";

const COLS = 16;
const ROWS = 16;
const CX = 7;
const CY = 7;
const idx = (x, y) => y * COLS + x;
const inChamber = (x, y) =>
  x >= CX - 1 && x <= CX + 1 && y >= CY - 1 && y <= CY + 1;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(rng, a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function exitOutside(side) {
  if (side === "N") return [CX, CY - 2];
  if (side === "S") return [CX, CY + 2];
  if (side === "W") return [CX - 2, CY];
  return [CX + 2, CY];
}

/** Shortest path on empty board avoiding forbidden cells (and chamber except goal). */
function shortestPath(sx, sy, gx, gy, forbidden) {
  const start = idx(sx, sy);
  const goal = idx(gx, gy);
  const q = [[sx, sy]];
  const prev = new Map([[start, -1]]);
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    if (x === gx && y === gy) break;
    for (const [dx, dy] of shuffle(
      () => 0.5,
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ],
    )) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const ni = idx(nx, ny);
      if (prev.has(ni)) continue;
      if (forbidden.has(ni) && ni !== goal) continue;
      if (inChamber(nx, ny) && !(nx === gx && ny === gy)) continue;
      // Keep a sealed ring around the crown except the goal exit cell.
      if (
        Math.abs(nx - CX) <= 2 &&
        Math.abs(ny - CY) <= 2 &&
        !inChamber(nx, ny) &&
        ni !== goal
      ) {
        continue;
      }
      prev.set(ni, idx(x, y));
      q.push([nx, ny]);
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  let cur = goal;
  while (cur >= 0) {
    path.push([cur % COLS, Math.floor(cur / COLS)]);
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

/**
 * Carve a winding corridor from entrance to crown exit by growing a random
 * walk that stays connected, then connecting the tip to the exit.
 */
function carveWinding(wall, rng, sx, sy, gx, gy, reserved) {
  const pathCells = new Set([idx(sx, sy)]);
  wall[sy][sx] = false;
  wall[gy][gx] = false;

  // Seed a random DFS tree in open space (not reserved, not crown ring).
  const stack = [[sx, sy]];
  const visited = new Set([idx(sx, sy)]);
  let steps = 0;
  const targetLen = 18 + Math.floor(rng() * 22);
  while (stack.length && steps < targetLen) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs = shuffle(rng, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx <= 0 || ny <= 0 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
      if (inChamber(nx, ny)) continue;
      if (Math.abs(nx - CX) <= 2 && Math.abs(ny - CY) <= 2) continue;
      const ni = idx(nx, ny);
      if (reserved.has(ni) || visited.has(ni)) continue;
      visited.add(ni);
      pathCells.add(ni);
      wall[ny][nx] = false;
      stack.push([nx, ny]);
      steps++;
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }

  // Connect a random path cell (prefer tip) to the exit with a shortest path.
  const tips = [...pathCells];
  shuffle(rng, tips);
  let connected = false;
  for (const t of tips.slice(0, 12)) {
    const tx = t % COLS;
    const ty = Math.floor(t / COLS);
    const forbidden = new Set(reserved);
    // Don't reuse other path, but allow own cells.
    const sp = shortestPath(tx, ty, gx, gy, forbidden);
    if (!sp) continue;
    for (const [x, y] of sp) {
      wall[y][x] = false;
      pathCells.add(idx(x, y));
    }
    connected = true;
    break;
  }
  if (!connected) {
    const sp = shortestPath(sx, sy, gx, gy, reserved);
    if (!sp) return null;
    for (const [x, y] of sp) {
      wall[y][x] = false;
      pathCells.add(idx(x, y));
    }
  }

  // Dead-end spurs off this path only.
  const spurN = 1 + Math.floor(rng() * 3);
  const bases = [...pathCells];
  for (let s = 0; s < spurN; s++) {
    const base = bases[Math.floor(rng() * bases.length)];
    let x = base % COLS;
    let y = Math.floor(base / COLS);
    const len = 2 + Math.floor(rng() * 4);
    for (let k = 0; k < len; k++) {
      const dirs = shuffle(rng, [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
      let ok = false;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx <= 0 || ny <= 0 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
        if (Math.abs(nx - CX) <= 2 && Math.abs(ny - CY) <= 2) continue;
        if (reserved.has(idx(nx, ny))) continue;
        if (!wall[ny][nx]) continue;
        wall[ny][nx] = false;
        pathCells.add(idx(nx, ny));
        x = nx;
        y = ny;
        ok = true;
        break;
      }
      if (!ok) break;
    }
  }
  return pathCells;
}

function sealCrown(wall, exits) {
  for (let y = CY - 1; y <= CY + 1; y++) {
    for (let x = CX - 1; x <= CX + 1; x++) wall[y][x] = false;
  }
  for (let y = CY - 2; y <= CY + 2; y++) {
    for (let x = CX - 2; x <= CX + 2; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      if (inChamber(x, y)) continue;
      if (exits.has(idx(x, y))) {
        wall[y][x] = false;
        continue;
      }
      wall[y][x] = true;
    }
  }
}

function chamberOpenings(wall) {
  const openSet = new Set();
  for (let y = CY - 1; y <= CY + 1; y++) {
    for (let x = CX - 1; x <= CX + 1; x++) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (!inChamber(nx, ny) && !wall[ny][nx]) openSet.add(idx(nx, ny));
      }
    }
  }
  return openSet;
}

function reachable(wall, start) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const c = q.pop();
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (wall[ny][nx]) continue;
      const ni = idx(nx, ny);
      if (seen.has(ni)) continue;
      seen.add(ni);
      q.push(ni);
    }
  }
  return seen;
}

function build(seed) {
  const rng = mulberry32(seed);
  const wall = Array.from({ length: ROWS }, () => Array(COLS).fill(true));

  const sides = shuffle(rng, ["N", "S", "E", "W"]);
  const doorA = sides[0];
  const doorB = sides[1];
  const exitA = exitOutside(doorA);
  const exitB = exitOutside(doorB);
  const exits = new Set([idx(...exitA), idx(...exitB)]);
  sealCrown(wall, exits);

  const eA = [0, 0];
  const eB = [0, 0];
  if (seed % 2 === 0) {
    eA[0] = 1 + Math.floor(rng() * 14);
    eA[1] = 0;
    eB[0] = 1 + Math.floor(rng() * 14);
    eB[1] = ROWS - 1;
  } else {
    eA[0] = 0;
    eA[1] = 1 + Math.floor(rng() * 14);
    eB[0] = COLS - 1;
    eB[1] = 1 + Math.floor(rng() * 14);
  }

  const pathA = carveWinding(wall, rng, eA[0], eA[1], exitA[0], exitA[1], new Set());
  if (!pathA) return null;
  const pathB = carveWinding(wall, rng, eB[0], eB[1], exitB[0], exitB[1], pathA);
  if (!pathB) return null;
  sealCrown(wall, exits);

  const crown = idx(CX, CY);
  const fromA = reachable(wall, idx(...eA));
  const fromB = reachable(wall, idx(...eB));
  if (!fromA.has(crown) || !fromB.has(crown)) return null;
  if (chamberOpenings(wall).size !== 2) return null;

  const lines = [];
  for (let y = 0; y < ROWS; y++) {
    let row = "";
    for (let x = 0; x < COLS; x++) {
      if (x === eA[0] && y === eA[1]) row += "A";
      else if (x === eB[0] && y === eB[1]) row += "B";
      else if (x === CX && y === CY) row += "C";
      else row += wall[y][x] ? "#" : ".";
    }
    lines.push(row);
  }
  return { lines, openings: 2 };
}

const mazes = [];
for (let i = 0; i < 20; i++) {
  let best = null;
  for (let t = 0; t < 80; t++) {
    const r = build(8200 + i * 211 + t * 17);
    if (r) {
      best = r;
      break;
    }
  }
  if (!best) {
    console.error("FAILED maze", i);
    process.exit(1);
  }
  mazes.push(best);
  console.error(i, "ok openings", best.openings);
}

fs.writeFileSync(
  "scripts/maze-gen-out.json",
  JSON.stringify(mazes.map((m) => m.lines)),
);
console.error("wrote scripts/maze-gen-out.json");
