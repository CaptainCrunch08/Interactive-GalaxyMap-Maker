import {
  TERRAIN_KIND_ORDER,
  type TerrainKind,
} from "./planetTerrain";
import { buildHexSphere } from "./hexSphere";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";

/** Tile count on the strategic hex sphere (stable). */
export function strategicTileCount(): number {
  return buildHexSphere(SETTLEMENT_HEX_FREQUENCY).tiles.length;
}

/** Even split of 100% across all terrain kinds. */
export function equalTerrainPercents(): Record<TerrainKind, number> {
  const n = TERRAIN_KIND_ORDER.length;
  const base = Math.floor(100 / n);
  const out = {} as Record<TerrainKind, number>;
  let rem = 100;
  for (let i = 0; i < n; i++) {
    const kind = TERRAIN_KIND_ORDER[i]!;
    const v = i === n - 1 ? rem : base;
    out[kind] = v;
    rem -= v;
  }
  return out;
}

export function sumTerrainPercents(
  weights: Partial<Record<TerrainKind, number>>,
): number {
  let total = 0;
  for (const kind of TERRAIN_KIND_ORDER) {
    total += Math.max(0, Number(weights[kind]) || 0);
  }
  return total;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Intent curve: high world-share → few large bodies (oceans/continents);
 * low share → many small lakes/patches.
 * s = T/N (normalized share of the planet).
 */
export function seedCountForShare(target: number, tileCount: number): number {
  if (target <= 0 || tileCount <= 0) return 0;
  const s = clamp(0, 1, target / tileCount);
  const maxSeeds = Math.min(target, Math.max(1, Math.round(tileCount / 10)));
  return clamp(
    1,
    target,
    Math.round(1 + (maxSeeds - 1) * (1 - s) * (1 - s)),
  );
}

const HIGH_SHARE_THRESHOLD = 0.45;

/**
 * Terrain that must never sit under cities, districts, or structures.
 * Ocean/lava/chem spills are unbuildable or lethal; settlements stay on land.
 */
export const SETTLEMENT_FORBIDDEN_TERRAIN = new Set<TerrainKind>([
  "ocean",
  "lava",
  "toxic",
]);

export function isSettlementForbiddenTerrain(kind: TerrainKind): boolean {
  return SETTLEMENT_FORBIDDEN_TERRAIN.has(kind);
}

/** Safe defaults when painting over settlements with a forbidden kind. */
export const SETTLEMENT_LAND_FALLBACK: TerrainKind = "urban";

export type TerrainGenSettlementOpts = {
  /** City / district / structure tile indices. */
  reservedTiles?: Iterable<number>;
  /** City hub tiles — strongly prefer urban. */
  cityHubTiles?: Iterable<number>;
};

/** Preferred land when settlements must avoid forbidden biomes. */
const SETTLEMENT_PREFERRED_LAND: TerrainKind[] = [
  "urban",
  "wasteland",
  "agri",
  "desert",
  "forest",
  "savanna",
  "tundra",
  "swamp",
  "crater",
  "jungle",
  "ice",
];

/** Cold biomes that should form polar caps / polar patches. */
function isPolarKind(kind: TerrainKind): boolean {
  return kind === "ice" || kind === "tundra";
}

/** Warm biomes that prefer the equator; jungle outranks forest. */
function isEquatorialKind(kind: TerrainKind): boolean {
  return kind === "jungle" || kind === "forest";
}

/** Vegetated biomes that prefer coasts / proximity to water. */
function isGreenlandKind(kind: TerrainKind): boolean {
  return kind === "agri" || kind === "forest" || kind === "jungle";
}

function isWaterKind(kind: TerrainKind): boolean {
  return kind === "ocean" || kind === "swamp";
}

function chordDist2(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** Absolute latitude proxy on the unit sphere (Y-up). */
function polarScore(tileY: number, kind: TerrainKind): number {
  const lat = Math.abs(tileY);
  // Ice hugs the extremes harder; tundra sits a bit equator-ward of ice.
  return kind === "ice" ? lat * lat * lat : lat * lat;
}

/** Equator affinity: 1 at equator, 0 at poles. Jungle hugs the belt harder. */
function equatorScore(tileY: number, kind: TerrainKind): number {
  const equatorial = 1 - Math.abs(tileY);
  return kind === "jungle"
    ? equatorial * equatorial * equatorial
    : equatorial * equatorial;
}

/**
 * Assign every tile a terrain kind according to percentage weights.
 * Area follows normalized weights; shape follows share intent
 * (high % → few large regions, low % → many small lakes/patches).
 * Optional settlement tiles are kept off ocean / lava / chem spills.
 */
export function generateTileTerrainByPercents(
  weights: Partial<Record<TerrainKind, number>>,
  tileCount = strategicTileCount(),
  rng: () => number = Math.random,
  settlement?: TerrainGenSettlementOpts,
): Record<string, string> {
  const entries = TERRAIN_KIND_ORDER.map((kind) => ({
    kind,
    weight: Math.max(0, Number(weights[kind]) || 0),
  })).filter((e) => e.weight > 0);

  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  if (totalWeight <= 0 || tileCount <= 0) return {};

  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const n = Math.min(tileCount, sphere.tiles.length);
  if (n <= 0) return {};

  const reserved = new Set<number>();
  for (const t of settlement?.reservedTiles ?? []) {
    if (t >= 0 && t < n) reserved.add(t);
  }
  const cityHubs = new Set<number>();
  for (const t of settlement?.cityHubTiles ?? []) {
    if (t >= 0 && t < n) cityHubs.add(t);
  }

  const targets = new Map<TerrainKind, number>();
  let assignedQuota = 0;
  for (let i = 0; i < entries.length; i++) {
    const { kind, weight } = entries[i]!;
    const count =
      i === entries.length - 1
        ? n - assignedQuota
        : Math.max(0, Math.round((weight / totalWeight) * n));
    const capped = Math.min(n - assignedQuota, count);
    targets.set(kind, capped);
    assignedQuota += capped;
  }
  if (assignedQuota < n && entries.length > 0) {
    const last = entries[entries.length - 1]!.kind;
    targets.set(last, (targets.get(last) ?? 0) + (n - assignedQuota));
  }

  const shareOf = (kind: TerrainKind): number =>
    (targets.get(kind) ?? 0) / n;

  const assignment: (TerrainKind | null)[] = Array(n).fill(null);
  const counts = new Map<TerrainKind, number>();
  for (const kind of targets.keys()) counts.set(kind, 0);

  const landKinds = TERRAIN_KIND_ORDER.filter(
    (k) => !isSettlementForbiddenTerrain(k) && (targets.get(k) ?? 0) > 0,
  );
  const anyLandKind =
    landKinds[0] ??
    SETTLEMENT_PREFERRED_LAND.find((k) => !isSettlementForbiddenTerrain(k)) ??
    SETTLEMENT_LAND_FALLBACK;

  const pickSettlementKind = (tile: number): TerrainKind => {
    // City hubs are always urban — settlements aren't underwater or on lava.
    if (cityHubs.has(tile)) return "urban";
    if ((targets.get("urban") ?? 0) > 0) return "urban";
    for (const k of landKinds) {
      if ((counts.get(k) ?? 0) < (targets.get(k) ?? 0)) return k;
    }
    return landKinds[0] ?? anyLandKind;
  };

  const claim = (tile: number, kind: TerrainKind): boolean => {
    if (tile < 0 || tile >= n) return false;
    if (assignment[tile] != null) return false;
    if (reserved.has(tile) && isSettlementForbiddenTerrain(kind)) {
      return false;
    }
    const have = counts.get(kind) ?? 0;
    const want = targets.get(kind) ?? 0;
    if (have >= want) return false;
    assignment[tile] = kind;
    counts.set(kind, have + 1);
    return true;
  };

  /** Force-claim settlement tiles (may exceed quota slightly for urban). */
  const forceSettlement = (tile: number, kind: TerrainKind) => {
    if (assignment[tile] != null) return;
    const safe = isSettlementForbiddenTerrain(kind) ? anyLandKind : kind;
    assignment[tile] = safe;
    counts.set(safe, (counts.get(safe) ?? 0) + 1);
    // Bump target so growth doesn't starve this kind later.
    targets.set(safe, Math.max(targets.get(safe) ?? 0, counts.get(safe)!));
  };

  // Reserve settlements first so ocean/lava/toxic never claim them.
  const reservedList = [...reserved];
  shuffleInPlace(reservedList, rng);
  reservedList.sort((a, b) => {
    const ha = cityHubs.has(a) ? 0 : 1;
    const hb = cityHubs.has(b) ? 0 : 1;
    return ha - hb;
  });
  for (const tile of reservedList) {
    forceSettlement(tile, pickSettlementKind(tile));
  }

  /** Hex distance to nearest ocean/swamp (Infinity if no water yet). */
  const waterDistanceField = (): number[] => {
    const dist = Array<number>(n).fill(Number.POSITIVE_INFINITY);
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = assignment[i];
      if (k && isWaterKind(k)) {
        dist[i] = 0;
        q.push(i);
      }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi]!;
      const d = dist[cur]!;
      for (const nb of sphere.neighbors[cur] ?? []) {
        if (nb >= n) continue;
        if (dist[nb]! <= d + 1) continue;
        dist[nb] = d + 1;
        q.push(nb);
      }
    }
    return dist;
  };

  /** Free tile farthest (chord) from existing same-kind seeds; fallback random.
   * Polar → high |Y|; equatorial → low |Y|; greenland → near water.
   */
  const pickSpreadSeed = (
    kind: TerrainKind,
    existingSeeds: number[],
  ): number | null => {
    const free: number[] = [];
    for (let i = 0; i < n; i++) {
      if (assignment[i] == null) free.push(i);
    }
    if (free.length === 0) return null;

    const spreadBonus = (t: number): number => {
      if (existingSeeds.length === 0) return 0;
      const c = sphere.tiles[t]!.center;
      let minD = Infinity;
      for (const s of existingSeeds) {
        const d = chordDist2(c, sphere.tiles[s]!.center);
        if (d < minD) minD = d;
      }
      return minD;
    };

    if (isPolarKind(kind)) {
      let north = 0;
      let south = 0;
      for (const s of existingSeeds) {
        const y = sphere.tiles[s]!.center.y;
        if (y >= 0) north += 1;
        else south += 1;
      }
      const preferNorth = north <= south;

      let best = free[0]!;
      let bestScore = -Infinity;
      for (const t of free) {
        const c = sphere.tiles[t]!.center;
        const hemiBoost = preferNorth === c.y >= 0 ? 0.35 : 0;
        const score =
          polarScore(c.y, kind) * 4 +
          hemiBoost +
          spreadBonus(t) * 0.15 +
          rng() * 1e-4;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    }

    if (isGreenlandKind(kind)) {
      const waterDist = waterDistanceField();
      const hasWater = waterDist.some((d) => Number.isFinite(d));
      let best = free[0]!;
      let bestScore = -Infinity;
      for (const t of free) {
        const c = sphere.tiles[t]!.center;
        const coastal = hasWater
          ? 1 / (1 + (waterDist[t] ?? 99))
          : 0;
        // Jungle/forest also keep equatorial bias; agri is mainly coastal.
        const lat =
          kind === "agri" ? 0 : equatorScore(c.y, kind === "jungle" ? "jungle" : "forest");
        const score =
          coastal * 5 +
          lat * 2.5 +
          spreadBonus(t) * 0.12 +
          rng() * 1e-4;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    }

    if (isEquatorialKind(kind)) {
      let best = free[0]!;
      let bestScore = -Infinity;
      for (const t of free) {
        const c = sphere.tiles[t]!.center;
        const score =
          equatorScore(c.y, kind) * 4 +
          spreadBonus(t) * 0.15 +
          rng() * 1e-4;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    }

    if (existingSeeds.length === 0) {
      return free[Math.floor(rng() * free.length)]!;
    }
    let best = free[0]!;
    let bestScore = -1;
    for (const t of free) {
      const score = spreadBonus(t) + rng() * 1e-6;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  };

  type Frontier = { kind: TerrainKind; tiles: number[] };
  const frontiers: Frontier[] = [];

  const kindsBySize = [...targets.entries()]
    .filter(([, t]) => t > 0)
    .sort((a, b) => b[1] - a[1]);

  const plantKind = (kind: TerrainKind) => {
    const target = targets.get(kind) ?? 0;
    if (target <= 0) return;
    if (frontiers.some((f) => f.kind === kind)) return;
    let seedsWanted = seedCountForShare(target, n);
    if (isPolarKind(kind) && target >= 2) {
      seedsWanted = Math.max(seedsWanted, Math.min(2, target));
    }
    const seedTiles: number[] = [];
    for (let s = 0; s < seedsWanted; s++) {
      const tile = pickSpreadSeed(kind, seedTiles);
      if (tile == null) break;
      if (claim(tile, kind)) seedTiles.push(tile);
    }
    if (seedTiles.length > 0) {
      frontiers.push({ kind, tiles: seedTiles });
    }
  };

  const rebuildFrontierFromOwned = (kind: TerrainKind): number[] => {
    const tiles: number[] = [];
    for (let i = 0; i < n; i++) {
      if (assignment[i] !== kind) continue;
      for (const nb of sphere.neighbors[i] ?? []) {
        if (nb < n && assignment[nb] == null) {
          tiles.push(i);
          break;
        }
      }
    }
    shuffleInPlace(tiles, rng);
    return tiles;
  };

  const sortOpenNeighbors = (kind: TerrainKind, open: number[]) => {
    if (open.length <= 1) return;
    if (isPolarKind(kind)) {
      open.sort((a, b) => {
        const ya = Math.abs(sphere.tiles[a]!.center.y);
        const yb = Math.abs(sphere.tiles[b]!.center.y);
        if (yb !== ya) return yb - ya;
        return rng() - 0.5;
      });
      return;
    }
    if (isGreenlandKind(kind)) {
      const waterDist = waterDistanceField();
      open.sort((a, b) => {
        const da = waterDist[a] ?? 99;
        const db = waterDist[b] ?? 99;
        if (da !== db) return da - db;
        if (kind !== "agri") {
          const ya = Math.abs(sphere.tiles[a]!.center.y);
          const yb = Math.abs(sphere.tiles[b]!.center.y);
          if (ya !== yb) return ya - yb;
        }
        return rng() - 0.5;
      });
      return;
    }
    if (isEquatorialKind(kind)) {
      open.sort((a, b) => {
        const ya = Math.abs(sphere.tiles[a]!.center.y);
        const yb = Math.abs(sphere.tiles[b]!.center.y);
        if (ya !== yb) return ya - yb;
        return rng() - 0.5;
      });
      return;
    }
    shuffleInPlace(open, rng);
  };

  /** Grow only the given kinds until their quotas fill or frontiers stall. */
  const growKinds = (kinds: Set<TerrainKind>, maxRounds = n * 3) => {
    let progress = true;
    let rounds = 0;
    while (progress && rounds < maxRounds) {
      progress = false;
      rounds += 1;
      const active = frontiers.filter((f) => kinds.has(f.kind));
      shuffleInPlace(active, rng);
      for (const front of active) {
        const want = targets.get(front.kind) ?? 0;
        if ((counts.get(front.kind) ?? 0) >= want) {
          front.tiles.length = 0;
          continue;
        }
        if (front.tiles.length === 0) {
          const rebuilt = rebuildFrontierFromOwned(front.kind);
          if (rebuilt.length === 0) continue;
          front.tiles = rebuilt;
        }
        const i = Math.floor(rng() * front.tiles.length);
        const cur = front.tiles[i]!;
        front.tiles[i] = front.tiles[front.tiles.length - 1]!;
        front.tiles.pop();

        const open: number[] = [];
        for (const nb of sphere.neighbors[cur] ?? []) {
          if (nb < n && assignment[nb] == null) open.push(nb);
        }
        sortOpenNeighbors(front.kind, open);
        for (const nb of open) {
          if ((counts.get(front.kind) ?? 0) >= want) break;
          if (claim(nb, front.kind)) {
            front.tiles.push(nb);
            progress = true;
          }
        }
        if ((counts.get(front.kind) ?? 0) < want) {
          for (const nb of sphere.neighbors[cur] ?? []) {
            if (nb < n && assignment[nb] == null) {
              front.tiles.push(cur);
              break;
            }
          }
        }
      }
      for (const kind of kinds) {
        if ((counts.get(kind) ?? 0) >= (targets.get(kind) ?? 0)) continue;
        let front = frontiers.find((f) => f.kind === kind);
        if (front && front.tiles.length > 0) continue;
        const rebuilt = rebuildFrontierFromOwned(kind);
        if (rebuilt.length > 0) {
          if (!front) frontiers.push({ kind, tiles: rebuilt });
          else front.tiles = rebuilt;
          progress = true;
          continue;
        }
        const existingOwned: number[] = [];
        for (let i = 0; i < n; i++) {
          if (assignment[i] === kind) existingOwned.push(i);
        }
        const seed = pickSpreadSeed(kind, existingOwned);
        if (seed == null) continue;
        if (!claim(seed, kind)) continue;
        progress = true;
        if (!front) frontiers.push({ kind, tiles: [seed] });
        else front.tiles.push(seed);
      }
    }
  };

  // 1) Poles  2) Water (so coasts exist)  3) Greenland on coasts  4) Rest
  plantKind("ice");
  plantKind("tundra");
  growKinds(new Set(["ice", "tundra"]));

  plantKind("ocean");
  plantKind("swamp");
  growKinds(new Set(["ocean", "swamp"]));

  plantKind("jungle");
  plantKind("forest");
  plantKind("agri");

  for (const [kind] of kindsBySize) {
    if (
      isPolarKind(kind) ||
      isWaterKind(kind) ||
      isGreenlandKind(kind)
    ) {
      continue;
    }
    plantKind(kind);
  }

  // Round-robin expand all frontiers until quotas are met or frontiers die.
  let progress = true;
  let stallRounds = 0;
  while (progress && stallRounds < n * 4) {
    progress = false;
    stallRounds += 1;
    shuffleInPlace(frontiers, rng);
    for (const front of frontiers) {
      const want = targets.get(front.kind) ?? 0;
      if ((counts.get(front.kind) ?? 0) >= want) {
        front.tiles.length = 0;
        continue;
      }
      if (front.tiles.length === 0) continue;

      const i = Math.floor(rng() * front.tiles.length);
      const cur = front.tiles[i]!;
      front.tiles[i] = front.tiles[front.tiles.length - 1]!;
      front.tiles.pop();

      const open: number[] = [];
      for (const nb of sphere.neighbors[cur] ?? []) {
        if (nb < n && assignment[nb] == null) open.push(nb);
      }
      sortOpenNeighbors(front.kind, open);
      for (const nb of open) {
        if ((counts.get(front.kind) ?? 0) >= want) break;
        if (claim(nb, front.kind)) {
          front.tiles.push(nb);
          progress = true;
        }
      }
      if ((counts.get(front.kind) ?? 0) < want) {
        let hasOpen = false;
        for (const nb of sphere.neighbors[cur] ?? []) {
          if (nb < n && assignment[nb] == null) {
            hasOpen = true;
            break;
          }
        }
        if (hasOpen) front.tiles.push(cur);
      }
    }

    // Re-seed policy by share.
    for (const [kind, want] of kindsBySize) {
      if ((counts.get(kind) ?? 0) >= want) continue;
      let front = frontiers.find((f) => f.kind === kind);
      const highShare = shareOf(kind) >= HIGH_SHARE_THRESHOLD;

      if (front && front.tiles.length > 0) continue;

      if (highShare) {
        const rebuilt = rebuildFrontierFromOwned(kind);
        if (rebuilt.length > 0) {
          if (!front) {
            front = { kind, tiles: rebuilt };
            frontiers.push(front);
          } else {
            front.tiles = rebuilt;
          }
          progress = true;
          continue;
        }
      }

      const existingOwned: number[] = [];
      for (let i = 0; i < n; i++) {
        if (assignment[i] === kind) existingOwned.push(i);
      }
      const seed = pickSpreadSeed(kind, existingOwned);
      if (seed == null) continue;
      if (!claim(seed, kind)) continue;
      progress = true;
      if (!front) {
        frontiers.push({ kind, tiles: [seed] });
      } else {
        front.tiles.push(seed);
      }
    }
  }

  const fallbackKind =
    kindsBySize[0]?.[0] ?? entries[entries.length - 1]!.kind;

  const underQuotaKinds = (): TerrainKind[] => {
    const list: TerrainKind[] = [];
    for (const [kind, want] of kindsBySize) {
      if ((counts.get(kind) ?? 0) < want) list.push(kind);
    }
    return list;
  };

  // Leftovers: for high-share under-quota kinds, prefer tiles adjacent to them.
  const leftovers: number[] = [];
  for (let i = 0; i < n; i++) {
    if (assignment[i] == null) leftovers.push(i);
  }
  shuffleInPlace(leftovers, rng);

  // Polar leftovers: assign under-quota ice/tundra to highest-|Y| free tiles first.
  const polarNeedy = (): TerrainKind[] =>
    underQuotaKinds().filter(isPolarKind);
  const equatorNeedy = (): TerrainKind[] =>
    underQuotaKinds().filter(isEquatorialKind);
  const greenlandNeedy = (): TerrainKind[] =>
    underQuotaKinds().filter(isGreenlandKind);
  leftovers.sort((a, b) => {
    const ya = Math.abs(sphere.tiles[a]!.center.y);
    const yb = Math.abs(sphere.tiles[b]!.center.y);
    return yb - ya;
  });

  for (const tile of leftovers) {
    if (assignment[tile] != null) continue;
    const needy = underQuotaKinds();
    let chosen: TerrainKind | null = null;

    const polar = polarNeedy();
    const equatorial = equatorNeedy();
    const green = greenlandNeedy();
    const tileLat = Math.abs(sphere.tiles[tile]!.center.y);
    const nextToWater = (sphere.neighbors[tile] ?? []).some((nb) => {
      const k = nb < n ? assignment[nb] : null;
      return k != null && isWaterKind(k);
    });
    if (polar.length > 0) {
      // Prefer polar kind that already borders this tile.
      for (const kind of polar) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      // Only dump under-quota ice/tundra onto clearly polar free tiles.
      if (!chosen && tileLat >= 0.45) {
        chosen = polar.includes("ice") ? "ice" : polar[0]!;
      }
    }

    if (!chosen && green.length > 0 && nextToWater) {
      for (const kind of ["jungle", "forest", "agri"] as const) {
        if (!green.includes(kind)) continue;
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) {
        chosen = green.includes("jungle")
          ? "jungle"
          : green.includes("forest")
            ? "forest"
            : green[0]!;
      }
    }

    if (!chosen && equatorial.length > 0) {
      for (const kind of equatorial) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      // Dump under-quota jungle/forest onto clearly equatorial free tiles
      // (jungle first when both need area).
      if (!chosen && tileLat <= 0.35) {
        chosen = equatorial.includes("jungle")
          ? "jungle"
          : equatorial[0]!;
      }
    }

    const highNeedy = needy.filter(
      (k) =>
        shareOf(k) >= HIGH_SHARE_THRESHOLD &&
        !isPolarKind(k) &&
        !isEquatorialKind(k) &&
        !isGreenlandKind(k),
    );
    if (!chosen && highNeedy.length > 0) {
      for (const kind of highNeedy) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) chosen = highNeedy[0]!;
    }

    if (!chosen && needy.length > 0) {
      for (const kind of needy) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) chosen = needy[0]!;
    }

    if (!chosen) chosen = fallbackKind;
    if (reserved.has(tile) && isSettlementForbiddenTerrain(chosen)) {
      chosen = pickSettlementKind(tile);
    }
    assignment[tile] = chosen;
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
  }

  // Final safety: settlements never keep ocean / lava / chem spill.
  for (const tile of reserved) {
    const k = assignment[tile];
    if (!k || isSettlementForbiddenTerrain(k)) {
      const safe = pickSettlementKind(tile);
      if (k && counts.has(k)) {
        counts.set(k, Math.max(0, (counts.get(k) ?? 1) - 1));
      }
      assignment[tile] = safe;
      counts.set(safe, (counts.get(safe) ?? 0) + 1);
    }
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    let kind = assignment[i] ?? fallbackKind;
    if (reserved.has(i) && isSettlementForbiddenTerrain(kind)) {
      kind = pickSettlementKind(i);
    }
    out[String(i)] = kind;
  }
  return out;
}

/** Paint every tile with a single kind (settlements stay on safe land). */
export function fillAllTileTerrain(
  kind: TerrainKind,
  tileCount = strategicTileCount(),
  settlement?: TerrainGenSettlementOpts,
): Record<string, string> {
  const reserved = new Set<number>();
  for (const t of settlement?.reservedTiles ?? []) reserved.add(t);
  const cityHubs = new Set<number>();
  for (const t of settlement?.cityHubTiles ?? []) cityHubs.add(t);
  const out: Record<string, string> = {};
  for (let i = 0; i < tileCount; i++) {
    if (reserved.has(i) && isSettlementForbiddenTerrain(kind)) {
      out[String(i)] = SETTLEMENT_LAND_FALLBACK;
    } else {
      out[String(i)] = kind;
    }
  }
  // Prefer urban label on hubs when we had to substitute.
  for (const hub of cityHubs) {
    if (
      hub >= 0 &&
      hub < tileCount &&
      reserved.has(hub) &&
      isSettlementForbiddenTerrain(kind)
    ) {
      out[String(hub)] = "urban";
    }
  }
  return out;
}
