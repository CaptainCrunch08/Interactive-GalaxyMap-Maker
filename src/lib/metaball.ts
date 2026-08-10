export type Point = { x: number; y: number };

export type InfluenceSource = {
  x: number;
  y: number;
  radius: number;
};

/** Capsule kernel along a friendly link — smooth peanut merges, no bead waist. */
export type InfluenceSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius: number;
};

export type FactionInfluence = {
  id: string;
  color: string;
  sources: InfluenceSource[];
  /** Optional corridors between same-claim systems (hyperlane / near-miss). */
  segments?: InfluenceSegment[];
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

function kernelFromDist(dist: number, radius: number): number {
  const maxR = radius * 1.4;
  if (dist > maxR) return 0;
  const t = dist / radius;
  if (t <= 1) {
    const u = 1 - t * t;
    return u * u;
  }
  const u = 1 - (t - 1) / 0.4;
  return 0.2 * Math.max(0, u * u);
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { dist: number; cx: number; cy: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) {
    return { dist: Math.hypot(px - x1, py - y1), cx: x1, cy: y1 };
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  return { dist: Math.hypot(px - cx, py - cy), cx, cy };
}

/**
 * Soft kernel union (max, not sum). Summing stacked multi-star claims and
 * shoved frontiers toward smaller neighbors; max keeps midpoints fair.
 */
export function influenceAt(
  x: number,
  y: number,
  sources: InfluenceSource[],
): number {
  let v = 0;
  for (const s of sources) {
    const dist = Math.hypot(x - s.x, y - s.y);
    v = Math.max(v, kernelFromDist(dist, s.radius));
  }
  return v;
}

export function influenceForFaction(
  x: number,
  y: number,
  faction: FactionInfluence,
): number {
  let v = influenceAt(x, y, faction.sources);
  for (const seg of faction.segments ?? []) {
    const { dist } = distToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
    v = Math.max(v, kernelFromDist(dist, seg.radius));
  }
  return v;
}

function boundsForFaction(faction: FactionInfluence, pad: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, radius: number) => {
    const extent = radius * 1.45;
    minX = Math.min(minX, x - extent);
    minY = Math.min(minY, y - extent);
    maxX = Math.max(maxX, x + extent);
    maxY = Math.max(maxY, y + extent);
  };
  for (const s of faction.sources) grow(s.x, s.y, s.radius);
  for (const seg of faction.segments ?? []) {
    grow(seg.x1, seg.y1, seg.radius);
    grow(seg.x2, seg.y2, seg.radius);
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function boundsForSources(sources: InfluenceSource[], pad: number) {
  return boundsForFaction({ id: "", color: "", sources }, pad);
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
  const maxDim = 300;
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
      rings.push(ring);
    }
  }

  return rings;
}

/**
 * Chaikin + Laplacian — rounds grid stair-steps into organic curves.
 */
function smoothClosedRing(ring: Point[], passes = 4): Point[] {
  let pts = ring.slice();
  if (pts.length < 6) return pts;

  for (let pass = 0; pass < passes; pass++) {
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

  for (let pass = 0; pass < 3; pass++) {
    const next: Point[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]!;
      const cur = pts[i]!;
      const nxt = pts[(i + 1) % n]!;
      next.push({
        x: cur.x * 0.55 + (prev.x + nxt.x) * 0.225,
        y: cur.y * 0.55 + (prev.y + nxt.y) * 0.225,
      });
    }
    pts = next;
  }

  return pts;
}

/** Box blur — softens hard occupancy edges into organic fronts. */
function blurScalarField(
  values: Float32Array,
  cols: number,
  rows: number,
  passes = 5,
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
export function contourPaths(
  grid: Grid,
  threshold: number,
  smoothPasses = 2,
): Point[][] {
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
          const center = (v00 + v10 + v01 + v11) * 0.25 >= threshold;
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
          const center = (v00 + v10 + v01 + v11) * 0.25 >= threshold;
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

  return stitchSegments(segments, eps).map((r) =>
    smoothClosedRing(r, smoothPasses),
  );
}

export function ringsToPath(rings: Point[][]): string {
  return rings
    .map((ring) => {
      if (ring.length === 0) return "";
      if (ring.length < 3) {
        const [first, ...rest] = ring;
        let d = `M ${first!.x.toFixed(1)} ${first!.y.toFixed(1)}`;
        for (const p of rest) {
          d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        }
        return `${d} Z`;
      }
      // Midpoint quadratics — continuous curve without reshaping contacts.
      const n = ring.length;
      const mid = (a: Point, b: Point) => ({
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5,
      });
      const start = mid(ring[n - 1]!, ring[0]!);
      let d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
      for (let i = 0; i < n; i++) {
        const curr = ring[i]!;
        const next = ring[(i + 1) % n]!;
        const m = mid(curr, next);
        d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
      }
      return `${d} Z`;
    })
    .filter(Boolean)
    .join(" ");
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
    contourPaths(grid, threshold, 3),
    minArea,
    minLen,
  );
  return ringsToPath(rings);
}

/**
 * Competitive territories with Stellaris-like soft borders:
 * 1) Hard influence winners (loosened ~halfway reach from callers)
 * 2) Blur each faction occupancy so Voronoi flats become organic curves
 * 3) Contour the soft field — neighbors naturally leave a slim gap
 * Optional `neutralSources` (unclaimed) compete invisibly.
 */
export function buildCompetitiveTerritories(
  factions: FactionInfluence[],
  options?: {
    cellSize?: number;
    threshold?: number;
    pad?: number;
    /** Unclaimed systems — compete for space, never rendered. */
    neutralSources?: InfluenceSource[];
    /** Occupancy blur passes — higher = rounder, slightly gappier contacts. */
    blurPasses?: number;
  },
): {
  fills: TerritoryFill[];
  borders: TerritoryBorder[];
} {
  const active = factions.filter(
    (f) => f.sources.length > 0 || (f.segments?.length ?? 0) > 0,
  );
  if (active.length === 0) return { fills: [], borders: [] };

  const cellSize = options?.cellSize ?? 14;
  const threshold = options?.threshold ?? 0.4;
  const pad = options?.pad ?? 56;
  const blurPasses = options?.blurPasses ?? 6;
  const neutralSources = options?.neutralSources ?? [];
  const neutralFaction: FactionInfluence | null =
    neutralSources.length > 0
      ? { id: "__void__", color: "transparent", sources: neutralSources }
      : null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of active) {
    const b = boundsForFaction(f, pad);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (neutralFaction) {
    const b = boundsForFaction(neutralFaction, pad);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }

  const { resolvedCell, cols, rows } = resolveGrid(
    minX,
    minY,
    maxX,
    maxY,
    cellSize,
  );

  const competitors = neutralFaction ? [...active, neutralFaction] : active;
  const inflByFaction = competitors.map(() => new Float32Array(cols * rows));

  for (let j = 0; j < rows; j++) {
    const y = minY + j * resolvedCell;
    for (let i = 0; i < cols; i++) {
      const x = minX + i * resolvedCell;
      const idx = j * cols + i;
      for (let f = 0; f < competitors.length; f++) {
        inflByFaction[f]![idx] = influenceForFaction(x, y, competitors[f]!);
      }
    }
  }

  // Hard winners first (includes void). Empty space stays -1.
  const winners = new Int16Array(cols * rows);
  winners.fill(-1);
  for (let idx = 0; idx < winners.length; idx++) {
    let best = -1;
    let bestVal = threshold;
    for (let f = 0; f < competitors.length; f++) {
      const v = inflByFaction[f]![idx]!;
      if (v > bestVal) {
        bestVal = v;
        best = f;
      }
    }
    winners[idx] = best;
  }

  const minArea = resolvedCell * resolvedCell * 10;
  const minLen = resolvedCell * 8;
  const fills: TerritoryFill[] = [];
  const borders: TerritoryBorder[] = [];

  for (let f = 0; f < active.length; f++) {
    const occupancy = new Float32Array(cols * rows);
    for (let idx = 0; idx < occupancy.length; idx++) {
      occupancy[idx] = winners[idx] === f ? 1 : 0;
    }
    // Blur rounds straight midlines into soft complementary curves and
    // pulls neighbors slightly apart (Stellaris-style dark crease).
    const soft = blurScalarField(occupancy, cols, rows, blurPasses);

    const grid: Grid = {
      originX: minX,
      originY: minY,
      cols,
      rows,
      values: soft,
      cellSize: resolvedCell,
    };
    const rings = filterClosedRings(
      contourPaths(grid, 0.48, 5),
      minArea,
      minLen,
    );
    if (rings.length === 0) continue;

    const faction = active[f]!;
    const path = ringsToPath(rings);
    const kind = faction.kind ?? "owned";
    fills.push({
      id: faction.id,
      color: faction.color,
      path,
      kind,
      stripeColors: faction.stripeColors,
    });
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
