/** Goldberg-style hex/pent sphere from a subdivided icosahedron dual. */

export type Vec3 = { x: number; y: number; z: number };

export type HexTile = {
  /** Tile center on the unit sphere. */
  center: Vec3;
  /** Boundary vertices on the unit sphere (5 or 6). */
  ring: Vec3[];
};

export type HexSphere = {
  tiles: HexTile[];
  /** Neighbor tile indices for each tile. */
  neighbors: number[][];
};

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return v(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(a: Vec3, s: number): Vec3 {
  return v(a.x * s, a.y * s, a.z * s);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return v(a.x - b.x, a.y - b.y, a.z - b.z);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return v(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return scale(a, 1 / l);
}

function key(a: Vec3, digits = 6): string {
  const p = 10 ** digits;
  return `${Math.round(a.x * p)},${Math.round(a.y * p)},${Math.round(a.z * p)}`;
}

/** Regular unit icosahedron. */
function icosahedron(): { vertices: Vec3[]; faces: [number, number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: Vec3[] = [
    v(-1, t, 0),
    v(1, t, 0),
    v(-1, -t, 0),
    v(1, -t, 0),
    v(0, -1, t),
    v(0, 1, t),
    v(0, -1, -t),
    v(0, 1, -t),
    v(t, 0, -1),
    v(t, 0, 1),
    v(-t, 0, -1),
    v(-t, 0, 1),
  ].map(normalize);

  const faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  return { vertices: raw, faces };
}

/**
 * Subdivide each icosahedron face into frequency² triangles and project to the sphere.
 */
function subdivideIcosahedron(frequency: number): {
  vertices: Vec3[];
  faces: [number, number, number][];
} {
  const { vertices: baseVerts, faces: baseFaces } = icosahedron();
  const vertices: Vec3[] = [];
  const indexOf = new Map<string, number>();

  const getIndex = (p: Vec3) => {
    const k = key(p);
    const existing = indexOf.get(k);
    if (existing != null) return existing;
    const i = vertices.length;
    vertices.push(p);
    indexOf.set(k, i);
    return i;
  };

  const faces: [number, number, number][] = [];
  const f = Math.max(1, Math.floor(frequency));

  for (const [ia, ib, ic] of baseFaces) {
    const a = baseVerts[ia]!;
    const b = baseVerts[ib]!;
    const c = baseVerts[ic]!;

    const point = (i: number, j: number) => {
      // i along A→B, j along A→C; i+j <= f
      const k = f - i - j;
      return normalize(
        add(add(scale(a, k / f), scale(b, i / f)), scale(c, j / f)),
      );
    };

    const grid: number[][] = [];
    for (let i = 0; i <= f; i++) {
      grid[i] = [];
      for (let j = 0; j <= f - i; j++) {
        grid[i]![j] = getIndex(point(i, j));
      }
    }

    for (let i = 0; i < f; i++) {
      for (let j = 0; j < f - i; j++) {
        const v00 = grid[i]![j]!;
        const v10 = grid[i + 1]![j]!;
        const v01 = grid[i]![j + 1]!;
        faces.push([v00, v10, v01]);
        if (j + i + 1 < f) {
          const v11 = grid[i + 1]![j + 1]!;
          faces.push([v10, v11, v01]);
        }
      }
    }
  }

  return { vertices, faces };
}

/**
 * Build hex/pent tiles as the dual of a subdivided icosahedron.
 * Frequency 4 → ~162 tiles, 5 → ~252, 6 → ~362.
 * Results are cached per frequency (immutable geometry).
 */
const sphereCache = new Map<number, HexSphere>();

export function buildHexSphere(frequency = 5): HexSphere {
  const cached = sphereCache.get(frequency);
  if (cached) return cached;

  const { vertices, faces } = subdivideIcosahedron(frequency);

  // face centroids on the sphere
  const faceCenters = faces.map(([a, b, c]) =>
    normalize(add(add(vertices[a]!, vertices[b]!), vertices[c]!)),
  );

  // vertex → incident face indices
  const incident: number[][] = vertices.map(() => []);
  faces.forEach((face, fi) => {
    for (const vi of face) incident[vi]!.push(fi);
  });

  // Map original vertex index → tile index (skip verts with <5 faces)
  const vertexToTile = new Map<number, number>();
  const tiles: HexTile[] = [];

  for (let vi = 0; vi < vertices.length; vi++) {
    const center = vertices[vi]!;
    const faceIdxs = incident[vi]!;
    if (faceIdxs.length < 5) continue;

    const tangentRef = (() => {
      const up = Math.abs(center.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
      return normalize(cross(center, up));
    })();
    const bitangent = normalize(cross(center, tangentRef));

    const ordered = faceIdxs
      .map((fi) => {
        const fc = faceCenters[fi]!;
        const rel = sub(fc, scale(center, dot(fc, center)));
        const ang = Math.atan2(dot(rel, bitangent), dot(rel, tangentRef));
        return { ang, fc };
      })
      .sort((a, b) => a.ang - b.ang)
      .map((o) => o.fc);

    const ring = ordered.map((p) =>
      normalize(add(scale(p, 0.985), scale(center, 0.015))),
    );

    vertexToTile.set(vi, tiles.length);
    tiles.push({ center, ring });
  }

  const neighbors: number[][] = tiles.map(() => []);
  const edgeSeen = new Set<string>();
  for (const [a, b, c] of faces) {
    const edges: [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [u, w] of edges) {
      const tu = vertexToTile.get(u);
      const tw = vertexToTile.get(w);
      if (tu == null || tw == null || tu === tw) continue;
      const key = tu < tw ? `${tu}:${tw}` : `${tw}:${tu}`;
      if (edgeSeen.has(key)) continue;
      edgeSeen.add(key);
      neighbors[tu]!.push(tw);
      neighbors[tw]!.push(tu);
    }
  }

  const sphere: HexSphere = { tiles, neighbors };
  sphereCache.set(frequency, sphere);
  return sphere;
}

/** Graph distance (BFS) between two tiles on the hex sphere. */
export function hexTileDistance(
  sphere: HexSphere,
  start: number,
  goal: number,
): number {
  if (start === goal) return 0;
  const q = [start];
  let head = 0;
  const dist = new Map<number, number>([[start, 0]]);
  while (head < q.length) {
    const cur = q[head++]!;
    const d = dist.get(cur)!;
    for (const n of sphere.neighbors[cur] ?? []) {
      if (dist.has(n)) continue;
      if (n === goal) return d + 1;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Closest tile center to a direction on the unit sphere. */
export function nearestTileIndex(sphere: HexSphere, dir: Vec3): number {
  const d = normalize(dir);
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < sphere.tiles.length; i++) {
    const c = sphere.tiles[i]!.center;
    const dp = dot(c, d);
    if (dp > bestDot) {
      bestDot = dp;
      best = i;
    }
  }
  return best;
}
