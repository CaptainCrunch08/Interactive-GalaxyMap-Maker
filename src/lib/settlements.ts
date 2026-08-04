import type {
  City,
  District,
  DistrictKind,
  Planet,
  PlanetStructure,
  PlanetType,
  SphereDir,
  StructureKind,
} from "../types/campaign";
import {
  DISTRICT_KIND_LABELS,
  STRUCTURE_KIND_LABELS,
} from "../types/campaign";
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
  asteroid_belt: ["Station", "Mining", "Claim", "Relay"],
  custom: ["City", "Settlement", "Colony", "Station"],
};

const DISTRICT_KINDS: Record<PlanetType, DistrictKind[]> = {
  hive: ["spire", "underhive", "docks", "bastion", "quarter", "manufactorum", "ruins"],
  forge: ["manufactorum", "foundry", "refinery", "railhead", "bastion", "ruins"],
  agri: ["agriplex", "silo", "reservoir", "outpost", "quarter", "bastion", "manufactorum"],
  death: ["fortress", "camp", "bastion", "outpost", "ruins", "quarter", "manufactorum"],
  shrine: ["cathedral", "reliquary", "cloister", "quarter", "bastion", "ruins", "manufactorum"],
  asteroid_belt: ["outpost", "docks", "camp", "ruins", "bastion", "quarter"],
  custom: ["quarter", "bastion", "docks", "outpost", "ruins", "camp", "manufactorum"],
};

/** Guaranteed manufactorums per city (forge > hive > agri / others). */
const MANUFACTORUMS_PER_CITY: Record<PlanetType, [number, number]> = {
  forge: [2, 3],
  hive: [1, 2],
  agri: [0, 1],
  death: [0, 1],
  shrine: [0, 1],
  asteroid_belt: [0, 0],
  custom: [0, 1],
};

const CITY_COUNT: Record<PlanetType, [number, number]> = {
  hive: [4, 5],
  forge: [3, 4],
  agri: [2, 3],
  death: [2, 3],
  shrine: [2, 3],
  asteroid_belt: [0, 1],
  custom: [2, 3],
};

const DISTRICTS_PER_CITY: Record<PlanetType, [number, number]> = {
  hive: [3, 4],
  forge: [3, 4],
  agri: [2, 3],
  death: [2, 3],
  shrine: [2, 3],
  asteroid_belt: [1, 2],
  custom: [2, 3],
};

const STRUCTURE_POOL: Record<PlanetType, StructureKind[]> = {
  hive: ["space_port", "spire_cluster", "underhive_gate", "outpost", "ruins_site"],
  forge: [
    "manufactorum_complex",
    "ore_mine",
    "slag_works",
    "reactor",
    "outpost",
  ],
  agri: ["agri_dome", "silo_complex", "reservoir_works", "outpost"],
  death: ["fortress_bastion", "trench_line", "kill_zone", "outpost", "ruins_site"],
  shrine: [
    "cathedral_complex",
    "reliquary_vault",
    "pilgrim_station",
    "outpost",
    "ruins_site",
  ],
  asteroid_belt: ["mining_claim", "relay", "outpost"],
  custom: ["outpost", "relay", "ruins_site", "mining_claim"],
};

const STRUCTURE_COUNT: Record<PlanetType, [number, number]> = {
  hive: [4, 7],
  forge: [5, 8],
  agri: [3, 5],
  death: [4, 6],
  shrine: [3, 5],
  asteroid_belt: [2, 4],
  custom: [2, 4],
};

