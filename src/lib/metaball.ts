export type Point = { x: number; y: number };

export type InfluenceSource = {
  x: number;
  y: number;
  radius: number;
};

export type FactionInfluence = {
  id: string;
  color: string;
  sources: InfluenceSource[];
  kind?: "owned" | "contested";
  /** For contested fills — the two faction colors used in diagonal stripes. */
  stripeColors?: [string, string];
};

export type TerritoryFill = {
  id: string;
  color: string;
  path: string;
  kind: "owned" | "contested";
  stripeColors?: [string, string];
};

export type TerritoryBorder = {
  id: string;
  color: string;
  path: string;
  kind: "owned" | "contested";
  stripeColors?: [string, string];
};

/** Soft kernel — overlapping same-faction sources blend into one blob. */
export function influenceAt(
  x: number,
  y: number,
  sources: InfluenceSource[],
): number {
  let v = 0;
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    const d2 = dx * dx + dy * dy;
    const r = s.radius;
    const maxR = r * 1.4;
    if (d2 > maxR * maxR) continue;
    const t = Math.sqrt(d2) / r;
    if (t <= 1) {
      const u = 1 - t * t;
      v += u * u;
    } else {
      const u = 1 - (t - 1) / 0.4;
      v += 0.2 * Math.max(0, u * u);
    }
  }
  return v;
}

function boundsForSources(sources: InfluenceSource[], pad: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of sources) {
    const extent = s.radius * 1.45;
    minX = Math.min(minX, s.x - extent);
    minY = Math.min(minY, s.y - extent);
    maxX = Math.max(maxX, s.x + extent);
    maxY = Math.max(maxY, s.y + extent);
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function resolveGrid(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  cellSize: number,
) {
  let resolvedCell = cellSize;
  let cols = Math.ceil((maxX - minX) / resolvedCell) + 1;
  let rows = Math.ceil((maxY - minY) / resolvedCell) + 1;
  const maxDim = 220;
  if (cols > maxDim || rows > maxDim) {
    resolvedCell = Math.max(
      cellSize,
      Math.max(maxX - minX, maxY - minY) / maxDim,
    );
    cols = Math.ceil((maxX - minX) / resolvedCell) + 1;
    rows = Math.ceil((maxY - minY) / resolvedCell) + 1;
  }
  return { resolvedCell, cols, rows };
}

type Grid = {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  values: Float32Array;
  cellSize: number;
};

export function sampleInfluenceGrid(
  sources: InfluenceSource[],
  cellSize: number,
  pad: number,
): Grid | null {
  if (sources.length === 0) return null;
  const { minX, minY, maxX, maxY } = boundsForSources(sources, pad);
  const { resolvedCell, cols, rows } = resolveGrid(
    minX,
    minY,
    maxX,
    maxY,
    cellSize,
  );
  const values = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = minY + j * resolvedCell;
    for (let i = 0; i < cols; i++) {
      const x = minX + i * resolvedCell;
      values[j * cols + i] = influenceAt(x, y, sources);
    }
  }
  return {
    originX: minX,
    originY: minY,
    cols,
    rows,
    values,
    cellSize: resolvedCell,
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function edgePoint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  v0: number,
  v1: number,
  threshold: number,
): Point {
  const t = Math.abs(v1 - v0) < 1e-8 ? 0.5 : (threshold - v0) / (v1 - v0);
  const u = Math.max(0, Math.min(1, t));
  return { x: lerp(x0, x1, u), y: lerp(y0, y1, u) };
}

function almostEqual(a: Point, b: Point, eps: number) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

function pathLength(ring: Point[]): number {
  let len = 0;
  for (let i = 1; i < ring.length; i++) {
    len += Math.hypot(
      ring[i]!.x - ring[i - 1]!.x,
      ring[i]!.y - ring[i - 1]!.y,
    );
  }
  if (ring.length > 2) {
    len += Math.hypot(
      ring[0]!.x - ring[ring.length - 1]!.x,
      ring[0]!.y - ring[ring.length - 1]!.y,
    );
  }
  return len;
}

function ringArea(ring: Point[]): number {
  let a = 0;
  const n = ring.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const p0 = ring[i]!;
    const p1 = ring[(i + 1) % n]!;
    a += p0.x * p1.y - p1.x * p0.y;
  }
  return Math.abs(a) * 0.5;
}

