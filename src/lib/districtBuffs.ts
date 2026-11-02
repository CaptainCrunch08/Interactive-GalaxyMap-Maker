import type {
  City,
  District,
  Planet,
  PlanetStructure,
} from "../types/campaign";
import { DISTRICT_KIND_LABELS, STRUCTURE_KIND_LABELS } from "../types/campaign";
import {
  ACTIVATION_RANGE,
  computeActivation,
  generatorApContribution,
  isApConsumer,
  isApGenerator,
  type ActivationSnapshot,
} from "./activation";
import {
  BASTION_STR_BONUS_PCT,
  OUTPOST_STR_BONUS_PCT,
  TRENCH_STR_BONUS_PCT,
} from "./fortificationBonus";
import {
  MANUFACTORUM_BP_INCOME,
  ORE_MINE_BP_BONUS,
  collectOwnedManufactorums,
  incomeForFaction,
  manufactorumIncomeBreakdown,
  oreMineLinkedToManufactorum,
  getBuildingPoints,
} from "./buildingPoints";
import { tilesAreHexAdjacent } from "./supplyNetwork";
import { buildHexSphere, hexTileDistance } from "./hexSphere";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";

let sphereCache: ReturnType<typeof buildHexSphere> | null = null;
function sphere() {
  return (sphereCache ??= buildHexSphere(SETTLEMENT_HEX_FREQUENCY));
}

function inActivationRange(a: number, b: number): boolean {
  return hexTileDistance(sphere(), a, b) <= ACTIVATION_RANGE;
}

/** Short brass-line status for a district in the inspector. */
export function districtBuffDetail(
  planet: Planet,
  cityId: string | null,
  district: District,
  snapshot?: ActivationSnapshot,
): string {
  const kind = DISTRICT_KIND_LABELS[district.kind];
  const snap = snapshot ?? computeActivation(planet);

  if (isApGenerator(district.kind)) {
    if (!cityId) return `${kind} · no AP (independent)`;
    const city = (planet.cities ?? []).find((c) => c.id === cityId);
    if (city && !inActivationRange(district.tileIndex, city.tileIndex)) {
      return `${kind} · out of city range`;
    }
    const ap = generatorApContribution(planet, cityId, district);
    if (district.kind === "spire") {
      return ap > 0
        ? `${kind} · +${ap} AP`
        : `${kind} · 0 AP (adjacent spire)`;
    }
    if (district.kind === "underhive") {
      return ap > 0
        ? `${kind} · +${ap} AP (linked spire)`
        : `${kind} · needs adjacent spire`;
    }
    return ap > 0 ? `${kind} · +${ap} AP` : `${kind} · +0 AP`;
  }

  if (isApConsumer(district.kind)) {
    if (!cityId) return `${kind} · inactive (independent)`;
    const on = snap.activated.has(district.id);
    if (!on) return `${kind} · inactive · needs AP`;

    if (district.kind === "manufactorum") {
      const ore = countOreFeedingManufactorum(planet, district);
      return ore > 0
        ? `${kind} · +${MANUFACTORUM_BP_INCOME} BP/turn · +${ore * ORE_MINE_BP_BONUS} ore`
        : `${kind} · +${MANUFACTORUM_BP_INCOME} BP/turn`;
    }
    if (district.kind === "bastion") {
      return `${kind} · +${BASTION_STR_BONUS_PCT}% STR on hex`;
    }
    if (district.kind === "camp") {
      return `${kind} · recruit detachments`;
    }
    if (district.kind === "docks") {
      return `${kind} · recruit ships`;
    }
    if (district.kind === "supply_station") {
      return `${kind} · AP share / logistics`;
    }
    if (district.kind === "cathedral") {
      return `${kind} · rites active`;
    }
    if (district.kind === "reliquary") {
      return `${kind} · relic ward active`;
    }
    return `${kind} · active`;
  }

  if (district.kind === "ruins") return `${kind} · no bonus`;
  return kind;
}

export function structureBuffDetail(
  planet: Planet,
  structure: PlanetStructure,
): string {
  const kind = STRUCTURE_KIND_LABELS[structure.kind];
  if (structure.kind === "ore_mine") {
    const manus = (planet.cities ?? []).flatMap((c) =>
      c.districts.filter((d) => d.kind === "manufactorum"),
    );
    const linked = manus.some((m) =>
      oreMineLinkedToManufactorum(planet, structure, m),
    );
    return linked
      ? `${kind} · feeds manufactorum · +${ORE_MINE_BP_BONUS} BP`
      : `${kind} · unlinked`;
  }
  if (structure.kind === "trench_line") {
    return `${kind} · +${TRENCH_STR_BONUS_PCT}% STR on hex (stack adj. to +3%)`;
  }
  if (structure.kind === "outpost") {
    return `${kind} · +${OUTPOST_STR_BONUS_PCT}% STR on/adjacent`;
  }
  if (structure.kind === "space_port") {
    return `${kind} · recruit ships`;
  }
  if (structure.kind === "supply_network") {
    return `${kind} · logistics link`;
  }
  return kind;
}

function countOreFeedingManufactorum(
  planet: Planet,
  manufactorum: District,
): number {
  let n = 0;
  for (const st of planet.structures ?? []) {
    if (st.kind !== "ore_mine") continue;
    if (oreMineLinkedToManufactorum(planet, st, manufactorum)) n += 1;
  }
  return n;
}

