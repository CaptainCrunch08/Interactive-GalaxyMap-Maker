import type {
  City,
  District,
  DistrictKind,
  Faction,
  Planet,
  PlanetClassification,
  PlanetStructure,
  PlanetType,
  SphereDir,
  StructureKind,
} from "../types/campaign";
import {
  DISTRICT_KIND_LABELS,
  STRUCTURE_KIND_LABELS,
} from "../types/campaign";
import { bannerFactionId } from "./federation";
import { buildHexSphere, hexTileDistance, type HexSphere } from "./hexSphere";
import { normalizePlanetClassification } from "./planetClass";
import { generateWarpGateSurface, ensureWarpGateSurface } from "./warpGateSurface";

/** Must match HexPlanet FREQUENCY so tile indices stay valid. */
export const SETTLEMENT_HEX_FREQUENCY = 5;

/** Max hex distance from a city hub for a district to belong to that city. */
export const MAX_DISTRICT_CITY_RANGE = 2;

/**
 * Minimum graph distance between city hubs (each city keeps a 3-hex clear
 * radius, so hubs must be at least 6 apart).
 */
export const MIN_CITY_HUB_SEPARATION = 6;

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
  trade: ["Exchange", "Emporium", "Port-City", "Mart"],
  mining: ["Claim", "Excavation", "Pit-Town", "Drill-Hab"],
  archaeological: ["Dig-Site", "Relic-Camp", "Vault-Town", "Excavation"],
  abandoned_colony: ["Ghost-Hab", "Ruin-Town", "Derelict", "Empty-Sprawl"],
  asteroid_belt: ["Station", "Mining", "Claim", "Relay"],
  warp_gate: ["Gate", "Station", "Crown", "Relay"],
  custom: ["City", "Settlement", "Colony", "Station"],
};

const DISTRICT_KINDS: Record<PlanetType, DistrictKind[]> = {
  hive: ["spire", "underhive", "domed_habitat", "docks", "bastion", "manufactorum", "ruins", "supply_station"],
  forge: ["manufactorum", "bastion", "ruins", "docks", "supply_station", "domed_habitat"],
  agri: ["bastion", "manufactorum", "docks", "camp", "supply_station", "domed_habitat"],
  death: ["camp", "bastion", "ruins", "manufactorum", "supply_station", "domed_habitat"],
  shrine: ["cathedral", "bastion", "ruins", "manufactorum", "supply_station", "domed_habitat"],
  feudal: ["bastion", "cathedral", "camp", "docks", "supply_station", "domed_habitat"],
  fortress: ["bastion", "camp", "manufactorum", "docks", "supply_station", "domed_habitat"],
  homeworld: ["spire", "domed_habitat", "bastion", "docks", "manufactorum", "cathedral", "supply_station"],
  trade: ["docks", "domed_habitat", "bastion", "manufactorum", "supply_station", "spire", "camp"],
  mining: ["manufactorum", "bastion", "docks", "camp", "ruins", "supply_station", "domed_habitat"],
  archaeological: ["ruins", "camp", "cathedral", "bastion", "reliquary", "docks", "supply_station", "domed_habitat"],
  abandoned_colony: ["ruins", "domed_habitat", "camp", "docks", "bastion", "supply_station"],
  asteroid_belt: ["docks", "camp", "ruins", "bastion", "supply_station", "domed_habitat"],
  warp_gate: ["docks", "bastion", "camp"],
  custom: ["bastion", "docks", "ruins", "camp", "manufactorum", "supply_station", "domed_habitat"],
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
  trade: [0, 1],
  mining: [1, 2],
  archaeological: [0, 1],
  abandoned_colony: [0, 0],
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
  trade: [3, 4],
  mining: [2, 3],
  archaeological: [2, 3],
  abandoned_colony: [1, 2],
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
  trade: [3, 4],
  mining: [2, 3],
  archaeological: [2, 3],
  abandoned_colony: [2, 4],
  asteroid_belt: [1, 2],
  warp_gate: [0, 0],
  custom: [2, 3],
};

