import type {
  City,
  District,
  DistrictKind,
  Planet,
  PlanetType,
  SphereDir,
} from "../types/campaign";
import { DISTRICT_KIND_LABELS } from "../types/campaign";
import { buildHexSphere, type HexSphere } from "./hexSphere";

/** Must match HexPlanet FREQUENCY so tile indices stay valid. */
export const SETTLEMENT_HEX_FREQUENCY = 5;

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

function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const CITY_PREFIX: Record<PlanetType, string[]> = {
  hive: ["Hive", "Kasr", "Spire", "Hab-Cluster"],
  forge: ["Forge", "Manufactorum", "Anvil", "Furnace"],
  agri: ["Agri-Hub", "Silo", "Granary", "Harvest"],
  death: ["Fortress", "Outpost", "Hold", "Redoubt"],
  shrine: ["Shrine", "Basilica", "Sanctum", "Pilgrim"],
  custom: ["City", "Settlement", "Colony", "Station"],
};

const DISTRICT_KINDS: Record<PlanetType, DistrictKind[]> = {
  hive: ["spire", "underhive", "docks", "bastion", "quarter", "ruins"],
  forge: ["manufactorum", "foundry", "refinery", "railhead", "bastion", "ruins"],
  agri: ["agriplex", "silo", "reservoir", "outpost", "quarter", "bastion"],
  death: ["fortress", "camp", "bastion", "outpost", "ruins", "quarter"],
  shrine: ["cathedral", "reliquary", "cloister", "quarter", "bastion", "ruins"],
  custom: ["quarter", "bastion", "docks", "outpost", "ruins", "camp"],
};

const CITY_COUNT: Record<PlanetType, [number, number]> = {
  hive: [4, 5],
  forge: [3, 4],
  agri: [2, 3],
  death: [2, 3],
  shrine: [2, 3],
  custom: [2, 3],
};

const DISTRICTS_PER_CITY: Record<PlanetType, [number, number]> = {
  hive: [3, 4],
  forge: [3, 4],
  agri: [2, 3],
  death: [2, 3],
  shrine: [2, 3],
  custom: [2, 3],
};

function cityName(type: PlanetType, index: number, rng: Rng): string {
  const prefix = pick(rng, CITY_PREFIX[type]);
  const numerals = ["Prime", "Secundus", "Tertius", "Quartus", "Alpha", "Beta"];
  return `${prefix} ${numerals[index % numerals.length]}`;
}

function districtName(kind: DistrictKind, index: number): string {
  return `${DISTRICT_KIND_LABELS[kind]} ${index + 1}`;
}

function dirFromTile(sphere: HexSphere, tileIndex: number): SphereDir {
  const t = sphere.tiles[tileIndex]!;
  return { x: t.center.x, y: t.center.y, z: t.center.z };
}

