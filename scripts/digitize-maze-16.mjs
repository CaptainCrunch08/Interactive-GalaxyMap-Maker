import fs from "node:fs";
import { PNG } from "pngjs";

const buf = fs.readFileSync(
  "C:/Users/scott/.cursor/projects/c-Users-scott-projects/assets/image-2dd870ce-4daa-408c-bfd8-651c0f332b78.png",
);
const png = PNG.sync.read(buf);
const { width, height, data } = png;

function isWall(x, y) {
  x = Math.max(0, Math.min(width - 1, Math.round(x)));
  y = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (width * y + x) << 2;
  return data[i + 3] > 180 && data[i] + data[i + 1] + data[i + 2] < 280;
}

let minX = width,
  minY = height,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (isWall(x, y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}

// Build fine wall raster (64×64) over bbox — wall ink cells
const F = 64;
const fine = Array.from({ length: F }, () => Array(F).fill(false));
for (let fy = 0; fy < F; fy++) {
  for (let fx = 0; fx < F; fx++) {
    let dark = 0;
    let n = 0;
    const x0 = minX + (fx / F) * (maxX - minX);
    const y0 = minY + (fy / F) * (maxY - minY);
    const x1 = minX + ((fx + 1) / F) * (maxX - minX);
    const y1 = minY + ((fy + 1) / F) * (maxY - minY);
    for (let y = y0; y < y1; y += 0.8) {
      for (let x = x0; x < x1; x += 0.8) {
        n++;
        if (isWall(x, y)) dark++;
      }
    }
    fine[fy][fx] = n > 0 && dark / n > 0.08;
  }
}

// Print fine for debug (compressed)
console.log("fine 32x32 (every other):");
for (let y = 0; y < F; y += 2) {
  let row = "";
  for (let x = 0; x < F; x += 2) {
    row += fine[y][x] || fine[y][x + 1] || fine[y + 1]?.[x] || fine[y + 1]?.[x + 1]
      ? "#"
      : ".";
  }
  console.log(row);
}

/**
 * Convert line-maze to cell maze: a 16×16 cell is walkable if its
 * INTERIOR (not edges) is mostly free of wall ink. Wall cells are those
 * whose region is dominated by ink OR that sit on a wall stroke.
 *
 * Better: treat odd lines of a (2N+1) grid as walls (classic), detect
 * which walls exist from fine raster, then corridors are the cells.
 */
const N = 16;
// wall existence on horizontal edges between cells: hWall[y][x] = wall above cell (y,x), y in 0..N
const hWall = Array.from({ length: N + 1 }, () => Array(N).fill(false));
// vertical edges: vWall[y][x] = wall left of cell (y,x), x in 0..N
const vWall = Array.from({ length: N }, () => Array(N + 1).fill(false));

for (let y = 0; y <= N; y++) {
  for (let x = 0; x < N; x++) {
    // sample along the horizontal edge line in fine coords
    const fy = Math.round((y / N) * (F - 1));
    const fx0 = Math.round((x / N) * (F - 1));
    const fx1 = Math.round(((x + 1) / N) * (F - 1));
    let dark = 0;
    let n = 0;
    for (let fx = fx0; fx <= fx1; fx++) {
      for (let t = -1; t <= 1; t++) {
        const yy = Math.max(0, Math.min(F - 1, fy + t));
        n++;
        if (fine[yy][fx]) dark++;
      }
    }
    hWall[y][x] = dark / n > 0.2;
  }
}
for (let y = 0; y < N; y++) {
  for (let x = 0; x <= N; x++) {
    const fx = Math.round((x / N) * (F - 1));
    const fy0 = Math.round((y / N) * (F - 1));
    const fy1 = Math.round(((y + 1) / N) * (F - 1));
    let dark = 0;
    let n = 0;
    for (let fy = fy0; fy <= fy1; fy++) {
      for (let t = -1; t <= 1; t++) {
        const xx = Math.max(0, Math.min(F - 1, fx + t));
        n++;
        if (fine[fy][xx]) dark++;
      }
    }
    vWall[y][x] = dark / n > 0.2;
  }
}

// Build walkable connectivity between adjacent cells (no wall between)
const walk = Array.from({ length: N }, () => Array(N).fill(true));
// Mark border cells: keep all interior walkable; borders are walkable too if openings

// Print which cells can go where - show as maze using wall cells approach:
// Represent as: cell is # if it's a "wall pillar" style — instead show corridors
// Our game needs cell = wall OR floor. Use: a cell is floor always, walls are between.
// But our engine uses cell walls. So convert edge-walls to cell-walls via thickening:
// Odd-odd = junction, etc. Simpler: make every cell floor, then block by inserting
// wall cells on a 16x16 where we collapse pairs.

// Alternate: 15 corridor + walls. For 16x16: use floor cells and mark a cell as wall
// if ANY of its 4 edge-walls are present AND the cell center has ink OR
// if the cell is mostly wall ink from fine.

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const fx0 = Math.round((x / N) * (F - 1));
    const fx1 = Math.round(((x + 1) / N) * (F - 1));
    const fy0 = Math.round((y / N) * (F - 1));
    const fy1 = Math.round(((y + 1) / N) * (F - 1));
    // sample interior only
    let dark = 0;
    let n = 0;
    const mx0 = fx0 + Math.floor((fx1 - fx0) * 0.25);
    const mx1 = fx0 + Math.floor((fx1 - fx0) * 0.75);
    const my0 = fy0 + Math.floor((fy1 - fy0) * 0.25);
    const my1 = fy0 + Math.floor((fy1 - fy0) * 0.75);
    for (let fy = my0; fy <= my1; fy++) {
      for (let fx = mx0; fx <= mx1; fx++) {
        n++;
        if (fine[fy][Math.max(0, Math.min(F - 1, fx))]) dark++;
      }
    }
    // Also: if all 4 surrounding edges are walls and cell is a "solid block" region
    walk[y][x] = dark / Math.max(1, n) < 0.25;
  }
}

// Force outer ring: wall except detected openings
for (let i = 0; i < N; i++) {
  // top/bottom: wall unless edge has opening (hWall missing)
  if (hWall[0][i]) walk[0][i] = false;
  if (hWall[N][i]) walk[N - 1][i] = false;
  if (vWall[i][0]) walk[i][0] = false;
  if (vWall[i][N]) walk[i][N - 1] = false;
}

console.log("\nwalkable (.=floor #=wall):");
for (let y = 0; y < N; y++) {
  console.log(walk[y].map((w) => (w ? "." : "#")).join(""));
}

// Detect openings on border: floor cells on edge
const opens = { top: [], bot: [], left: [], right: [] };
for (let i = 0; i < N; i++) {
  if (walk[0][i]) opens.top.push(i);
  if (walk[N - 1][i]) opens.bot.push(i);
  if (walk[i][0]) opens.left.push(i);
  if (walk[i][N - 1]) opens.right.push(i);
}
console.log("opens", opens);
