import type {
  City,
  District,
  DistrictKind,
  Planet,
  PlanetClassification,
  PlanetStructure,
  PlanetType,
  SphereDir,
  StructureKind,
} from "../types/campaign";
import {
  DISTRICT_KIND_LABELS,
  DISTRICT_KIND_ORDER,
  STRUCTURE_KIND_LABELS,
  STRUCTURE_KIND_ORDER,
} from "../types/campaign";
import { buildHexSphere, hexTileDistance, type HexSphere } from "./hexSphere";
import { normalizePlanetClassification } from "./planetClass";
import { generateWarpGateSurface, ensureWarpGateSurface } from "./warpGateSurface";

/** Must match HexPlanet FREQUENCY so tile indices stay valid. */
export const SETTLEMENT_HEX_FREQUENCY = 5;

/** Max hex distance from a city hub for a district to belong to that city. */
export const MAX_DISTRICT_CITY_RANGE = 2;

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
  feudal: ["Keep", "Fief", "Manor", "Stronghold"],
  fortress: ["Citadel", "Bastion", "Kasr", "Redoubt"],
  homeworld: ["Capital", "Throne", "Seat", "Primus"],
  asteroid_belt: ["Station", "Mining", "Claim", "Relay"],
  warp_gate: ["Gate", "Station", "Crown", "Relay"],
  custom: ["City", "Settlement", "Colony", "Station"],
};

const DISTRICT_KINDS: Record<PlanetType, DistrictKind[]> = {
  hive: ["spire", "underhive", "domed_habitat", "docks", "bastion", "manufactorum", "ruins", "supply_station"],
  forge: ["manufactorum", "bastion", "ruins", "docks", "outpost", "supply_station", "domed_habitat"],
  agri: ["outpost", "bastion", "manufactorum", "docks", "camp", "supply_station", "domed_habitat"],
  death: ["camp", "bastion", "outpost", "ruins", "manufactorum", "supply_station", "domed_habitat"],
  shrine: ["cathedral", "bastion", "ruins", "manufactorum", "outpost", "supply_station", "domed_habitat"],
  feudal: ["bastion", "cathedral", "outpost", "camp", "docks", "supply_station", "domed_habitat"],
  fortress: ["bastion", "camp", "outpost", "manufactorum", "docks", "supply_station", "domed_habitat"],
  homeworld: ["spire", "domed_habitat", "bastion", "docks", "manufactorum", "cathedral", "supply_station"],
  asteroid_belt: ["outpost", "docks", "camp", "ruins", "bastion", "supply_station", "domed_habitat"],
  warp_gate: ["docks", "bastion", "outpost", "camp"],
  custom: ["bastion", "docks", "outpost", "ruins", "camp", "manufactorum", "supply_station", "domed_habitat"],
};

/** Guaranteed manufactorums per city (forge > hive > agri / others). */
const MANUFACTORUMS_PER_CITY: Record<PlanetType, [number, number]> = {
  forge: [2, 3],
  hive: [1, 2],
  agri: [0, 1],
  death: [0, 1],
  shrine: [0, 1],
  feudal: [0, 1],
  fortress: [1, 2],
  homeworld: [1, 2],
  asteroid_belt: [0, 0],
  warp_gate: [0, 0],
  custom: [0, 1],
};

const CITY_COUNT: Record<PlanetType, [number, number]> = {
  hive: [4, 5],
  forge: [3, 4],
  agri: [2, 3],
  death: [2, 3],
  shrine: [2, 3],
  feudal: [2, 4],
  fortress: [2, 3],
  homeworld: [3, 5],
  asteroid_belt: [0, 1],
  warp_gate: [0, 0],
  custom: [2, 3],
};

const DISTRICTS_PER_CITY: Record<PlanetType, [number, number]> = {
  hive: [3, 4],
  forge: [3, 4],
  agri: [2, 3],
  death: [2, 3],
  shrine: [2, 3],
  feudal: [2, 3],
  fortress: [3, 4],
  homeworld: [3, 4],
  asteroid_belt: [1, 2],
  warp_gate: [0, 0],
  custom: [2, 3],
};