/** Graph distance BFS — keep city hubs spread out. */
function tileDistance(
  neighbors: number[][],
  start: number,
  goal: number,
): number {
  if (start === goal) return 0;
  const q = [start];
  const dist = new Map<number, number>([[start, 0]]);
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    for (const n of neighbors[cur] ?? []) {
      if (dist.has(n)) continue;
      if (n === goal) return d + 1;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return 999;
}

function pickSpreadTiles(
  sphere: HexSphere,
  count: number,
  minDist: number,
  rng: Rng,
): number[] {
  const order = shuffle(
    rng,
    sphere.tiles.map((_, i) => i),
  );
  const picked: number[] = [];
  for (const idx of order) {
    if (
      picked.every(
        (p) => tileDistance(sphere.neighbors, p, idx) >= minDist,
      )
    ) {
      picked.push(idx);
      if (picked.length >= count) break;
    }
  }
  // Fallback if spacing is too strict
  for (const idx of order) {
    if (picked.length >= count) break;
    if (!picked.includes(idx)) picked.push(idx);
  }
  return picked.slice(0, count);
}

export type SettlementGenOptions = {
  defaultFactionId?: string;
  rivalFactionId?: string;
  contestedRate?: number;
};

/**
 * Place cities on unique hub tiles; each district gets its own adjacent tile.
 * No two settlements share a tile.
 */
export function generatePlanetCities(
  planetId: string,
  type: PlanetType,
  options: SettlementGenOptions = {},
): City[] {
  const rng = mulberry32(seedFromString(planetId + ":tiles"));
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const [cMin, cMax] = CITY_COUNT[type];
  const cityCount = Math.min(
    randInt(rng, cMin, cMax),
    Math.floor(sphere.tiles.length / 6),
  );
  const hubTiles = pickSpreadTiles(sphere, cityCount, 3, rng);
  const used = new Set<number>(hubTiles);
  const kinds = DISTRICT_KINDS[type];
  const {
    defaultFactionId,
    rivalFactionId,
    contestedRate = rivalFactionId ? 0.35 : 0,
  } = options;

  return hubTiles.map((hub, ci) => {
    let owner = defaultFactionId;
    if (rivalFactionId && rng() < contestedRate * 0.5) owner = rivalFactionId;

    const [dMin, dMax] = DISTRICTS_PER_CITY[type];
    const want = randInt(rng, dMin, dMax);
    const neighborPool = shuffle(
      rng,
      (sphere.neighbors[hub] ?? []).filter((n) => !used.has(n)),
    );
    // Also allow 2-ring neighbors if needed
    const ring2: number[] = [];
    for (const n of sphere.neighbors[hub] ?? []) {
      for (const n2 of sphere.neighbors[n] ?? []) {
        if (n2 !== hub && !used.has(n2) && !neighborPool.includes(n2)) {
          ring2.push(n2);
        }
      }
    }
    const districtTiles = [
      ...neighborPool,
      ...shuffle(rng, ring2),
    ].slice(0, want);

    for (const t of districtTiles) used.add(t);

    const districts: District[] = districtTiles.map((tileIndex, di) => {
      let dOwner = owner;
      if (rivalFactionId && rng() < contestedRate) dOwner = rivalFactionId;
      const kind = pick(rng, kinds);
      return {
        id: crypto.randomUUID(),
        name: districtName(kind, di),
        kind,
        controllingFactionId: dOwner,
        tileIndex,
        dir: dirFromTile(sphere, tileIndex),
        notes: "",
      };
    });

    return {
      id: crypto.randomUUID(),
      name: cityName(type, ci, rng),
      tileIndex: hub,
      controllingFactionId: owner,
      dir: dirFromTile(sphere, hub),
      districts,
      notes: "",
    };
  });
}

/** Map tile index → owning faction (open claims, then city/district override). */
export function settlementTileSet(cities: City[]): Set<number> {
  const set = new Set<number>();
  for (const city of cities) {
    set.add(city.tileIndex);
    for (const d of city.districts) set.add(d.tileIndex);
  }
  return set;
}

/** Drop claims that sit on city/district tiles. */
export function scrubTileClaims(
  claims: Record<string, string> | undefined,
  cities: City[],
): Record<string, string> {
  if (!claims) return {};
  const occupied = settlementTileSet(cities);
  const next: Record<string, string> = {};
  for (const [key, factionId] of Object.entries(claims)) {
    if (!factionId || occupied.has(Number(key))) continue;
    next[key] = factionId;
  }
  return next;
}

export function tileOwnerMap(
  cities: City[],
  tileClaims?: Record<string, string>,
): Map<number, string> {
  const map = new Map<number, string>();
  if (tileClaims) {
    for (const [key, factionId] of Object.entries(tileClaims)) {
      if (factionId) map.set(Number(key), factionId);
    }
  }
  for (const city of cities) {
    if (city.controllingFactionId != null) {
      map.set(city.tileIndex, city.controllingFactionId);
    }
    for (const d of city.districts) {
      if (d.controllingFactionId != null) {
        map.set(d.tileIndex, d.controllingFactionId);
      }
    }
  }
  return map;
}

export function planetOwnerFromCities(
  cities: City[],
  tileClaims?: Record<string, string>,
): string | undefined {
  const owners = new Set<string>();
  for (const city of cities) {
    if (city.controllingFactionId) owners.add(city.controllingFactionId);
    for (const d of city.districts) {
      if (d.controllingFactionId) owners.add(d.controllingFactionId);
    }
  }
  if (tileClaims) {
    for (const factionId of Object.values(tileClaims)) {
      if (factionId) owners.add(factionId);
    }
  }
  if (owners.size === 1) return [...owners][0];
  return undefined;
}

function settlementsNeedTiles(planet: Planet): boolean {
  if (!planet.cities?.length) return true;
  return planet.cities.some(
    (c) =>
      typeof c.tileIndex !== "number" ||
      c.districts.some((d) => typeof d.tileIndex !== "number"),
  );
}

export function ensurePlanetCities(
  planet: Planet,
  options?: SettlementGenOptions,
): Planet {
  if (planet.cities && planet.cities.length > 0 && !settlementsNeedTiles(planet)) {
    return {
      ...planet,
      tileClaims: scrubTileClaims(planet.tileClaims, planet.cities),
      armies: planet.armies ?? [],
    };
  }
  const cities = generatePlanetCities(planet.id, planet.type, {
    defaultFactionId: planet.controllingFactionId ?? options?.defaultFactionId,
    rivalFactionId: options?.rivalFactionId,
    contestedRate: options?.contestedRate,
  });
  return {
    ...planet,
    cities,
    tileClaims: scrubTileClaims(planet.tileClaims, cities),
    controllingFactionId:
      planetOwnerFromCities(cities, scrubTileClaims(planet.tileClaims, cities)) ??
      planet.controllingFactionId,
    armies: planet.armies ?? [],
  };
}

export function assignAllDistricts(
  cities: City[],
  factionId: string | null,
): City[] {
  const owner = factionId || undefined;
  return cities.map((c) => ({
    ...c,
    controllingFactionId: owner,
    districts: c.districts.map((d) => ({
      ...d,
      controllingFactionId: owner,
    })),
  }));
}

export function countDistrictsByFaction(cities: City[]): Map<string, number> {
  const map = new Map<string, number>();
  const bump = (id: string | undefined) => {
    const key = id ?? "__none__";
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const city of cities) {
    bump(city.controllingFactionId);
    for (const d of city.districts) bump(d.controllingFactionId);
  }
  return map;
}