const STRUCTURE_NAME_PREFIX: Record<StructureKind, string[]> = {
  space_port: ["Space Port", "Starport", "Drop-Port"],
  spire_cluster: ["Spire Cluster", "Hab Spire", "Needle Stack"],
  underhive_gate: ["Underhive Gate", "Sump Gate", "Depth Access"],
  manufactorum_complex: ["Manufactorum", "Forge Complex", "Production Yard"],
  ore_mine: ["Ore Mine", "Extraction Pit", "Deep Claim"],
  slag_works: ["Slag Works", "Ash Foundry", "Waste Yard"],
  reactor: ["Reactor", "Plasma Core", "Power Stack"],
  agri_dome: ["Agri Dome", "Grow Dome", "Hydroplex"],
  silo_complex: ["Silo Complex", "Grain Vault", "Harvest Bank"],
  reservoir_works: ["Reservoir", "Aqua Works", "Catchment"],
  fortress_bastion: ["Bastion", "Redoubt", "Keep"],
  trench_line: ["Trench Line", "War Dig", "Fire Trench"],
  kill_zone: ["Kill Zone", "Dead Ground", "Clearance Field"],
  cathedral_complex: ["Cathedral", "Basilica", "Grand Shrine"],
  reliquary_vault: ["Reliquary", "Sacred Vault", "Ossuary"],
  pilgrim_station: ["Pilgrim Station", "Wayshrine", "Processional"],
  mining_claim: ["Mining Claim", "Asteroid Pit", "Claim Marker"],
  relay: ["Relay", "Vox Array", "Beacon"],
  outpost: ["Outpost", "Watch Post", "Frontier Post"],
  ruins_site: ["Ruins", "Dead Site", "Collapsed Works"],
};

function cityName(type: PlanetType, index: number, rng: Rng): string {
  const prefix = pick(rng, CITY_PREFIX[type]);
  const numerals = ["Prime", "Secundus", "Tertius", "Quartus", "Alpha", "Beta"];
  return `${prefix} ${numerals[index % numerals.length]}`;
}

function districtName(kind: DistrictKind, index: number): string {
  return `${DISTRICT_KIND_LABELS[kind]} ${index + 1}`;
}

function structureName(kind: StructureKind, index: number, rng: Rng): string {
  const prefix = pick(rng, STRUCTURE_NAME_PREFIX[kind]);
  const numerals = ["Alpha", "Beta", "Gamma", "Delta", "I", "II", "III"];
  return `${prefix} ${numerals[index % numerals.length]}`;
}

function dirFromTile(sphere: HexSphere, tileIndex: number): SphereDir {
  const t = sphere.tiles[tileIndex]!;
  return { x: t.center.x, y: t.center.y, z: t.center.z };
}