export type PlanetInteractionKind =
  | "ap_feed"
  | "spire_underhive"
  | "ore_feed";

export type PlanetInteractionLink = {
  fromTile: number;
  toTile: number;
  kind: PlanetInteractionKind;
  color: string;
};

/**
 * Surface arcs for districts/structures that mechanically enable each other.
 * Example: Domed Habitat → activated Manufactorum (AP feed).
 */
export function collectPlanetInteractionLinks(
  planet: Planet,
): PlanetInteractionLink[] {
  const snap = computeActivation(planet);
  const links: PlanetInteractionLink[] = [];
  const seen = new Set<string>();

  const push = (
    a: number,
    b: number,
    kind: PlanetInteractionKind,
    color: string,
  ) => {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${kind}:${lo}:${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ fromTile: a, toTile: b, kind, color });
  };

  for (const city of planet.cities ?? []) {
    const generators: District[] = [];
    const consumers: District[] = [];
    for (const d of city.districts) {
      if (!inActivationRange(d.tileIndex, city.tileIndex)) continue;
      if (isApGenerator(d.kind)) {
        if (generatorApContribution(planet, city.id, d) > 0) {
          generators.push(d);
        }
      } else if (isApConsumer(d.kind) && snap.activated.has(d.id)) {
        consumers.push(d);
      }
    }

    for (const g of generators) {
      for (const c of consumers) {
        // Skip soft flavor consumers so the surface stays readable.
        if (c.kind === "cathedral" || c.kind === "reliquary") continue;
        push(g.tileIndex, c.tileIndex, "ap_feed", "#e8a84a");
      }
    }

    for (const d of city.districts) {
      if (d.kind !== "underhive") continue;
      if (generatorApContribution(planet, city.id, d) <= 0) continue;
      for (const other of city.districts) {
        if (other.kind !== "spire") continue;
        if (tilesAreHexAdjacent(d.tileIndex, other.tileIndex)) {
          push(d.tileIndex, other.tileIndex, "spire_underhive", "#4fd2ff");
        }
      }
    }
  }

  const manus = (planet.cities ?? []).flatMap((c) =>
    c.districts.filter(
      (d) => d.kind === "manufactorum" && snap.activated.has(d.id),
    ),
  );
  for (const st of planet.structures ?? []) {
    if (st.kind !== "ore_mine") continue;
    for (const m of manus) {
      if (oreMineLinkedToManufactorum(planet, st, m)) {
        push(st.tileIndex, m.tileIndex, "ore_feed", "#d4783a");
      }
    }
  }

  return links;
}

/** What this world currently provides the given faction (play HUD). */
export type PlanetFactionContribution = {
  factionId: string;
  /** AP generated by cities this faction owns. */
  apGenerated: number;
  /** Consumer slots used vs shared pool (owned cities). */
  apUsed: number;
  apPool: number;
  bpBank: number;
  bpIncome: number;
  manufactorums: number;
  oreBoost: number;
  camps: number;
  docks: number;
  bastions: number;
  generators: number;
};

export function planetFactionContribution(
  planet: Planet,
  factionId: string,
): PlanetFactionContribution {
  const snap = computeActivation(planet);
  const ownedCities = (planet.cities ?? []).filter(
    (c) => c.controllingFactionId === factionId,
  );

  let apGenerated = 0;
  let apUsed = 0;
  let apPool = 0;
  const poolSeen = new Set<string>();
  for (const city of ownedCities) {
    apGenerated += snap.cityAp.get(city.id) ?? 0;
    const pool = snap.groupAp.get(city.id) ?? 0;
    const used = snap.groupUsed.get(city.id) ?? 0;
    // Shared supply groups: count each pool once.
    const key = [...(planet.cities ?? [])]
      .filter((c) => (snap.groupAp.get(c.id) ?? -1) === pool)
      .map((c) => c.id)
      .sort()
      .join("|");
    if (!poolSeen.has(key)) {
      poolSeen.add(key);
      apPool += pool;
      apUsed += used;
    }
  }

  const income = manufactorumIncomeBreakdown(planet, factionId);
  let camps = 0;
  let docks = 0;
  let bastions = 0;
  let generators = 0;
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.controllingFactionId !== factionId) continue;
      if (isApGenerator(d.kind) && generatorApContribution(planet, city.id, d) > 0) {
        generators += 1;
      }
      if (!snap.activated.has(d.id)) continue;
      if (d.kind === "camp") camps += 1;
      if (d.kind === "docks") docks += 1;
      if (d.kind === "bastion") bastions += 1;
    }
  }
  if ((planet.structures ?? []).some(
    (s) => s.kind === "space_port" && s.controllingFactionId === factionId,
  )) {
    docks += 1;
  }

  return {
    factionId,
    apGenerated,
    apUsed,
    apPool,
    bpBank: getBuildingPoints(planet, factionId),
    bpIncome: incomeForFaction(planet, factionId),
    manufactorums: collectOwnedManufactorums(planet, factionId).length,
    oreBoost: income.oreMinesLinked,
    camps,
    docks,
    bastions,
    generators,
  };
}

/** @internal helper export for tests / call sites that already have a city. */
export function cityHasApGenerators(city: City, planet: Planet): boolean {
  return city.districts.some(
    (d) =>
      isApGenerator(d.kind) &&
      generatorApContribution(planet, city.id, d) > 0,
  );
}