const STRUCTURE_POOL: Record<PlanetType, StructureKind[]> = {
  hive: ["ore_mine", "trench_line", "supply_network", "outpost"],
  forge: ["ore_mine", "supply_network", "outpost"],
  agri: ["ore_mine", "supply_network", "outpost"],
  death: ["trench_line", "ore_mine", "supply_network", "outpost"],
  shrine: ["ore_mine", "supply_network", "outpost", "ruins_site"],
  feudal: ["ore_mine", "supply_network", "outpost"],
  fortress: ["trench_line", "ore_mine", "supply_network", "outpost"],
  homeworld: ["ore_mine", "trench_line", "supply_network", "outpost", "space_port"],
  trade: ["space_port", "supply_network", "relay", "outpost", "ore_mine"],
  mining: ["ore_mine", "supply_network", "outpost", "trench_line"],
  archaeological: ["ruins_site", "outpost", "supply_network", "relay"],
  abandoned_colony: [
    "ruins_site",
    "space_port",
    "outpost",
    "supply_network",
    "relay",
  ],
  asteroid_belt: ["ore_mine", "supply_network", "outpost"],
  warp_gate: [],
  custom: ["ore_mine", "trench_line", "supply_network", "outpost"],
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
  trade: [2, 4],
  mining: [3, 5],
  archaeological: [2, 4],
  abandoned_colony: [3, 5],
  asteroid_belt: [1, 3],
  warp_gate: [0, 0],
  custom: [1, 3],
};

const STRUCTURE_NAME_PREFIX: Record<StructureKind, string[]> = {
  space_port: ["Space Port", "Starport", "Drop-Port"],
  ore_mine: ["Ore Mine", "Extraction Pit", "Deep Claim"],
  trench_line: ["Trench Line", "War Dig", "Fire Trench"],
  relay: ["Relay", "Vox Array", "Beacon"],
  relay_crown: ["Relay Crown", "Gate Crown", "Warp Spire"],
  outpost: ["Outpost", "Watch Post", "Frontier Post"],
  ruins_site: ["Ruins", "Dead Site", "Collapsed Works"],
  supply_network: ["Supply Hub", "Logistics Nexus", "Conduit Yard"],
};

/** Map retired district kinds from older saves onto the live set. */
export function normalizeDistrictKind(kind: string): DistrictKind {
  switch (kind) {
    case "foundry":
    case "refinery":
      return "manufactorum";
    case "railhead":
      return "docks";
    case "agriplex":
    case "silo":
    case "reservoir":
      return "domed_habitat";
    case "fortress":
    case "outpost":
      return "bastion";
    case "cloister":
      return "cathedral";
    case "quarter":
      return "domed_habitat";
    case "spire":
    case "underhive":
    case "domed_habitat":
    case "docks":
    case "bastion":
    case "manufactorum":
    case "camp":
    case "cathedral":
    case "reliquary":
    case "ruins":
    case "supply_station":
      return kind;
    default:
      return "ruins";
  }
}


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
  /** When true, never pack leftover tiles closer than minDist. */
  strict = false,
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
  if (!strict) {
    for (const idx of order) {
      if (picked.length >= count) break;
      if (!picked.includes(idx)) picked.push(idx);
    }
  }
  return picked.slice(0, count);
}

/**
 * Place city hubs by repeatedly sampling uniformly from tiles that still
 * respect {@link minDist} from every hub already chosen. Avoids the
 * single-permutation greedy scan, which tended to recreate similar layouts.
 */
function pickCityHubTiles(
  sphere: HexSphere,
  count: number,
  minDist: number,
  rng: Rng,
  exclude?: Set<number>,
): number[] {
  const free = sphere.tiles
    .map((_, i) => i)
    .filter((i) => !exclude?.has(i));
  const picked: number[] = [];
  // Precompute neighbor BFS distances lazily per hub for faster filtering.
  const distFromHub: number[][] = [];

  const distTo = (hub: number, tile: number): number => {
    let row = distFromHub[hub];
    if (!row) {
      row = new Array(sphere.tiles.length).fill(999);
      const q = [hub];
      row[hub] = 0;
      let head = 0;
      while (head < q.length) {
        const cur = q[head++]!;
        const d = row[cur]!;
        if (d >= minDist) continue;
        for (const n of sphere.neighbors[cur] ?? []) {
          if (row[n]! <= d + 1) continue;
          row[n] = d + 1;
          q.push(n);
        }
      }
      distFromHub[hub] = row;
    }
    return row[tile]!;
  };

  for (let n = 0; n < count; n++) {
    const candidates: number[] = [];
    for (const tile of free) {
      if (picked.includes(tile)) continue;
      if (picked.every((h) => distTo(h, tile) >= minDist)) {
        candidates.push(tile);
      }
    }
    if (candidates.length === 0) break;
    // Uniform pick among all legal tiles — not "first in a shuffled list".
    picked.push(candidates[Math.floor(rng() * candidates.length)]!);
  }
  return picked;
}