const STRUCTURE_POOL: Record<PlanetType, StructureKind[]> = {
  hive: ["ore_mine", "trench_line", "supply_network"],
  forge: ["ore_mine", "supply_network"],
  agri: ["ore_mine", "supply_network"],
  death: ["trench_line", "ore_mine", "supply_network"],
  shrine: ["ore_mine", "supply_network"],
  feudal: ["ore_mine", "supply_network"],
  fortress: ["trench_line", "ore_mine", "supply_network"],
  homeworld: ["ore_mine", "trench_line", "supply_network"],
  asteroid_belt: ["ore_mine", "supply_network"],
  warp_gate: [],
  custom: ["ore_mine", "trench_line", "supply_network"],
};

const STRUCTURE_COUNT: Record<PlanetType, [number, number]> = {
  hive: [2, 4],
  forge: [2, 4],
  agri: [1, 3],
  death: [1, 3],
  shrine: [1, 2],
  feudal: [1, 3],
  fortress: [2, 4],
  homeworld: [2, 4],
  asteroid_belt: [1, 3],
  warp_gate: [0, 0],
  custom: [1, 3],
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
  relay_crown: ["Relay Crown", "Gate Crown", "Warp Spire"],
  outpost: ["Outpost", "Watch Post", "Frontier Post"],
  ruins_site: ["Ruins", "Dead Site", "Collapsed Works"],
  supply_network: ["Supply Hub", "Logistics Nexus", "Conduit Yard"],
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
  /** Climate class — gas giants never get cities/structures. */
  classification?: PlanetClassification;
};

