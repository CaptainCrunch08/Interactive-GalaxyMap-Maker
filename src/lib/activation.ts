import type { City, District, Planet } from "../types/campaign";
import { buildHexSphere, hexTileDistance } from "./hexSphere";
import {
  SETTLEMENT_HEX_FREQUENCY,
  MAX_DISTRICT_CITY_RANGE,
} from "./settlements";
import {
  collectSupplyNetworks,
  collectSupplyStations,
  tilesAreHexAdjacent,
} from "./supplyNetwork";

/** City hub contributes this many activation points. */
export const CITY_ACTIVATION_POINTS = 2;
/** Hive Spire AP when valid (city-owned, not adjacent to another spire). */
export const SPIRE_ACTIVATION_POINTS = 2;
/** Underhive AP when adjacent to any hive spire on the planet. */
export const UNDERHIVE_ACTIVATION_POINTS = 1;
/** Domed Habitat AP when city-owned. */
export const DOMED_HABITAT_ACTIVATION_POINTS = 1;

/** Max hex distance from city hub for districts to use that city's AP. */
export const ACTIVATION_RANGE = MAX_DISTRICT_CITY_RANGE; // 2

/** Play BP costs (slightly steep). */
export const UNDERHIVE_BP_COST = 500;
export const DOMED_HABITAT_BP_COST = 650;
/** Slightly more than double an underhive. */
export const SPIRE_BP_COST = 1100;

/** Districts that generate AP (do not consume AP). */
export const AP_GENERATOR_KINDS = new Set<District["kind"]>([
  "spire",
  "underhive",
  "domed_habitat",
]);

/**
 * Districts whose mechanical bonuses require 1 AP.
 * Generators never consume. Ruins / flavor-only kinds omitted.
 */
export const AP_CONSUMER_KINDS = new Set<District["kind"]>([
  "docks",
  "bastion",
  "manufactorum",
  "foundry",
  "refinery",
  "railhead",
  "agriplex",
  "silo",
  "reservoir",
  "outpost",
  "fortress",
  "camp",
  "cathedral",
  "reliquary",
  "cloister",
  "quarter",
  "supply_station",
]);

let sphereCache: ReturnType<typeof buildHexSphere> | null = null;
function sphere() {
  return (sphereCache ??= buildHexSphere(SETTLEMENT_HEX_FREQUENCY));
}

function dist(a: number, b: number): number {
  return hexTileDistance(sphere(), a, b);
}

export function isApGenerator(kind: District["kind"]): boolean {
  return AP_GENERATOR_KINDS.has(kind);
}

export function isApConsumer(kind: District["kind"]): boolean {
  return AP_CONSUMER_KINDS.has(kind);
}

/** True when this spire tile is hex-adjacent to another spire on the planet. */
export function spireHasAdjacentSpire(
  planet: Planet,
  spireTileIndex: number,
  selfId?: string,
): boolean {
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind !== "spire") continue;
      if (selfId && d.id === selfId) continue;
      if (tilesAreHexAdjacent(spireTileIndex, d.tileIndex)) return true;
    }
  }
  for (const d of planet.independentDistricts ?? []) {
    if (d.kind !== "spire") continue;
    if (selfId && d.id === selfId) continue;
    if (tilesAreHexAdjacent(spireTileIndex, d.tileIndex)) return true;
  }
  return false;
}

/** True when tile is hex-adjacent to any hive spire on the planet. */
export function tileAdjacentToAnySpire(
  planet: Planet,
  tileIndex: number,
): boolean {
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind === "spire" && tilesAreHexAdjacent(tileIndex, d.tileIndex)) {
        return true;
      }
    }
  }
  for (const d of planet.independentDistricts ?? []) {
    if (d.kind === "spire" && tilesAreHexAdjacent(tileIndex, d.tileIndex)) {
      return true;
    }
  }
  return false;
}

/**
 * AP contributed by a generator district.
 * Independent generators always contribute 0.
 */
export function generatorApContribution(
  planet: Planet,
  cityId: string | null,
  district: District,
): number {
  if (!cityId) return 0; // independents provide nothing
  if (district.kind === "spire") {
    if (spireHasAdjacentSpire(planet, district.tileIndex, district.id)) {
      return 0;
    }
    return SPIRE_ACTIVATION_POINTS;
  }
  if (district.kind === "underhive") {
    if (!tileAdjacentToAnySpire(planet, district.tileIndex)) return 0;
    return UNDERHIVE_ACTIVATION_POINTS;
  }
  if (district.kind === "domed_habitat") {
    return DOMED_HABITAT_ACTIVATION_POINTS;
  }
  return 0;
}