/** Graph distance BFS — keep hubs spread out. */
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
  exclude?: Set<number>,
): number[] {
  const order = shuffle(
    rng,
    sphere.tiles
      .map((_, i) => i)
      .filter((i) => !exclude?.has(i)),
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
    const [mMin, mMax] = MANUFACTORUMS_PER_CITY[type];
    const manufCount = randInt(rng, mMin, mMax);
    const otherWant = randInt(rng, dMin, dMax);
    const want = manufCount + otherWant;
    const neighborPool = shuffle(
      rng,
      (sphere.neighbors[hub] ?? []).filter((n) => !used.has(n)),
    );
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

    const otherKinds = kinds.filter((k) => k !== "manufactorum");
    const kindPool = otherKinds.length > 0 ? otherKinds : kinds;

    const districts: District[] = districtTiles.map((tileIndex, di) => {
      let dOwner = owner;
      if (rivalFactionId && rng() < contestedRate) dOwner = rivalFactionId;
      const kind: DistrictKind =
        di < manufCount ? "manufactorum" : pick(rng, kindPool);
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

/**
 * Place world-type structures on free hexes (not cities/districts).
 */
export function generatePlanetStructures(
  planetId: string,
  type: PlanetType,
  occupied: Set<number>,
  options: SettlementGenOptions = {},
): PlanetStructure[] {
  const rng = mulberry32(seedFromString(planetId + ":structures"));
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const [sMin, sMax] = STRUCTURE_COUNT[type];
  const freeSlots = sphere.tiles.length - occupied.size;
  const count = Math.min(randInt(rng, sMin, sMax), Math.max(0, freeSlots));
  if (count === 0) return [];

  const pool = STRUCTURE_POOL[type];
  const tiles = pickSpreadTiles(sphere, count, 2, rng, occupied);
  const {
    defaultFactionId,
    rivalFactionId,
    contestedRate = rivalFactionId ? 0.3 : 0,
  } = options;

  return tiles.map((tileIndex, i) => {
    let owner = defaultFactionId;
    if (rivalFactionId && rng() < contestedRate) owner = rivalFactionId;
    const kind = pick(rng, pool);
    return {
      id: crypto.randomUUID(),
      name: structureName(kind, i, rng),
      kind,
      tileIndex,
      dir: dirFromTile(sphere, tileIndex),
      controllingFactionId: owner,
      notes: "",
    };
  });
}

/** Cities + type structures for a world. */
export function generatePlanetSurface(
  planetId: string,
  type: PlanetType,
  options: SettlementGenOptions = {},
): { cities: City[]; structures: PlanetStructure[] } {
  const cities = generatePlanetCities(planetId, type, options);
  const occupied = settlementTileSet(cities, []);
  const structures = generatePlanetStructures(
    planetId,
    type,
    occupied,
    options,
  );
  return { cities, structures };
}

/** Map tile index set for cities, districts, and structures. */
export function settlementTileSet(
  cities: City[],
  structures: PlanetStructure[] = [],
): Set<number> {
  const set = new Set<number>();
  for (const city of cities) {
    set.add(city.tileIndex);
    for (const d of city.districts) set.add(d.tileIndex);
  }
  for (const s of structures) set.add(s.tileIndex);
  return set;
}

/** Place one structure on the first free hex (or null if full). */
export function createStructureOnFreeHex(
  planet: Planet,
  kind: StructureKind,
  options?: { name?: string; controllingFactionId?: string },
): PlanetStructure | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const occupied = settlementTileSet(planet.cities ?? [], planet.structures ?? []);
  let tileIndex = -1;
  for (let i = 0; i < sphere.tiles.length; i++) {
    if (!occupied.has(i)) {
      tileIndex = i;
      break;
    }
  }
  if (tileIndex < 0) return null;
  return createStructureAtTile(planet, tileIndex, kind, options);
}

/** Place a structure on a specific free hex. */
export function createStructureAtTile(
  planet: Planet,
  tileIndex: number,
  kind: StructureKind,
  options?: { name?: string; controllingFactionId?: string },
): PlanetStructure | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  if (tileIndex < 0 || tileIndex >= sphere.tiles.length) return null;
  const occupied = settlementTileSet(planet.cities ?? [], planet.structures ?? []);
  if (occupied.has(tileIndex)) return null;
  const count = (planet.structures ?? []).filter((s) => s.kind === kind).length;
  return {
    id: crypto.randomUUID(),
    name: options?.name ?? `${structureLabel(kind)} ${count + 1}`,
    kind,
    tileIndex,
    dir: dirFromTile(sphere, tileIndex),
    controllingFactionId:
      options?.controllingFactionId ?? planet.controllingFactionId,
    notes: "",
  };
}

/** Place a new city hub on a free hex. */
export function createCityAtTile(
  planet: Planet,
  tileIndex: number,
  options?: { name?: string; controllingFactionId?: string },
): City | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  if (tileIndex < 0 || tileIndex >= sphere.tiles.length) return null;
  const occupied = settlementTileSet(planet.cities ?? [], planet.structures ?? []);
  if (occupied.has(tileIndex)) return null;
  const n = (planet.cities ?? []).length + 1;
  const owner =
    options?.controllingFactionId ?? planet.controllingFactionId;
  return {
    id: crypto.randomUUID(),
    name: options?.name ?? `City ${n}`,
    tileIndex,
    controllingFactionId: owner,
    dir: dirFromTile(sphere, tileIndex),
    districts: [],
    notes: "",
  };
}

/** Attach a district to a city on a free hex. */
export function createDistrictAtTile(
  planet: Planet,
  cityId: string,
  tileIndex: number,
  kind: DistrictKind,
  options?: { name?: string; controllingFactionId?: string },
): { cities: City[] } | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  if (tileIndex < 0 || tileIndex >= sphere.tiles.length) return null;
  const occupied = settlementTileSet(planet.cities ?? [], planet.structures ?? []);
  if (occupied.has(tileIndex)) return null;
  const cities = planet.cities ?? [];
  const city = cities.find((c) => c.id === cityId);
  if (!city) return null;
  const count = city.districts.filter((d) => d.kind === kind).length;
  const district: District = {
    id: crypto.randomUUID(),
    name:
      options?.name ??
      `${DISTRICT_KIND_LABELS[kind]} ${count + 1}`,
    kind,
    controllingFactionId:
      options?.controllingFactionId ??
      city.controllingFactionId ??
      planet.controllingFactionId,
    tileIndex,
    dir: dirFromTile(sphere, tileIndex),
    notes: "",
  };
  return {
    cities: cities.map((c) =>
      c.id === cityId
        ? { ...c, districts: [...c.districts, district] }
        : c,
    ),
  };
}

