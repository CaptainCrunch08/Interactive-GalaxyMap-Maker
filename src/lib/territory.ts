import type {
  Campaign,
  Faction,
  Planet,
  StarSystem,
} from "../types/campaign";
import { planetOwnerFromCities } from "./settlements";
import { warpGateController } from "./warpGates";

export type SystemOwnership =
  | { status: "unowned"; factions: [] }
  | { status: "owned"; factions: [Faction] }
  /** Contested: two or more clearly owned planets disagree on the controller. */
  | { status: "contested"; factions: [Faction, ...Faction[]] };

export type PlanetOwnership =
  | { status: "unowned"; factions: [] }
  | { status: "owned"; factions: [Faction] }
  /** Contested: city-hub tie (or mixed gate claim with no sole controller). */
  | { status: "contested"; factions: [Faction, ...Faction[]] };

/**
 * Live planet control: city-hub majority (tie / none → undefined).
 * Warp gates follow the relay crown only.
 */
export function resolvePlanetControllingFactionId(
  planet: Planet,
): string | undefined {
  if (planet.type === "warp_gate") return warpGateController(planet);
  return planetOwnerFromCities(
    planet.cities ?? [],
    planet.tileClaims,
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
}

/** Keep `planet.controllingFactionId` aligned with live city / gate rules. */
export function withLivePlanetOwner(planet: Planet): Planet {
  const controllingFactionId = resolvePlanetControllingFactionId(planet);
  if (controllingFactionId === planet.controllingFactionId) return planet;
  return { ...planet, controllingFactionId };
}

/**
 * Planet control from live city majority (or warp-gate crown).
 * Tie among city hubs → contested; no city owners → unowned.
 */
export function getPlanetOwnership(
  campaign: Campaign,
  planet: Planet,
): PlanetOwnership {
  const ownerId = resolvePlanetControllingFactionId(planet);
  if (ownerId) {
    const f = campaign.factions.find((x) => x.id === ownerId);
    return f
      ? { status: "owned", factions: [f] }
      : { status: "unowned", factions: [] };
  }

  const ids = new Set<string>();
  if (planet.type === "warp_gate") {
    for (const st of planet.structures ?? []) {
      if (st.controllingFactionId) ids.add(st.controllingFactionId);
    }
  } else {
    for (const city of planet.cities ?? []) {
      if (city.controllingFactionId) ids.add(city.controllingFactionId);
    }
  }
  const factions = campaign.factions.filter((f) => ids.has(f.id));
  if (factions.length >= 2) {
    return {
      status: "contested",
      factions: factions as [Faction, ...Faction[]],
    };
  }
  return { status: "unowned", factions: [] };
}

export function planetOwnershipLabel(ownership: PlanetOwnership): string {
  if (ownership.status === "unowned") return "Unclaimed";
  if (ownership.status === "owned") return ownership.factions[0].name;
  if (ownership.factions.length === 1) {
    return `${ownership.factions[0]!.name} (contested)`;
  }
  return ownership.factions.map((f) => f.name).join(" / ");
}

/**
 * Factions with a surface stake on this world (settlements, structures, open
 * hex claims). Armies and fleets do not count — presence alone is not ownership.
 */
export function factionsPresentOnPlanet(planet: Planet): Set<string> {
  const ids = new Set<string>();
  for (const city of planet.cities ?? []) {
    if (city.controllingFactionId) ids.add(city.controllingFactionId);
    for (const d of city.districts) {
      if (d.controllingFactionId) ids.add(d.controllingFactionId);
    }
  }
  for (const d of planet.independentDistricts ?? []) {
    if (d.controllingFactionId) ids.add(d.controllingFactionId);
  }
  for (const st of planet.structures ?? []) {
    if (st.controllingFactionId) ids.add(st.controllingFactionId);
  }
  for (const owner of Object.values(planet.tileClaims ?? {})) {
    if (owner) ids.add(owner);
  }
  return ids;
}

/**
 * Distinct live owners among planets that actually count for system control
 * (contested / unclaimed worlds are ignored). Fleets never contribute.
 */
export function getFactionsControllingSystem(
  campaign: Campaign,
  systemId: string,
): Faction[] {
  const ids = new Set(ownedPlanetFactionIds(campaign.planets, systemId));
  return campaign.factions.filter((f) => ids.has(f.id));
}

/**
 * Clear planet controllers in a system. Contested and unclaimed worlds do not
 * contribute — only a city-majority (or warp-gate crown) owner counts.
 */
function ownedPlanetFactionIds(
  planets: Planet[],
  systemId: string,
): string[] {
  const ids: string[] = [];
  for (const p of planets) {
    if (p.systemId !== systemId) continue;
    // Belts never hold cities / system claim weight.
    if (p.type === "asteroid_belt") continue;
    const owner = resolvePlanetControllingFactionId(p);
    if (owner) ids.push(owner);
  }
  return ids;
}

/**
 * System control (from clearly owned planets only):
 * - owned → every counting planet shares one controller
 * - contested → two or more counting planets disagree
 * - unowned → no counting planets (all contested / unclaimed / empty)
 *
 * Contested planets have no impact on system control.
 */
export function getSystemOwnership(
  campaign: Campaign,
  systemId: string,
): SystemOwnership {
  const planets = campaign.planets.filter((p) => p.systemId === systemId);
  if (planets.length === 0) return { status: "unowned", factions: [] };

  const unique = [...new Set(ownedPlanetFactionIds(planets, systemId))];
  const factions = campaign.factions.filter((f) => unique.includes(f.id));

  if (unique.length === 1) {
    const f = factions[0];
    return f
      ? { status: "owned", factions: [f] }
      : { status: "unowned", factions: [] };
  }
  if (unique.length === 0 || factions.length === 0) {
    return { status: "unowned", factions: [] };
  }
  return {
    status: "contested",
    factions: factions as [Faction, ...Faction[]],
  };
}

export function ownershipLabel(ownership: SystemOwnership): string {
  if (ownership.status === "unowned") return "Unclaimed";
  if (ownership.status === "owned") return ownership.factions[0].name;
  if (ownership.factions.length === 1) {
    return `${ownership.factions[0]!.name} (contested)`;
  }
  return ownership.factions.map((f) => f.name).join(" / ");
}

export function getFactionById(
  campaign: Pick<Campaign, "factions">,
  factionId: string | undefined,
): Faction | undefined {
  if (!factionId) return undefined;
  return campaign.factions.find((f) => f.id === factionId);
}

/** Stable A→Z list for faction pickers and panels. */
export function factionsSortedByName(factions: Faction[]): Faction[] {
  return [...factions].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Sole system owner when every clearly owned planet agrees.
 * Contested / unclaimed worlds are ignored; split owners → undefined.
 */
export function deriveSystemOwnerId(
  planets: Planet[],
  systemId: string,
): string | undefined {
  const ids = new Set(ownedPlanetFactionIds(planets, systemId));
  if (ids.size === 1) return [...ids][0];
  return undefined;
}

/** Rewrite system.controllingFactionId from current planet owners. */
export function syncSystemOwnerInSystems(
  systems: StarSystem[],
  planets: Planet[],
  systemId: string,
): StarSystem[] {
  const owner = deriveSystemOwnerId(planets, systemId);
  return systems.map((sys) =>
    sys.id === systemId
      ? { ...sys, controllingFactionId: owner }
      : sys,
  );
}

/** Recompute every system's cached owner from live planet control. */
export function syncAllSystemOwners(
  systems: StarSystem[],
  planets: Planet[],
): StarSystem[] {
  return systems.map((sys) => ({
    ...sys,
    controllingFactionId: deriveSystemOwnerId(planets, sys.id),
  }));
}

export function systemOwnerSelectValue(
  system: StarSystem,
  ownership: SystemOwnership,
): string {
  if (ownership.status === "owned") return ownership.factions[0].id;
  if (ownership.status === "contested") return "__contested__";
  return system.controllingFactionId ?? "";
}

/**
 * Desired open-space contour reach (world units) before kernel conversion.
 * Tuned to ~half of Save_5 nearest-neighbor spacing (~791 avg / ~795 median).
 * FactionTerritoryLayer converts this to a metaball kernel radius so the
 * visible contour (influence ≈ threshold) lands near this distance.
 */
export const CLAIM_RADIUS = 400;

/**
 * Cheap signature of data that affects territory fills. Typing notes / names
 * (without moving stars or changing ownership) should not rebuild metaballs.
 */
export function territoryLayoutSignature(campaign: Campaign): string {
  let sig = `${campaign.systems.length}|${campaign.factions.length}|`;
  for (const s of campaign.systems) {
    sig += `${s.id}:${s.x | 0},${s.y | 0};`;
  }
  for (const f of campaign.factions) {
    sig += `${f.id}:${f.color};`;
  }
  for (const p of campaign.planets) {
    if (p.type === "asteroid_belt") continue;
    const owner = resolvePlanetControllingFactionId(p) ?? "";
    sig += `${p.id}:${owner};`;
  }
  const lanes = campaign.hyperlanes;
  if (lanes) {
    for (const lane of lanes) {
      sig += `${lane.a}-${lane.b};`;
    }
  }
  const edits = campaign.hyperlaneEdits;
  if (edits) {
    for (const lane of edits.added) {
      sig += `+${lane.a}-${lane.b};`;
    }
    for (const removed of edits.removed) {
      sig += `-${removed};`;
    }
  }
  return sig;
}