/** True when `tileIndex` is far enough from every existing city hub. */
export function tileRespectsCitySeparation(
  cities: City[],
  tileIndex: number,
  minDist: number = MIN_CITY_HUB_SEPARATION,
): boolean {
  if (cities.length === 0) return true;
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  return cities.every(
    (c) => hexTileDistance(sphere, c.tileIndex, tileIndex) >= minDist,
  );
}

/** Free tiles at graph distance 1..maxRange from a hub (hub itself excluded). */
function tilesInHubRange(
  sphere: HexSphere,
  hub: number,
  maxRange: number,
  blocked: Set<number>,
): number[] {
  const out: number[] = [];
  const dist = new Map<number, number>([[hub, 0]]);
  const q = [hub];
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    const d = dist.get(cur)!;
    if (d >= maxRange) continue;
    for (const n of sphere.neighbors[cur] ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
      if (!blocked.has(n)) out.push(n);
    }
  }
  return out;
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
  // Salt with type so same-id regenerations across kinds diverge, and a
  // second stream so hub picks aren't locked to the old ":tiles" sequence.
  const rng = mulberry32(seedFromString(`${planetId}:cities:${type}`));
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const [cMin, cMax] = CITY_COUNT[type];
  const cityCount = Math.min(
    randInt(rng, cMin, cMax),
    Math.floor(sphere.tiles.length / (MIN_CITY_HUB_SEPARATION * 3)),
  );
  const hubTiles = pickCityHubTiles(
    sphere,
    cityCount,
    MIN_CITY_HUB_SEPARATION,
    rng,
  );
  const used = new Set<number>(hubTiles);
  const kinds = DISTRICT_KINDS[type];
  const {
    defaultFactionId,
    rivalFactionId,
    contestedRate = rivalFactionId ? 0.35 : 0,
  } = options;
  /** Planet-wide: hive spires must never share an edge. */
  const spireTiles = new Set<number>();

  const rawCities = hubTiles.map((hub, ci) => {
    let owner = defaultFactionId;
    if (rivalFactionId && rng() < contestedRate * 0.5) owner = rivalFactionId;

    const [dMin, dMax] = DISTRICTS_PER_CITY[type];
    const [mMin, mMax] = MANUFACTORUMS_PER_CITY[type];
    const manufCount = randInt(rng, mMin, mMax);
    const otherWant = randInt(rng, dMin, dMax);
    const want = manufCount + otherWant;
    // Any free tile within 2 hexes of the hub — equal chance, not ring-1 first.
    const districtTiles = shuffle(
      rng,
      tilesInHubRange(sphere, hub, MAX_DISTRICT_CITY_RANGE, used),
    ).slice(0, want);

    for (const t of districtTiles) used.add(t);

    const otherKinds = kinds.filter((k) => k !== "manufactorum");
    const kindPool = otherKinds.length > 0 ? otherKinds : kinds;
    const nonSpirePool = kindPool.filter((k) => k !== "spire");
    const nonSpireFallback =
      nonSpirePool.length > 0 ? nonSpirePool : (["domed_habitat"] as DistrictKind[]);

    const districts: District[] = districtTiles.map((tileIndex, di) => {
      let dOwner = owner;
      if (rivalFactionId && rng() < contestedRate) dOwner = rivalFactionId;
      let kind: DistrictKind =
        di < manufCount ? "manufactorum" : pick(rng, kindPool);
      if (kind === "spire") {
        const touchesSpire = (sphere.neighbors[tileIndex] ?? []).some((n) =>
          spireTiles.has(n),
        );
        if (touchesSpire) {
          kind = pick(rng, nonSpireFallback);
        } else {
          spireTiles.add(tileIndex);
        }
      }
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
 * Reposition city hubs + districts on new hexes while keeping the same city
 * and district records (ids, names, kinds, owners). Structures stay put.
 *
 * Follows generation rules:
 * - districts stay within {@link MAX_DISTRICT_CITY_RANGE} of their city hub
 * - hubs prefer {@link MIN_CITY_HUB_SEPARATION} spacing
 * - hive spires never share an edge
 * - underhives must share an edge with a hive spire
 */
export function shufflePlanetSettlements(
  planet: Planet,
  rng: Rng = Math.random,
): { cities: City[]; independentDistricts: District[] } | null {
  if (planet.type === "warp_gate" || planetHasNoSurfaceSettlements(planet)) {
    return null;
  }

  for (let attempt = 0; attempt < 48; attempt++) {
    const strictHubs = attempt < 36;
    const result = tryShufflePlanetSettlements(planet, rng, strictHubs);
    if (result && shuffleLayoutValid(result.cities, result.independentDistricts)) {
      return result;
    }
  }
  return null;
}

function tileTouchesSpire(
  sphere: HexSphere,
  tile: number,
  spireTiles: Set<number>,
): boolean {
  return (sphere.neighbors[tile] ?? []).some((n) => spireTiles.has(n));
}

function shuffleLayoutValid(
  cities: City[],
  independentDistricts: District[],
): boolean {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);

  for (const city of cities) {
    for (const d of city.districts) {
      if (
        hexTileDistance(sphere, city.tileIndex, d.tileIndex) >
        MAX_DISTRICT_CITY_RANGE
      ) {
        return false;
      }
    }
  }

  const spires: number[] = [];
  const underhives: number[] = [];
  for (const city of cities) {
    for (const d of city.districts) {
      if (d.kind === "spire") spires.push(d.tileIndex);
      if (d.kind === "underhive") underhives.push(d.tileIndex);
    }
  }
  for (const d of independentDistricts) {
    if (d.kind === "spire") spires.push(d.tileIndex);
    if (d.kind === "underhive") underhives.push(d.tileIndex);
  }

  const spireSet = new Set(spires);
  for (let i = 0; i < spires.length; i++) {
    for (let j = i + 1; j < spires.length; j++) {
      if ((sphere.neighbors[spires[i]!] ?? []).includes(spires[j]!)) {
        return false;
      }
    }
  }
  for (const t of underhives) {
    if (!tileTouchesSpire(sphere, t, spireSet)) return false;
  }
  return true;
}

function tryShufflePlanetSettlements(
  planet: Planet,
  rng: Rng,
  strictHubSeparation: boolean,
): { cities: City[]; independentDistricts: District[] } | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const structureTiles = new Set(
    (planet.structures ?? []).map((s) => s.tileIndex),
  );
  const blocked = new Set<number>(structureTiles);
  const citiesIn = planet.cities ?? [];
  const independentsIn = planet.independentDistricts ?? [];

  const placedHubs: number[] = [];
  const hubByCityId = new Map<string, number>();

  for (const city of shuffle(rng, citiesIn)) {
    const spaced = sphere.tiles
      .map((_, i) => i)
      .filter(
        (i) =>
          !blocked.has(i) &&
          placedHubs.every(
            (h) =>
              tileDistance(sphere.neighbors, h, i) >=
              MIN_CITY_HUB_SEPARATION,
          ),
      );
    let hub =
      spaced.length > 0
        ? spaced[Math.floor(rng() * spaced.length)]!
        : undefined;
    if (hub == null && !strictHubSeparation) {
      const anyFree = sphere.tiles
        .map((_, i) => i)
        .filter((i) => !blocked.has(i) && !placedHubs.includes(i));
      hub =
        anyFree.length > 0
          ? anyFree[Math.floor(rng() * anyFree.length)]!
          : undefined;
    }
    if (hub == null) return null;
    placedHubs.push(hub);
    hubByCityId.set(city.id, hub);
    blocked.add(hub);
  }

  /** Free tiles in a city's footprint (not yet claimed by this shuffle). */
  const poolForCity = (hub: number): number[] =>
    shuffle(
      rng,
      tilesInHubRange(sphere, hub, MAX_DISTRICT_CITY_RANGE, blocked),
    );

  const tileByDistrictId = new Map<string, number>();
  const spireTiles = new Set<number>();

  const claim = (districtId: string, tile: number) => {
    tileByDistrictId.set(districtId, tile);
    blocked.add(tile);
  };

  // Pass 1 — hive spires (never adjacent), each within its city range.
  for (const city of shuffle(rng, citiesIn)) {
    const hub = hubByCityId.get(city.id)!;
    const pool = poolForCity(hub);
    for (const d of shuffle(
      rng,
      city.districts.filter((x) => x.kind === "spire"),
    )) {
      const tile = pool.find(
        (t) => !blocked.has(t) && !tileTouchesSpire(sphere, t, spireTiles),
      );
      if (tile == null) return null;
      claim(d.id, tile);
      spireTiles.add(tile);
    }
  }
  for (const d of shuffle(
    rng,
    independentsIn.filter((x) => x.kind === "spire"),
  )) {
    const tile = shuffle(
      rng,
      sphere.tiles
        .map((_, i) => i)
        .filter(
          (i) => !blocked.has(i) && !tileTouchesSpire(sphere, i, spireTiles),
        ),
    )[0];
    if (tile == null) return null;
    claim(d.id, tile);
    spireTiles.add(tile);
  }

  // Pass 2 — underhives (must touch a spire), within city range.
  for (const city of shuffle(rng, citiesIn)) {
    const hub = hubByCityId.get(city.id)!;
    const pool = poolForCity(hub);
    for (const d of shuffle(
      rng,
      city.districts.filter((x) => x.kind === "underhive"),
    )) {
      const tile = pool.find(
        (t) => !blocked.has(t) && tileTouchesSpire(sphere, t, spireTiles),
      );
      if (tile == null) return null;
      claim(d.id, tile);
    }
  }
  for (const d of shuffle(
    rng,
    independentsIn.filter((x) => x.kind === "underhive"),
  )) {
    const tile = shuffle(
      rng,
      sphere.tiles
        .map((_, i) => i)
        .filter(
          (i) => !blocked.has(i) && tileTouchesSpire(sphere, i, spireTiles),
        ),
    )[0];
    if (tile == null) return null;
    claim(d.id, tile);
  }

  // Pass 3 — remaining districts within city range / free hexes.
  for (const city of shuffle(rng, citiesIn)) {
    const hub = hubByCityId.get(city.id)!;
    const pool = poolForCity(hub);
    for (const d of shuffle(
      rng,
      city.districts.filter(
        (x) => x.kind !== "spire" && x.kind !== "underhive",
      ),
    )) {
      const tile = pool.find((t) => !blocked.has(t));
      if (tile == null) return null;
      claim(d.id, tile);
    }
  }
  for (const d of shuffle(
    rng,
    independentsIn.filter(
      (x) => x.kind !== "spire" && x.kind !== "underhive",
    ),
  )) {
    const tile = shuffle(
      rng,
      sphere.tiles.map((_, i) => i).filter((i) => !blocked.has(i)),
    )[0];
    if (tile == null) return null;
    claim(d.id, tile);
  }

  const relocate = (d: District): District => {
    const tileIndex = tileByDistrictId.get(d.id);
    if (tileIndex == null) return d;
    return {
      ...d,
      tileIndex,
      dir: dirFromTile(sphere, tileIndex),
    };
  };

  const cities: City[] = citiesIn.map((city) => {
    const hub = hubByCityId.get(city.id)!;
    return {
      ...city,
      tileIndex: hub,
      dir: dirFromTile(sphere, hub),
      districts: city.districts.map(relocate),
    };
  });
  const independentDistricts = independentsIn.map(relocate);
  return normalizeDistrictFootprints(
    cities,
    independentDistricts,
    planet.structures ?? [],
  );
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
  const normalized = normalizeDistrictFootprints(
    sanitizeHiveDistrictLayout(citiesRaw),
    [],
    [],
  );
  const cities = sanitizeHiveDistrictLayout(normalized.cities);
  const independentDistricts = normalized.independentDistricts;
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
  if (!(kind in STRUCTURE_KIND_LABELS)) return null;
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

/** Place a new city hub on a random free hex far enough from other cities. */
export function createCityOnFreeHex(
  planet: Planet,
  options?: { name?: string; controllingFactionId?: string },
): City | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
  const cities = planet.cities ?? [];
  const candidates = sphere.tiles
    .map((_, i) => i)
    .filter(
      (i) => !occupied.has(i) && tileRespectsCitySeparation(cities, i),
    );
  if (candidates.length === 0) return null;
  const tileIndex =
    candidates[Math.floor(Math.random() * candidates.length)]!;
  return createCityAtTile(planet, tileIndex, options);
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
  if (!tileRespectsCitySeparation(planet.cities ?? [], tileIndex)) return null;
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

/**
 * Attach a district to a city on a free hex within city limits only.
 * Never places outside {@link MAX_DISTRICT_CITY_RANGE} of the hub.
 */
export function createDistrictOnFreeHex(
  planet: Planet,
  cityId: string,
  kind: DistrictKind,
  options?: { name?: string; controllingFactionId?: string },
): {
  cities: City[];
  independentDistricts: District[];
  district: District;
} | null {
  const city = (planet.cities ?? []).find((c) => c.id === cityId);
  if (!city) return null;
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
  const near = tilesAroundCity(city, occupied);
  for (const tileIndex of near) {
    const result = createDistrictAtTile(
      planet,
      cityId,
      tileIndex,
      kind,
      options,
    );
    if (result) return result;
  }
  return null;
}

/** Districts that may sit on free hexes outside any city footprint. */
export function canPlaceDistrictIndependently(kind: DistrictKind): boolean {
  return kind === "ruins";
}

/** Place a district on a free hex with no parent city. */
export function createIndependentDistrictAtTile(
  planet: Planet,
  tileIndex: number,
  kind: DistrictKind,
  options?: { name?: string; controllingFactionId?: string },
): {
  cities: City[];
  independentDistricts: District[];
  district: District;
} | null {
  if (!(kind in DISTRICT_KIND_LABELS)) return null;
  if (!canPlaceDistrictIndependently(kind)) return null;
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  if (tileIndex < 0 || tileIndex >= sphere.tiles.length) return null;
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
  if (occupied.has(tileIndex)) return null;
  const existing = [
    ...(planet.cities ?? []).flatMap((c) => c.districts),
    ...(planet.independentDistricts ?? []),
  ];
  const count = existing.filter((d) => d.kind === kind).length;
  const district: District = {
    id: crypto.randomUUID(),
    name:
      options?.name ?? `${DISTRICT_KIND_LABELS[kind]} ${count + 1}`,
    kind,
    controllingFactionId:
      options?.controllingFactionId ?? planet.controllingFactionId,
    tileIndex,
    dir: dirFromTile(sphere, tileIndex),
    notes: "",
  };
  return {
    cities: planet.cities ?? [],
    independentDistricts: [
      ...(planet.independentDistricts ?? []),
      district,
    ],
    district,
  };
}

/** Attach a district to a city on a free hex within that city's limits. */
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
  if (!(kind in DISTRICT_KIND_LABELS)) return null;
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
  if (!city) {
    // No / missing parent — ruins may still land as independents.
    return createIndependentDistrictAtTile(planet, tileIndex, kind, options);
  }
  if (
    hexTileDistance(sphere, city.tileIndex, tileIndex) > MAX_DISTRICT_CITY_RANGE
  ) {
    // Ruins may sit outside city limits; other kinds must stay in range.
    return createIndependentDistrictAtTile(planet, tileIndex, kind, options);
  }
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
  // Keep the district on the chosen city — do not reassign to a nearer rival.
  const citiesWithDistrict = cities.map((c) =>
    c.id === cityId
      ? { ...c, districts: [...c.districts, district] }
      : c,
  );
  return {
    cities: citiesWithDistrict,
    independentDistricts: planet.independentDistricts ?? [],
    district,
  };
}

/** Free tiles within 2 hexes of a city hub (same footprint as generation). */
export function tilesAroundCity(
  city: City,
  occupied?: Set<number>,
): number[] {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  return tilesInHubRange(
    sphere,
    city.tileIndex,
    MAX_DISTRICT_CITY_RANGE,
    occupied ?? new Set<number>(),
  );
}

export function isTileAroundCity(city: City, tileIndex: number): boolean {
  if (tileIndex === city.tileIndex) return false;
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  return (
    hexTileDistance(sphere, city.tileIndex, tileIndex) <= MAX_DISTRICT_CITY_RANGE
  );
}

/** Keep cached dirs aligned with tile indices (markers / links use dir). */
export function syncSettlementDirs<
  T extends Pick<Planet, "cities" | "independentDistricts" | "structures">,
>(planet: T): T {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const fixDir = <U extends { tileIndex: number; dir: SphereDir }>(item: U): U => ({
    ...item,
    dir: dirFromTile(sphere, item.tileIndex),
  });
  return {
    ...planet,
    cities: (planet.cities ?? []).map((c) => ({
      ...fixDir(c),
      districts: c.districts.map(fixDir),
    })),
    independentDistricts: (planet.independentDistricts ?? []).map(fixDir),
    structures: (planet.structures ?? []).map(fixDir),
  };
}

/**
 * Move any city-owned district that sits outside the hub range onto a free
 * in-range tile when possible. Leftovers that cannot fit become independent.
 */
export function clampDistrictsToCityLimits(
  cities: City[],
  independentDistricts: District[] = [],
  structures: PlanetStructure[] = [],
): { cities: City[]; independentDistricts: District[] } {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const blocked = settlementTileSet(cities, structures, independentDistricts);
  // Free district tiles for re-placement (re-claimed as we go).
  for (const city of cities) {
    for (const d of city.districts) blocked.delete(d.tileIndex);
  }

  const nextIndependents = [...independentDistricts];
  const nextCities: City[] = cities.map((city) => {
    blocked.delete(city.tileIndex);
    const kept: District[] = [];
    for (const d of city.districts) {
      const dist = hexTileDistance(sphere, city.tileIndex, d.tileIndex);
      if (dist <= MAX_DISTRICT_CITY_RANGE && !blocked.has(d.tileIndex)) {
        blocked.add(d.tileIndex);
        kept.push({
          ...d,
          dir: dirFromTile(sphere, d.tileIndex),
        });
        continue;
      }
      const pool = tilesInHubRange(
        sphere,
        city.tileIndex,
        MAX_DISTRICT_CITY_RANGE,
        blocked,
      );
      const tile = pool[0];
      if (tile == null) {
        nextIndependents.push(d);
        continue;
      }
      blocked.add(tile);
      kept.push({
        ...d,
        tileIndex: tile,
        dir: dirFromTile(sphere, tile),
      });
    }
    blocked.add(city.tileIndex);
    return {
      ...city,
      dir: dirFromTile(sphere, city.tileIndex),
      districts: kept,
    };
  });

  return {
    cities: nextCities,
    independentDistricts: nextIndependents.map((d) => ({
      ...d,
      dir: dirFromTile(sphere, d.tileIndex),
    })),
  };
}

/**
 * Pull independent districts into cities that still have free in-range hexes.
 */
export function absorbIndependentDistricts(
  cities: City[],
  independentDistricts: District[] = [],
  structures: PlanetStructure[] = [],
): { cities: City[]; independentDistricts: District[] } {
  if (independentDistricts.length === 0 || cities.length === 0) {
    return { cities, independentDistricts };
  }
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const blocked = settlementTileSet(cities, structures, independentDistricts);
  for (const d of independentDistricts) blocked.delete(d.tileIndex);

  const nextCities = cities.map((c) => ({
    ...c,
    districts: [...c.districts],
  }));
  const remaining: District[] = [];

  for (const d of independentDistricts) {
    // Only absorb when the hex already sits inside a city footprint.
    // Never teleport wilderness districts (e.g. ruins) onto a city.
    const inRangeCities = nextCities
      .map((city) => ({
        city,
        dist: hexTileDistance(sphere, city.tileIndex, d.tileIndex),
      }))
      .filter(({ dist }) => dist <= MAX_DISTRICT_CITY_RANGE)
      .sort((a, b) => a.dist - b.dist || a.city.id.localeCompare(b.city.id));

    let placed = false;
    for (const { city } of inRangeCities) {
      if (blocked.has(d.tileIndex)) break;
      blocked.add(d.tileIndex);
      city.districts.push({
        ...d,
        dir: dirFromTile(sphere, d.tileIndex),
      });
      placed = true;
      break;
    }
    if (placed) continue;

    blocked.add(d.tileIndex);
    remaining.push({
      ...d,
      dir: dirFromTile(sphere, d.tileIndex),
    });
  }

  return { cities: nextCities, independentDistricts: remaining };
}

/** Clamp out-of-range districts, absorb orphans into free city slots, sync dirs. */
export function normalizeDistrictFootprints(
  cities: City[],
  independentDistricts: District[] = [],
  structures: PlanetStructure[] = [],
): { cities: City[]; independentDistricts: District[] } {
  const clamped = clampDistrictsToCityLimits(
    cities,
    independentDistricts,
    structures,
  );
  const absorbed = absorbIndependentDistricts(
    clamped.cities,
    clamped.independentDistricts,
    structures,
  );
  const synced = syncSettlementDirs({
    cities: absorbed.cities,
    independentDistricts: absorbed.independentDistricts,
    structures,
  });
  return {
    cities: synced.cities ?? [],
    independentDistricts: synced.independentDistricts ?? [],
  };
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
  /**
   * When provided, city owners collapse to their federation banner so allied
   * subfactions (Blood Angels + Black Templars) count as one controller.
   */
  factions?: Faction[],
): string | undefined {
  const counts = new Map<string, number>();
  for (const city of cities) {
    const raw = city.controllingFactionId;
    if (!raw) continue;
    const id =
      factions && factions.length > 0
        ? (bannerFactionId(factions, raw) ?? raw)
        : raw;
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

function cityTilesMissing(cities: City[]): boolean {
  return cities.some(
    (c) =>
      typeof c.tileIndex !== "number" ||
      c.districts.some((d) => typeof d.tileIndex !== "number"),
  );
}

function structureTilesMissing(structures: PlanetStructure[]): boolean {
  return structures.some((s) => typeof s.tileIndex !== "number");
}

/** Clamp districts + scrub claims; never invent new settlements. */
function finalizeExistingSurface(planet: Planet): Planet {
  const structures = planet.structures ?? [];
  const normalized = normalizeDistrictFootprints(
    planet.cities ?? [],
    planet.independentDistricts ?? [],
    structures,
  );
  const tileClaims = scrubTileClaims(
    planet.tileClaims,
    normalized.cities,
    structures,
    normalized.independentDistricts,
  );
  return {
    ...planet,
    cities: normalized.cities,
    independentDistricts: normalized.independentDistricts,
    structures,
    surfaceReady: true,
    tileClaims,
    armies: planet.armies ?? [],
  };
}

export function ensurePlanetCities(
  planet: Planet,
  options?: SettlementGenOptions,
): Planet {
  if (planet.type === "warp_gate") {
    return { ...ensureWarpGateSurface(planet), surfaceReady: true };
  }
  // Gas giants have no land — strip any leftover cities from older saves / gens.
  if (planetHasNoSurfaceSettlements(planet)) {
    return {
      ...planet,
      cities: [],
      independentDistricts: [],
      structures: [],
      surfaceReady: true,
      tileClaims: scrubTileClaims(planet.tileClaims, [], [], []),
      armies: planet.armies ?? [],
    };
  }

  const cities = planet.cities ?? [];
  const structures = planet.structures ?? [];
  const independents = planet.independentDistricts ?? [];

  // Already initialized: keep player deletions (empty lists stay empty).
  if (planet.surfaceReady) {
    return finalizeExistingSurface(planet);
  }

  // Legacy / first touch with existing settlement data — adopt, don't rebuild.
  if (cities.length > 0 || structures.length > 0 || independents.length > 0) {
    // Missing tile indices on old records → full regen once, then lock.
    if (cityTilesMissing(cities) || structureTilesMissing(structures)) {
      const genOpts: SettlementGenOptions = {
        defaultFactionId:
          planet.controllingFactionId ?? options?.defaultFactionId,
        rivalFactionId: options?.rivalFactionId,
        contestedRate: options?.contestedRate,
      };
      const generated = generatePlanetSurface(planet.id, planet.type, {
        ...genOpts,
        classification: planet.classification,
      });
      const tileClaims = scrubTileClaims(
        planet.tileClaims,
        generated.cities,
        generated.structures,
        generated.independentDistricts,
      );
      return {
        ...planet,
        cities: generated.cities,
        independentDistricts: generated.independentDistricts,
        structures: generated.structures,
        surfaceReady: true,
        tileClaims,
        controllingFactionId:
          planetOwnerFromCities(
            generated.cities,
            tileClaims,
            generated.structures,
            generated.independentDistricts,
          ) ?? planet.controllingFactionId,
        armies: planet.armies ?? [],
      };
    }
    return finalizeExistingSurface(planet);
  }

  // Truly empty and never marked ready — first-time surface for this world.
  const genOpts: SettlementGenOptions = {
    defaultFactionId: planet.controllingFactionId ?? options?.defaultFactionId,
    rivalFactionId: options?.rivalFactionId,
    contestedRate: options?.contestedRate,
  };
  const generated = generatePlanetSurface(planet.id, planet.type, {
    ...genOpts,
    classification: planet.classification,
  });
  const tileClaims = scrubTileClaims(
    planet.tileClaims,
    generated.cities,
    generated.structures,
    generated.independentDistricts,
  );
  return {
    ...planet,
    cities: generated.cities,
    independentDistricts: generated.independentDistricts,
    structures: generated.structures,
    surfaceReady: true,
    tileClaims,
    controllingFactionId:
      planetOwnerFromCities(
        generated.cities,
        tileClaims,
        generated.structures,
        generated.independentDistricts,
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