/** Free tiles in ring-1/2 around a city hub (same footprint as generation). */
export function tilesAroundCity(
  city: City,
  occupied?: Set<number>,
): number[] {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const hub = city.tileIndex;
  const blocked = occupied ?? new Set<number>();
  const near = new Set<number>();
  for (const n of sphere.neighbors[hub] ?? []) {
    if (!blocked.has(n) && n !== hub) near.add(n);
    for (const n2 of sphere.neighbors[n] ?? []) {
      if (!blocked.has(n2) && n2 !== hub) near.add(n2);
    }
  }
  return [...near];
}

export function isTileAroundCity(city: City, tileIndex: number): boolean {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const hub = city.tileIndex;
  if (tileIndex === hub) return false;
  for (const n of sphere.neighbors[hub] ?? []) {
    if (n === tileIndex) return true;
    if ((sphere.neighbors[n] ?? []).includes(tileIndex)) return true;
  }
  return false;
}

/** Drop claims that sit on city/district/structure tiles. */
export function scrubTileClaims(
  claims: Record<string, string> | undefined,
  cities: City[],
  structures: PlanetStructure[] = [],
): Record<string, string> {
  if (!claims) return {};
  const occupied = settlementTileSet(cities, structures);
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
  structures: PlanetStructure[] = [],
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
  for (const s of structures) {
    if (s.controllingFactionId != null) {
      map.set(s.tileIndex, s.controllingFactionId);
    }
  }
  return map;
}

export function planetOwnerFromCities(
  cities: City[],
  tileClaims?: Record<string, string>,
  structures: PlanetStructure[] = [],
): string | undefined {
  const owners = new Set<string>();
  for (const city of cities) {
    if (city.controllingFactionId) owners.add(city.controllingFactionId);
    for (const d of city.districts) {
      if (d.controllingFactionId) owners.add(d.controllingFactionId);
    }
  }
  for (const s of structures) {
    if (s.controllingFactionId) owners.add(s.controllingFactionId);
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

function structuresNeedTiles(planet: Planet): boolean {
  const list = planet.structures ?? [];
  if (list.length === 0) return true;
  return list.some((s) => typeof s.tileIndex !== "number");
}

export function ensurePlanetCities(
  planet: Planet,
  options?: SettlementGenOptions,
): Planet {
  const hasCities =
    planet.cities &&
    planet.cities.length > 0 &&
    !settlementsNeedTiles(planet);
  const hasStructures =
    planet.structures &&
    planet.structures.length > 0 &&
    !structuresNeedTiles(planet);

  if (hasCities && hasStructures) {
    const structures = planet.structures ?? [];
    return {
      ...planet,
      structures,
      tileClaims: scrubTileClaims(
        planet.tileClaims,
        planet.cities,
        structures,
      ),
      armies: planet.armies ?? [],
    };
  }

  const genOpts: SettlementGenOptions = {
    defaultFactionId: planet.controllingFactionId ?? options?.defaultFactionId,
    rivalFactionId: options?.rivalFactionId,
    contestedRate: options?.contestedRate,
  };

  let cities = planet.cities ?? [];
  if (!hasCities) {
    cities = generatePlanetCities(planet.id, planet.type, genOpts);
  }

  let structures = planet.structures ?? [];
  if (!hasStructures) {
    structures = generatePlanetStructures(
      planet.id,
      planet.type,
      settlementTileSet(cities, []),
      genOpts,
    );
  }

  const tileClaims = scrubTileClaims(planet.tileClaims, cities, structures);
  return {
    ...planet,
    cities,
    structures,
    tileClaims,
    controllingFactionId:
      planetOwnerFromCities(cities, tileClaims, structures) ??
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

export function assignAllStructures(
  structures: PlanetStructure[],
  factionId: string | null,
): PlanetStructure[] {
  const owner = factionId || undefined;
  return structures.map((s) => ({
    ...s,
    controllingFactionId: owner,
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

export function structureLabel(kind: StructureKind): string {
  return STRUCTURE_KIND_LABELS[kind];
}
