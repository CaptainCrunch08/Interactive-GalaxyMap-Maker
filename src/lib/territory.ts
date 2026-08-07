import type {
  Campaign,
  Faction,
  Planet,
  StarSystem,
} from "../types/campaign";

export type SystemOwnership =
  | { status: "unowned"; factions: [] }
  | { status: "owned"; factions: [Faction] }
  | { status: "contested"; factions: [Faction, Faction, ...Faction[]] };

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
 * System ownership comes only from planet.controllingFactionId.
 * Fleets in the system never contribute; nor does a stale system-level field.
 */
export function getFactionsControllingSystem(
  campaign: Campaign,
  systemId: string,
): Faction[] {
  const ids = new Set<string>();
  for (const p of campaign.planets) {
    if (p.systemId !== systemId || !p.controllingFactionId) continue;
    ids.add(p.controllingFactionId);
  }
  return campaign.factions.filter((f) => ids.has(f.id));
}

export function getSystemOwnership(
  campaign: Campaign,
  systemId: string,
): SystemOwnership {
  const factions = getFactionsControllingSystem(campaign, systemId);
  if (factions.length === 0) return { status: "unowned", factions: [] };
  if (factions.length === 1) {
    return { status: "owned", factions: [factions[0]!] };
  }
  return {
    status: "contested",
    factions: factions as [Faction, Faction, ...Faction[]],
  };
}

export function ownershipLabel(ownership: SystemOwnership): string {
  if (ownership.status === "unowned") return "Unclaimed";
  if (ownership.status === "owned") return ownership.factions[0].name;
  return ownership.factions.map((f) => f.name).join(" / ");
}

export function getFactionById(
  campaign: Campaign,
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
 * Sole planet-level owner for a system, or undefined if empty / contested.
 * Does not fall back to a stale system.controllingFactionId — for writes.
 */
export function deriveSystemOwnerId(
  planets: Planet[],
  systemId: string,
): string | undefined {
  const ids = new Set<string>();
  for (const p of planets) {
    if (p.systemId !== systemId || !p.controllingFactionId) continue;
    ids.add(p.controllingFactionId);
  }
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

export function systemOwnerSelectValue(
  system: StarSystem,
  ownership: SystemOwnership,
): string {
  if (ownership.status === "owned") return ownership.factions[0].id;
  if (ownership.status === "contested") return "__contested__";
  return system.controllingFactionId ?? "";
}

/**
 * Sphere of influence for every controlled system (world units).
 * Larger values merge same-faction blobs across wider gaps between systems.
 */
export const CLAIM_RADIUS = 480;