export function cityGeneratedAp(planet: Planet, city: City): number {
  let n = CITY_ACTIVATION_POINTS;
  for (const d of city.districts) {
    if (!isApGenerator(d.kind)) continue;
    // Must be within activation range of hub
    if (dist(d.tileIndex, city.tileIndex) > ACTIVATION_RANGE) continue;
    n += generatorApContribution(planet, city.id, d);
  }
  return n;
}

/** Placement / edit warnings (non-blocking in edit; blocking in play). */
export function districtPlacementWarnings(
  planet: Planet,
  kind: District["kind"],
  tileIndex: number,
  opts?: { ignoreDistrictId?: string },
): string[] {
  const warnings: string[] = [];
  if (kind === "spire") {
    if (spireHasAdjacentSpire(planet, tileIndex, opts?.ignoreDistrictId)) {
      warnings.push(
        "Hive Spires cannot be adjacent — this spire will provide 0 AP",
      );
    }
  }
  if (kind === "underhive") {
    if (!tileAdjacentToAnySpire(planet, tileIndex)) {
      warnings.push(
        "Underhive must be adjacent to a Hive Spire — disabled until it is",
      );
    }
  }
  return warnings;
}

/** All rule violations for an existing district (edit-mode markers). */
export function districtRuleViolations(
  planet: Planet,
  district: District,
  cityId: string | null,
): string[] {
  const warnings = districtPlacementWarnings(
    planet,
    district.kind,
    district.tileIndex,
    { ignoreDistrictId: district.id },
  );
  if (!cityId && isApGenerator(district.kind)) {
    warnings.push(
      "Independent generators provide no activation points",
    );
  }
  return warnings;
}

export function canPlaceSpireAtTile(
  planet: Planet,
  tileIndex: number,
): string | null {
  if (spireHasAdjacentSpire(planet, tileIndex)) {
    return "Hive Spires cannot be placed adjacent to another Hive Spire";
  }
  return null;
}

export function canPlaceUnderhiveAtTile(
  planet: Planet,
  tileIndex: number,
): string | null {
  if (!tileAdjacentToAnySpire(planet, tileIndex)) {
    return "Underhive must be placed adjacent to a Hive Spire";
  }
  return null;
}

/**
 * Build supply adjacency using all stations/networks (existence),
 * so city AP-sharing topology does not depend on activation.
 */
function buildRawSupplyAdj(planet: Planet): Map<string, Set<string>> {
  const stations = collectSupplyStations(planet);
  const networks = collectSupplyNetworks(planet);
  const adj = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  const within = (a: number, b: number) => {
    if (a === b) return false;
    return dist(a, b) <= 3; // SUPPLY_LINK_RANGE
  };
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i]!;
      const b = stations[j]!;
      if (within(a.tileIndex, b.tileIndex)) touch(`s:${a.id}`, `s:${b.id}`);
    }
  }
  for (const s of stations) {
    for (const n of networks) {
      if (within(s.tileIndex, n.tileIndex)) touch(`s:${s.id}`, `n:${n.id}`);
    }
  }
  for (let i = 0; i < networks.length; i++) {
    for (let j = i + 1; j < networks.length; j++) {
      const a = networks[i]!;
      const b = networks[j]!;
      if (within(a.tileIndex, b.tileIndex)) touch(`n:${a.id}`, `n:${b.id}`);
    }
  }
  return adj;
}

function bfsKeys(adj: Map<string, Set<string>>, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of adj.get(cur) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}

/** Supply node keys hex-adjacent to a city hub. */
function citySupplyHooks(planet: Planet, city: City): string[] {
  const keys: string[] = [];
  for (const s of collectSupplyStations(planet)) {
    if (tilesAreHexAdjacent(city.tileIndex, s.tileIndex)) {
      keys.push(`s:${s.id}`);
    }
    // Station belonging to this city also hooks it
    if (
      s.cityId === city.id ||
      city.districts.some((d) => d.id === s.id)
    ) {
      keys.push(`s:${s.id}`);
    }
  }
  for (const n of collectSupplyNetworks(planet)) {
    if (tilesAreHexAdjacent(city.tileIndex, n.tileIndex)) {
      keys.push(`n:${n.id}`);
    }
  }
  return [...new Set(keys)];
}

/**
 * Groups of city ids that share AP via the supply chain.
 * Isolated cities are singleton groups.
 */