function stitchSegments(
  segments: Array<[Point, Point]>,
  eps: number,
): Point[][] {
  const unused = segments.map((s) => [...s] as [Point, Point]);
  const rings: Point[][] = [];

  while (unused.length > 0) {
    const first = unused.pop()!;
    const ring: Point[] = [first[0], first[1]];
    let guard = 0;
    while (guard++ < 100000) {
      const head = ring[0]!;
      const tail = ring[ring.length - 1]!;
      let found = false;
      for (let i = 0; i < unused.length; i++) {
        const [a, b] = unused[i]!;
        if (almostEqual(tail, a, eps)) {
          ring.push(b);
          unused.splice(i, 1);
          found = true;
          break;
        }
        if (almostEqual(tail, b, eps)) {
          ring.push(a);
          unused.splice(i, 1);
          found = true;
          break;
        }
        if (almostEqual(head, a, eps)) {
          ring.unshift(b);
          unused.splice(i, 1);
          found = true;
          break;
        }
        if (almostEqual(head, b, eps)) {
          ring.unshift(a);
          unused.splice(i, 1);
          found = true;
          break;
        }
      }
      if (!found) break;
      if (almostEqual(ring[0]!, ring[ring.length - 1]!, eps)) break;
    }
    if (
      ring.length >= 4 &&
      almostEqual(ring[0]!, ring[ring.length - 1]!, eps * 2)
    ) {
      rings.push(ring.slice(0, -1));
    } else if (ring.length >= 8) {
      // Nearly-closed noisy ring — force close
      rings.push(ring);
    }
  }

  return rings;
}

function smoothClosedRing(ring: Point[]): Point[] {
  let pts = ring.slice();
  if (pts.length < 6) return pts;

  // Chaikin corner-cutting — more passes = rounder Stellaris-like blobs
  for (let pass = 0; pass < 4; pass++) {
    const next: Point[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i]!;
      const p1 = pts[(i + 1) % n]!;
      next.push(
        { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 },
        { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 },
      );
    }
    pts = next;
  }

  // Light Laplacian relax to knock down remaining ripples
  for (let pass = 0; pass < 2; pass++) {
    const next: Point[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]!;
      const cur = pts[i]!;
      const nxt = pts[(i + 1) % n]!;
      next.push({
        x: cur.x * 0.5 + (prev.x + nxt.x) * 0.25,
        y: cur.y * 0.5 + (prev.y + nxt.y) * 0.25,
      });
    }
    pts = next;
  }

  return pts;
}

/** Soften a binary occupancy field so marching-squares edges aren't stair-stepped. */
function blurScalarField(
  values: Float32Array,
  cols: number,
  rows: number,
  passes = 2,
): Float32Array {
  let cur = values;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(cur.length);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
            const w = di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1;
            sum += cur[jj * cols + ii]! * w;
            count += w;
          }
        }
        next[j * cols + i] = sum / count;
      }
    }
    cur = next;
  }
  return cur;
}

function filterClosedRings(rings: Point[][], minArea: number, minLen: number) {
  return rings.filter(
    (r) => ringArea(r) >= minArea && pathLength(r) >= minLen,
  );
}

/** Marching squares → closed rings where value >= threshold. */
export function contourPaths(grid: Grid, threshold: number): Point[][] {
  const { cols, rows, values, originX, originY, cellSize } = grid;
  const segments: Array<[Point, Point]> = [];
  const eps = Math.max(0.75, cellSize * 0.25);

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const i00 = j * cols + i;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;

      const v00 = values[i00]!;
      const v10 = values[i10]!;
      const v01 = values[i01]!;
      const v11 = values[i11]!;

      const x0 = originX + i * cellSize;
      const y0 = originY + j * cellSize;
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;

      let code = 0;
      if (v00 >= threshold) code |= 1;
      if (v10 >= threshold) code |= 2;
      if (v11 >= threshold) code |= 4;
      if (v01 >= threshold) code |= 8;
      if (code === 0 || code === 15) continue;

      const top = () => edgePoint(x0, y0, x1, y0, v00, v10, threshold);
      const right = () => edgePoint(x1, y0, x1, y1, v10, v11, threshold);
      const bottom = () => edgePoint(x0, y1, x1, y1, v01, v11, threshold);
      const left = () => edgePoint(x0, y0, x0, y1, v00, v01, threshold);

      // Ambiguous saddles: pick one consistent diagonal to avoid fragments
      switch (code) {
        case 1:
        case 14:
          segments.push([left(), top()]);
          break;
        case 2:
        case 13:
          segments.push([top(), right()]);
          break;
        case 3:
        case 12:
          segments.push([left(), right()]);
          break;
        case 4:
        case 11:
          segments.push([right(), bottom()]);
          break;
        case 5: {
          const center =
            (v00 + v10 + v01 + v11) * 0.25 >= threshold;
          if (center) {
            segments.push([left(), bottom()]);
            segments.push([top(), right()]);
          } else {
            segments.push([left(), top()]);
            segments.push([right(), bottom()]);
          }
          break;
        }
        case 6:
        case 9:
          segments.push([top(), bottom()]);
          break;
        case 7:
        case 8:
          segments.push([left(), bottom()]);
          break;
        case 10: {
          const center =
            (v00 + v10 + v01 + v11) * 0.25 >= threshold;
          if (center) {
            segments.push([left(), top()]);
            segments.push([right(), bottom()]);
          } else {
            segments.push([top(), right()]);
            segments.push([left(), bottom()]);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return stitchSegments(segments, eps).map(smoothClosedRing);
}

export function ringsToPath(rings: Point[][]): string {
  return rings
    .map((ring) => {
      if (ring.length === 0) return "";
      const [first, ...rest] = ring;
      let d = `M ${first!.x.toFixed(1)} ${first!.y.toFixed(1)}`;
      for (const p of rest) {
        d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
      return `${d} Z`;
    })
    .filter(Boolean)
    .join(" ");
}

function denoiseWinners(
  winners: Int16Array,
  cols: number,
  rows: number,
): Int16Array {
  const out = new Int16Array(winners);
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const idx = j * cols + i;
      const self = winners[idx]!;
      const counts = new Map<number, number>();
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const w = winners[(j + dj) * cols + (i + di)]!;
          counts.set(w, (counts.get(w) ?? 0) + 1);
        }
      }
      let best = self;
      let bestN = -1;
      for (const [w, n] of counts) {
        if (n > bestN) {
          bestN = n;
          best = w;
        }
      }
      if ((counts.get(self) ?? 0) <= 2) out[idx] = best;
    }
  }
  return out;
}

