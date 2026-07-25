import type { City, Faction, PlanetStructure } from "../types/campaign";
import type { HexSphere, Vec3 } from "./hexSphere";
import { tileOwnerMap } from "./settlements";

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function parseColor(hex: string) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 0.7, g: 0.75, b: 0.8 };
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

/**
 * Draw a full perimeter for every owned tile in its faction color,
 * plus a brighter edge where two different empires meet.
 */
export function buildFactionBorders(
  sphere: HexSphere,
  cities: City[],
  factions: Faction[],
  radius: number,
  tileClaims?: Record<string, string>,
  structures: PlanetStructure[] = [],
): { positions: Float32Array; colors: Float32Array } {
  const owners = tileOwnerMap(cities, tileClaims, structures);
  const positions: number[] = [];
  const colors: number[] = [];

  const colorFor = (factionId: string | undefined) => {
    const hex = factions.find((f) => f.id === factionId)?.color ?? "#8a9aab";
    return parseColor(hex);
  };

  const pushEdge = (
    p0: Vec3,
    p1: Vec3,
    c0: { r: number; g: number; b: number },
    c1: { r: number; g: number; b: number },
    r: number,
  ) => {
    const a = scale(normalize(p0), r);
    const b = scale(normalize(p1), r);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
  };

  // Full outline of each owned tile in that empire's color
  for (let i = 0; i < sphere.tiles.length; i++) {
    const owner = owners.get(i);
    if (!owner) continue;
    const tile = sphere.tiles[i]!;
    const col = colorFor(owner);
    const ring = tile.ring;
    for (let e = 0; e < ring.length; e++) {
      const p0 = ring[e]!;
      const p1 = ring[(e + 1) % ring.length]!;
      pushEdge(p0, p1, col, col, radius * 1.014);
    }
  }

  // Emphasize frontiers between different empires
  const seen = new Set<string>();
  for (let i = 0; i < sphere.tiles.length; i++) {
    for (const j of sphere.neighbors[i] ?? []) {
      if (j <= i) continue;
      const key = `${i}:${j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const oi = owners.get(i);
      const oj = owners.get(j);
      if (!oi || !oj || oi === oj) continue;

      const tileA = sphere.tiles[i]!;
      const tileB = sphere.tiles[j]!;
      // Shared edge ≈ two verts of A closest to B
      const scored = tileA.ring
        .map((p) => ({
          p,
          d: p.x * tileB.center.x + p.y * tileB.center.y + p.z * tileB.center.z,
        }))
        .sort((a, b) => b.d - a.d);
      const p0 = scored[0]?.p;
      const p1 = scored[1]?.p;
      if (!p0 || !p1) continue;
      const ca = colorFor(oi);
      const cb = colorFor(oj);
      pushEdge(p0, p1, ca, cb, radius * 1.022);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}