export function cityApShareGroups(planet: Planet): string[][] {
  const cities = planet.cities ?? [];
  if (cities.length === 0) return [];

  const adj = buildRawSupplyAdj(planet);
  const cityHooks = new Map<string, string[]>();
  for (const c of cities) {
    cityHooks.set(c.id, citySupplyHooks(planet, c));
  }

  // Union-find cities that share a supply component
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p !== id) {
      const r = find(p);
      parent.set(id, r);
      return r;
    }
    return id;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const c of cities) parent.set(c.id, c.id);

  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const a = cities[i]!;
      const b = cities[j]!;
      const hooksA = cityHooks.get(a.id) ?? [];
      const hooksB = cityHooks.get(b.id) ?? [];
      if (hooksA.length === 0 || hooksB.length === 0) continue;
      const want = new Set(hooksB);
      let linked = false;
      for (const start of hooksA) {
        if (!adj.has(start)) {
          if (want.has(start)) {
            linked = true;
            break;
          }
          continue;
        }
        const reached = bfsKeys(adj, start);
        for (const k of want) {
          if (reached.has(k) || k === start) {
            linked = true;
            break;
          }
        }
        if (linked) break;
      }
      if (linked) union(a.id, b.id);
    }
  }

  const groups = new Map<string, string[]>();
  for (const c of cities) {
    const r = find(c.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(c.id);
  }
  return [...groups.values()];
}

export type ActivationSnapshot = {
  /** districtId → activated for mechanical bonuses */
  activated: Set<string>;
  /** cityId → AP generated (local, before share display) */
  cityAp: Map<string, number>;
  /** cityId → shared pool size used for its group */
  groupAp: Map<string, number>;
  /** cityId → how many consumer slots used in its group allocation */
  groupUsed: Map<string, number>;
  /** Warnings for edit UI */
  warnings: string[];
};

/**
 * Compute which consumer districts are activated.
 * Generators never consume. Independents never activate / never generate.
 * Cities in the same supply component share one AP pool.
 */
export function computeActivation(planet: Planet): ActivationSnapshot {
  const activated = new Set<string>();
  const cityAp = new Map<string, number>();
  const groupAp = new Map<string, number>();
  const groupUsed = new Map<string, number>();
  const warnings: string[] = [];

  const cities = planet.cities ?? [];
  for (const city of cities) {
    cityAp.set(city.id, cityGeneratedAp(planet, city));
    for (const d of city.districts) {
      for (const w of districtPlacementWarnings(planet, d.kind, d.tileIndex, {
        ignoreDistrictId: d.id,
      })) {
        warnings.push(`${d.name}: ${w}`);
      }
    }
  }
  for (const d of planet.independentDistricts ?? []) {
    if (isApGenerator(d.kind)) {
      warnings.push(
        `${d.name}: independent generators provide no activation points`,
      );
    }
  }

  const groups = cityApShareGroups(planet);
  const cityById = new Map(cities.map((c) => [c.id, c]));

  for (const group of groups) {
    let pool = 0;
    for (const id of group) pool += cityAp.get(id) ?? 0;
    for (const id of group) groupAp.set(id, pool);

    type Consumer = { id: string; kind: District["kind"]; cityId: string };
    const consumers: Consumer[] = [];
    for (const id of group) {
      const city = cityById.get(id);
      if (!city) continue;
      for (const d of city.districts) {
        if (!isApConsumer(d.kind)) continue;
        if (dist(d.tileIndex, city.tileIndex) > ACTIVATION_RANGE) continue;
        consumers.push({ id: d.id, kind: d.kind, cityId: id });
      }
    }

    // Priority: supply stations first (unlocks logistics/AP topology feel), then id
    consumers.sort((a, b) => {
      const pa = a.kind === "supply_station" ? 0 : 1;
      const pb = b.kind === "supply_station" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id);
    });

    let used = 0;
    for (const c of consumers) {
      if (used >= pool) break;
      activated.add(c.id);
      used += 1;
    }
    for (const id of group) groupUsed.set(id, used);
  }

  return { activated, cityAp, groupAp, groupUsed, warnings };
}

export function isDistrictActivated(
  planet: Planet,
  districtId: string,
  snapshot?: ActivationSnapshot,
): boolean {
  const snap = snapshot ?? computeActivation(planet);
  return snap.activated.has(districtId);
}

/** Collect city-owned districts of a kind that are activated. */
export function activatedDistrictsOfKind(
  planet: Planet,
  kind: District["kind"],
  factionId?: string,
  snapshot?: ActivationSnapshot,
): { cityId: string; district: District }[] {
  const snap = snapshot ?? computeActivation(planet);
  const out: { cityId: string; district: District }[] = [];
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind !== kind) continue;
      if (factionId && d.controllingFactionId !== factionId) continue;
      if (!snap.activated.has(d.id)) continue;
      out.push({ cityId: city.id, district: d });
    }
  }
  return out;
}