export function buildMergedTerritoryPath(
  sources: InfluenceSource[],
  options?: { cellSize?: number; threshold?: number; pad?: number },
): string {
  const cellSize = options?.cellSize ?? 28;
  const threshold = options?.threshold ?? 0.42;
  const pad = options?.pad ?? 40;
  const grid = sampleInfluenceGrid(sources, cellSize, pad);
  if (!grid) return "";
  const minArea = grid.cellSize * grid.cellSize * 10;
  const minLen = grid.cellSize * 10;
  const rings = filterClosedRings(
    contourPaths(grid, threshold),
    minArea,
    minLen,
  );
  return ringsToPath(rings);
}

/**
 * Competitive territories: fills meet cleanly; each faction gets its own
 * inset border stroke so contact zones show two parallel faction colors
 * (Stellaris-style), never a mixed/alternating midline.
 */
export function buildCompetitiveTerritories(
  factions: FactionInfluence[],
  options?: {
    cellSize?: number;
    threshold?: number;
    pad?: number;
  },
): {
  fills: TerritoryFill[];
  borders: TerritoryBorder[];
} {
  const active = factions.filter((f) => f.sources.length > 0);
  if (active.length === 0) return { fills: [], borders: [] };

  const cellSize = options?.cellSize ?? 24;
  const threshold = options?.threshold ?? 0.4;
  const pad = options?.pad ?? 40;

  const allSources = active.flatMap((f) => f.sources);
  const { minX, minY, maxX, maxY } = boundsForSources(allSources, pad);
  const { resolvedCell, cols, rows } = resolveGrid(
    minX,
    minY,
    maxX,
    maxY,
    cellSize,
  );

  const winnersRaw = new Int16Array(cols * rows);
  winnersRaw.fill(-1);

  for (let j = 0; j < rows; j++) {
    const y = minY + j * resolvedCell;
    for (let i = 0; i < cols; i++) {
      const x = minX + i * resolvedCell;
      const idx = j * cols + i;
      let best = -1;
      let bestVal = threshold;
      for (let f = 0; f < active.length; f++) {
        const v = influenceAt(x, y, active[f]!.sources);
        if (v > bestVal) {
          bestVal = v;
          best = f;
        }
      }
      winnersRaw[idx] = best;
    }
  }

  const winners = denoiseWinners(winnersRaw, cols, rows);
  const minArea = resolvedCell * resolvedCell * 14;
  const minLen = resolvedCell * 12;

  const fills: TerritoryFill[] = [];
  const borders: TerritoryBorder[] = [];

  for (let f = 0; f < active.length; f++) {
    const faction = active[f]!;
    const values = new Float32Array(cols * rows);
    for (let idx = 0; idx < winners.length; idx++) {
      values[idx] = winners[idx] === f ? 1 : 0;
    }
    // Blur occupancy before contouring → organic smooth borders
    const soft = blurScalarField(values, cols, rows, 3);
    const grid: Grid = {
      originX: minX,
      originY: minY,
      cols,
      rows,
      values: soft,
      cellSize: resolvedCell,
    };
    const rings = filterClosedRings(
      contourPaths(grid, 0.45),
      minArea,
      minLen,
    );
    if (rings.length === 0) continue;

    const path = ringsToPath(rings);
    const kind = faction.kind ?? "owned";
    fills.push({
      id: faction.id,
      color: faction.color,
      path,
      kind,
      stripeColors: faction.stripeColors,
    });
    // Same path as fill — stroke is clipped to the fill in the renderer so
    // adjacent borders meet flush instead of overlapping across the edge.
    borders.push({
      id: faction.id,
      color: faction.color,
      path,
      kind,
      stripeColors: faction.stripeColors,
    });
  }

  return { fills, borders };
}
