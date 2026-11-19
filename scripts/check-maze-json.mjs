import fs from "node:fs";

const mazes = JSON.parse(fs.readFileSync("scripts/maze-gen-out.json", "utf8"));
const COLS = 16;
const ROWS = 16;
const idx = (x, y) => y * COLS + x;

function parse(rows) {
  const wall = Array.from({ length: ROWS }, () => Array(COLS).fill(true));
  let a = null;
  let b = null;
  let c = null;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = rows[y][x];
      if (ch !== "#") wall[y][x] = false;
      if (ch === "A") a = idx(x, y);
      if (ch === "B") b = idx(x, y);
      if (ch === "C") c = idx(x, y);
    }
  }
  // force 3x3 chamber
  const cx = c % COLS;
  const cy = Math.floor(c / COLS);
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) wall[y][x] = false;
    }
  }
  return { wall, a, b, c, cx, cy };
}

function reach(wall, start) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const cur = q.pop();
    const x = cur % COLS;
    const y = Math.floor(cur / COLS);
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

function openings(wall, cx, cy) {
  const open = new Set();
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const inC = nx >= cx - 1 && nx <= cx + 1 && ny >= cy - 1 && ny <= cy + 1;
        if (!inC && !wall[ny][nx]) open.add(idx(nx, ny));
      }
    }
  }
  return open;
}

let bad = 0;
mazes.forEach((rows, i) => {
  const m = parse(rows);
  const fromA = reach(m.wall, m.a);
  const fromB = reach(m.wall, m.b);
  const opens = openings(m.wall, m.cx, m.cy).size;
  const ok = fromA.has(m.c) && fromB.has(m.c) && opens === 2;
  if (!ok) {
    bad++;
    console.log("BAD", i, {
      aToC: fromA.has(m.c),
      bToC: fromB.has(m.c),
      opens,
    });
  } else {
    console.log("OK", i, "opens", opens);
  }
});
console.log("badCount", bad);