/** True when this world has no land surface for cities/districts. */
export function planetHasNoSurfaceSettlements(
  planet: Pick<Planet, "type" | "classification">,
): boolean {
  if (planet.type === "asteroid_belt") return false;
  return (
    normalizePlanetClassification(planet.classification) === "gas_giant"
  );
}

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

  const rawCities = hubTiles.map((hub, ci) => {
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

  return sanitizeHiveDistrictLayout(rawCities);
}

/** Enforce spire adjacency ban + underhive-must-touch-spire after gen. */
export function sanitizeHiveDistrictLayout(cities: City[]): City[] {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const allSpires: { cityId: string; district: District }[] = [];
  for (const city of cities) {
    for (const d of city.districts) {
      if (d.kind === "spire") allSpires.push({ cityId: city.id, district: d });
    }
  }
  const disabledSpireIds = new Set<string>();
  for (let i = 0; i < allSpires.length; i++) {
    for (let j = i + 1; j < allSpires.length; j++) {
      const a = allSpires[i]!;
      const b = allSpires[j]!;
      if (
        (sphere.neighbors[a.district.tileIndex] ?? []).includes(
          b.district.tileIndex,
        )
      ) {
        // Keep the first, convert the second
        disabledSpireIds.add(b.district.id);
      }
    }
  }

  const spireTiles = new Set(
    allSpires
      .filter((s) => !disabledSpireIds.has(s.district.id))
      .map((s) => s.district.tileIndex),
  );

  return cities.map((city) => ({
    ...city,
    districts: city.districts.map((d) => {
      if (d.kind === "spire" && disabledSpireIds.has(d.id)) {
        return {
          ...d,
          kind: "domed_habitat" as DistrictKind,
          name: districtName("domed_habitat", 0),
        };
      }
      if (d.kind === "underhive") {
        const ok = [...spireTiles].some((t) =>
          (sphere.neighbors[d.tileIndex] ?? []).includes(t),
        );
        if (!ok) {
          return {
            ...d,
            kind: "domed_habitat" as DistrictKind,
            name: districtName("domed_habitat", 1),
          };
        }
      }
      return d;
    }),
  }));
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
  if (pool.length === 0) return [];
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
): {
  cities: City[];
  structures: PlanetStructure[];
  independentDistricts: District[];
} {
  if (
    normalizePlanetClassification(options.classification) === "gas_giant"
  ) {
    return { cities: [], structures: [], independentDistricts: [] };
  }
  if (type === "warp_gate") {
    const surface = generateWarpGateSurface(planetId, {
      controllingFactionId: options.defaultFactionId,
    });
    return {
      cities: surface.cities,
      structures: surface.structures,
      independentDistricts: [],
    };
  }
  const citiesRaw = generatePlanetCities(planetId, type, options);
  const assigned = reassignDistrictsToCities(citiesRaw, []);
  const cities = sanitizeHiveDistrictLayout(assigned.cities);
  const independentDistricts = assigned.independentDistricts;
  const occupied = settlementTileSet(cities, [], independentDistricts);
  const structures = generatePlanetStructures(
    planetId,
    type,
    occupied,
    options,
  );
  return { cities, structures, independentDistricts };
}

/** Flatten every district currently on the planet. */
export function collectAllDistricts(
  cities: City[],
  independentDistricts: District[] = [],
): District[] {
  const out: District[] = [...independentDistricts];
  for (const city of cities) out.push(...city.districts);
  return out;
}

/**
 * Assign each district to the closest city hub within MAX_DISTRICT_CITY_RANGE.
 * Ties pick a stable pseudo-random city; farther districts become independent.
 */
export function reassignDistrictsToCities(
  cities: City[],
  independentDistricts: District[] = [],
): { cities: City[]; independentDistricts: District[] } {
  const all = collectAllDistricts(cities, independentDistricts);
  if (cities.length === 0) {
    return { cities: [], independentDistricts: all };
  }

  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const byCity = new Map<string, District[]>();
  for (const city of cities) byCity.set(city.id, []);
  const independents: District[] = [];

  for (const district of all) {
    let bestDist = Number.POSITIVE_INFINITY;
    const tied: City[] = [];
    for (const city of cities) {
      const dist = hexTileDistance(sphere, district.tileIndex, city.tileIndex);
      if (dist < bestDist) {
        bestDist = dist;
        tied.length = 0;
        tied.push(city);
      } else if (dist === bestDist) {
        tied.push(city);
      }
    }

    if (!Number.isFinite(bestDist) || bestDist > MAX_DISTRICT_CITY_RANGE) {
      independents.push(district);
      continue;
    }

    const sorted = [...tied].sort((a, b) => a.id.localeCompare(b.id));
    const idx = seedFromString(`${district.id}:city-tie`) % sorted.length;
    const chosen = sorted[idx]!;
    byCity.get(chosen.id)!.push(district);
  }

  return {
    cities: cities.map((city) => ({
      ...city,
      districts: byCity.get(city.id) ?? [],
    })),
    independentDistricts: independents,
  };
}

/** Re-run closest-city assignment on a planet's current districts. */
export function applyDistrictCityAssignment<
  T extends Pick<Planet, "cities" | "independentDistricts">,
>(planet: T): T {
  const { cities, independentDistricts } = reassignDistrictsToCities(
    planet.cities ?? [],
    planet.independentDistricts ?? [],
  );
  return { ...planet, cities, independentDistricts };
}

/** Map tile index set for cities, districts, and structures. */
export function settlementTileSet(
  cities: City[],
  structures: PlanetStructure[] = [],
  independentDistricts: District[] = [],
): Set<number> {
  const set = new Set<number>();
  for (const city of cities) {
    set.add(city.tileIndex);
    for (const d of city.districts) set.add(d.tileIndex);
  }
  for (const d of independentDistricts) set.add(d.tileIndex);
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
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
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
  if (!(STRUCTURE_KIND_ORDER as readonly string[]).includes(kind)) return null;
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  if (tileIndex < 0 || tileIndex >= sphere.tiles.length) return null;
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
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
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
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
): {
  cities: City[];
  independentDistricts: District[];
  district: District;
} | null {
  if (!(DISTRICT_KIND_ORDER as readonly string[]).includes(kind)) return null;
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  if (tileIndex < 0 || tileIndex >= sphere.tiles.length) return null;
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
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
  const citiesWithDistrict = cities.map((c) =>
    c.id === cityId
      ? { ...c, districts: [...c.districts, district] }
      : c,
  );
  const assigned = reassignDistrictsToCities(
    citiesWithDistrict,
    planet.independentDistricts ?? [],
  );
  return {
    cities: assigned.cities,
    independentDistricts: assigned.independentDistricts,
    district,
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
  independentDistricts: District[] = [],
): Record<string, string> {
  if (!claims) return {};
  const occupied = settlementTileSet(cities, structures, independentDistricts);
  const next: Record<string, string> = {};
  for (const [key, factionId] of Object.entries(claims)) {
    if (!factionId || occupied.has(Number(key))) continue;
    next[key] = factionId;
  }
  return next;
}

/**
 * Reassign every open-hex claim to one faction, or clear all claims when
 * factionId is null (used when setting planet / system owner).
 */
export function assignAllTileClaims(
  tileClaims: Record<string, string> | undefined,
  factionId: string | null,
): Record<string, string> {
  if (!tileClaims || !factionId) return {};
  const next: Record<string, string> = {};
  for (const key of Object.keys(tileClaims)) {
    next[key] = factionId;
  }
  return next;
}

export function tileOwnerMap(
  cities: City[],
  tileClaims?: Record<string, string>,
  structures: PlanetStructure[] = [],
  independentDistricts: District[] = [],
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
  for (const d of independentDistricts) {
    if (d.controllingFactionId != null) {
      map.set(d.tileIndex, d.controllingFactionId);
    }
  }
  for (const s of structures) {
    if (s.controllingFactionId != null) {
      map.set(s.tileIndex, s.controllingFactionId);
    }
  }
  return map;
}

/**
 * Planet control: faction that owns the most cities (hubs).
 * Unique lead → that faction; tied for the lead (or no owned cities) → contested.
 * Districts, structures, and open-hex paint do not count.
 */
export function planetOwnerFromCities(
  cities: City[],
  _tileClaims?: Record<string, string>,
  _structures: PlanetStructure[] = [],
  _independentDistricts: District[] = [],
): string | undefined {
  const counts = new Map<string, number>();
  for (const city of cities) {
    const id = city.controllingFactionId;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;

  let bestId: string | undefined;
  let bestCount = 0;
  let tied = false;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      bestId = id;
      bestCount = n;
      tied = false;
    } else if (n === bestCount) {
      tied = true;
    }
  }
  if (tied || bestCount <= 0) return undefined;
  return bestId;
}

/**
 * Default detachment spawn: an owned city hub if the faction controls any,
 * otherwise `fallback` (e.g. war camp), else first city / north pole.
 * When several owned cities exist, prefer the least crowded hub.
 */
export function preferredDetachmentSpawnDir(
  planet: Pick<Planet, "cities" | "armies">,
  factionId: string,
  fallback?: SphereDir,
): SphereDir {
  const owned = (planet.cities ?? []).filter(
    (c) => c.controllingFactionId === factionId,
  );
  if (owned.length === 0) {
    return (
      fallback ??
      (planet.cities?.[0] ? { ...planet.cities[0].dir } : { x: 0, y: 1, z: 0 })
    );
  }
  const crowding = (city: (typeof owned)[0]) =>
    (planet.armies ?? []).filter((a) => {
      const dot =
        a.dir.x * city.dir.x + a.dir.y * city.dir.y + a.dir.z * city.dir.z;
      return dot > 0.92;
    }).length;

  let best = owned[0]!;
  let bestN = crowding(best);
  for (let i = 1; i < owned.length; i++) {
    const c = owned[i]!;
    const n = crowding(c);
    if (n < bestN) {
      best = c;
      bestN = n;
    }
  }
  return { ...best.dir };
}

/** Resolve city / district / structure occupying a hex tile. */
export function featureAtTileIndex(
  tileIndex: number,
  cities: City[],
  structures: PlanetStructure[] = [],
  independentDistricts: District[] = [],
):
  | { kind: "city"; cityId: string }
  | { kind: "district"; cityId: string | null; districtId: string }
  | { kind: "structure"; structureId: string }
  | null {
  for (const city of cities) {
    if (city.tileIndex === tileIndex) {
      return { kind: "city", cityId: city.id };
    }
    for (const d of city.districts) {
      if (d.tileIndex === tileIndex) {
        return {
          kind: "district",
          cityId: city.id,
          districtId: d.id,
        };
      }
    }
  }
  for (const d of independentDistricts) {
    if (d.tileIndex === tileIndex) {
      return {
        kind: "district",
        cityId: null,
        districtId: d.id,
      };
    }
  }
  for (const s of structures) {
    if (s.tileIndex === tileIndex) {
      return { kind: "structure", structureId: s.id };
    }
  }
  return null;
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
  if (planet.type === "warp_gate") {
    return ensureWarpGateSurface(planet);
  }
  // Gas giants have no land — strip any leftover cities from older saves / gens.
  if (planetHasNoSurfaceSettlements(planet)) {
    return {
      ...planet,
      cities: [],
      independentDistricts: [],
      structures: [],
      tileClaims: scrubTileClaims(planet.tileClaims, [], [], []),
      armies: planet.armies ?? [],
    };
  }
  const hasCities =
    planet.cities &&
    planet.cities.length > 0 &&
    !settlementsNeedTiles(planet);
  const hasStructures =
    planet.structures &&
    planet.structures.length > 0 &&
    !structuresNeedTiles(planet);

  if (hasCities && hasStructures) {
    const assigned = applyDistrictCityAssignment({
      cities: planet.cities,
      independentDistricts: planet.independentDistricts ?? [],
    });
    const structures = planet.structures ?? [];
    return {
      ...planet,
      cities: assigned.cities,
      independentDistricts: assigned.independentDistricts,
      structures,
      tileClaims: scrubTileClaims(
        planet.tileClaims,
        assigned.cities,
        structures,
        assigned.independentDistricts,
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
  let independentDistricts = planet.independentDistricts ?? [];
  if (!hasCities) {
    const generated = generatePlanetCities(planet.id, planet.type, genOpts);
    const assigned = reassignDistrictsToCities(generated, []);
    cities = assigned.cities;
    independentDistricts = assigned.independentDistricts;
  } else {
    const assigned = reassignDistrictsToCities(cities, independentDistricts);
    cities = assigned.cities;
    independentDistricts = assigned.independentDistricts;
  }

  let structures = planet.structures ?? [];
  if (!hasStructures) {
    structures = generatePlanetStructures(
      planet.id,
      planet.type,
      settlementTileSet(cities, [], independentDistricts),
      genOpts,
    );
  }

  const tileClaims = scrubTileClaims(
    planet.tileClaims,
    cities,
    structures,
    independentDistricts,
  );
  return {
    ...planet,
    cities,
    independentDistricts,
    structures,
    tileClaims,
    controllingFactionId:
      planetOwnerFromCities(
        cities,
        tileClaims,
        structures,
        independentDistricts,
      ) ?? planet.controllingFactionId,
    armies: planet.armies ?? [],
  };
}

export function assignAllDistricts(
  cities: City[],
  factionId: string | null,
  independentDistricts: District[] = [],
): { cities: City[]; independentDistricts: District[] } {
  const owner = factionId || undefined;
  return {
    cities: cities.map((c) => ({
      ...c,
      controllingFactionId: owner,
      districts: c.districts.map((d) => ({
        ...d,
        controllingFactionId: owner,
      })),
    })),
    independentDistricts: independentDistricts.map((d) => ({
      ...d,
      controllingFactionId: owner,
    })),
  };
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

export function countDistrictsByFaction(
  cities: City[],
  independentDistricts: District[] = [],
): Map<string, number> {
  const map = new Map<string, number>();
  const bump = (id: string | undefined) => {
    const key = id ?? "__none__";
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const city of cities) {
    bump(city.controllingFactionId);
    for (const d of city.districts) bump(d.controllingFactionId);
  }
  for (const d of independentDistricts) bump(d.controllingFactionId);
  return map;
}

export function structureLabel(kind: StructureKind): string {
  return STRUCTURE_KIND_LABELS[kind];
}
