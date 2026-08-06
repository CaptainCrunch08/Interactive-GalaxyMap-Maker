import type {
  Campaign,
  Fleet,
  Planet,
  PlanetStructure,
  SphereDir,
  StarSystem,
} from "../types/campaign";
import {
  nearestStationTile,
  stationDirFromTile,
  STATION_HEX_RADIUS,
} from "./stationHex";
import { buildStationMaze } from "./stationMaze";
import {
  buildHyperlanes,
  getCampaignHyperlanes,
  systemHopDistance,
  type Hyperlane,
} from "./hyperlanes";

export const RELAY_CROWN_KIND = "relay_crown" as const;

/** Minimum hyperlane hops between any two warp-gate systems. */
export const MIN_WARP_GATE_SYSTEM_HOPS = 8;

/** Faction that owns the relay crown (sole controller of a warp gate). */
export function warpGateController(planet: Planet): string | undefined {
  if (planet.type !== "warp_gate") return planet.controllingFactionId;
  const crown = (planet.structures ?? []).find(
    (s) => s.kind === RELAY_CROWN_KIND,
  );
  return crown?.controllingFactionId;
}

/** Sync planet.controllingFactionId from the relay crown only (never contested). */
export function applyWarpGateOwnership(planet: Planet): Planet {
  if (planet.type !== "warp_gate") return planet;
  const owner = warpGateController(planet);
  return {
    ...planet,
    controllingFactionId: owner,
  };
}

export function findRelayCrown(
  planet: Planet,
): PlanetStructure | undefined {
  return (planet.structures ?? []).find((s) => s.kind === RELAY_CROWN_KIND);
}

export function linkedWarpGate(
  campaign: Campaign,
  gate: Planet,
): Planet | undefined {
  if (gate.type !== "warp_gate" || !gate.linkedGateId) return undefined;
  return campaign.planets.find(
    (p) => p.id === gate.linkedGateId && p.type === "warp_gate",
  );
}

/** Warp gate planets in a system (usually 0–1). */
export function warpGatesInSystem(
  campaign: Campaign,
  systemId: string,
): Planet[] {
  return campaign.planets.filter(
    (p) => p.systemId === systemId && p.type === "warp_gate",
  );
}

/** System ids that already host a warp gate (unique). */
export function warpGateSystemIds(
  planets: Planet[],
  excludePlanetId?: string,
): string[] {
  const ids = new Set<string>();
  for (const p of planets) {
    if (p.type !== "warp_gate") continue;
    if (excludePlanetId && p.id === excludePlanetId) continue;
    ids.add(p.systemId);
  }
  return [...ids];
}

/**
 * True if `systemId` is within {@link MIN_WARP_GATE_SYSTEM_HOPS} of any
 * existing warp-gate system (paired or not).
 */
export function isWarpGateSystemTooClose(
  systems: StarSystem[],
  planets: Planet[],
  systemId: string,
  opts?: {
    lanes?: Hyperlane[];
    /** Ignore this gate planet (e.g. when re-classifying the same body). */
    excludePlanetId?: string;
    /** Extra system ids to treat as occupied (generation in progress). */
    extraGateSystemIds?: Iterable<string>;
  },
): boolean {
  const lanes = opts?.lanes ?? buildHyperlanes(systems);
  const occupied = new Set(warpGateSystemIds(planets, opts?.excludePlanetId));
  if (opts?.extraGateSystemIds) {
    for (const id of opts.extraGateSystemIds) occupied.add(id);
  }
  // Same system already hosting a different gate counts as distance 0.
  if (occupied.has(systemId)) return true;
  for (const other of occupied) {
    const hops = systemHopDistance(systems, systemId, other, lanes);
    if (hops < MIN_WARP_GATE_SYSTEM_HOPS) return true;
  }
  return false;
}

/** Human-readable block reason, or null when placement is allowed. */
export function warpGatePlacementBlockedReason(
  campaign: Campaign,
  systemId: string,
  excludePlanetId?: string,
): string | null {
  if (
    isWarpGateSystemTooClose(campaign.systems, campaign.planets, systemId, {
      lanes: getCampaignHyperlanes(campaign),
      excludePlanetId,
    })
  ) {
    return `Warp gates must be at least ${MIN_WARP_GATE_SYSTEM_HOPS} systems apart along hyperlanes`;
  }
  return null;
}

export function fleetAtWarpGate(
  campaign: Campaign,
  fleet: Fleet,
): Planet | undefined {
  if (fleet.location.kind !== "orbit") return undefined;
  const planet = campaign.planets.find((p) => p.id === fleet.location.planetId);
  if (!planet || planet.type !== "warp_gate") return undefined;
  return planet;
}

/** Whether this fleet may transit the gate (unclaimed = open to all). */
export function canFleetUseWarpGate(fleet: Fleet, gate: Planet): boolean {
  if (gate.type !== "warp_gate") return false;
  const owner = warpGateController(gate);
  if (!owner) return true;
  return fleet.factionId === owner;
}

export function warpTravelBlockedReason(
  fleet: Fleet,
  gate: Planet,
): string | null {
  if (gate.type !== "warp_gate") return "Not a warp gate";
  const owner = warpGateController(gate);
  if (owner && owner !== fleet.factionId) {
    return "Enemy controls the relay crown — board the station and seize it";
  }
  return null;
}

/** Destination system for a transit (linked gate, or null → caller picks random). */
export function warpDestinationSystemId(
  campaign: Campaign,
  gate: Planet,
): string | null {
  const linked = linkedWarpGate(campaign, gate);
  return linked?.systemId ?? null;
}

/**
 * Bidirectionally pair two warp gates. Clears any previous partners.
 * Returns updated planets array, or null if the link is invalid.
 */
export function linkWarpGates(
  planets: Planet[],
  gateAId: string,
  gateBId: string,
): Planet[] | null {
  if (gateAId === gateBId) return null;
  const a = planets.find((p) => p.id === gateAId);
  const b = planets.find((p) => p.id === gateBId);
  if (!a || !b || a.type !== "warp_gate" || b.type !== "warp_gate") return null;

  const clearIds = new Set<string>([gateAId, gateBId]);
  if (a.linkedGateId) clearIds.add(a.linkedGateId);
  if (b.linkedGateId) clearIds.add(b.linkedGateId);

  return planets.map((p) => {
    if (p.id === gateAId) return { ...p, linkedGateId: gateBId };
    if (p.id === gateBId) return { ...p, linkedGateId: gateAId };
    if (clearIds.has(p.id) && p.linkedGateId) {
      const { linkedGateId: _drop, ...rest } = p;
      return rest;
    }
    // Also clear anyone who pointed at A or B
    if (p.linkedGateId === gateAId || p.linkedGateId === gateBId) {
      const { linkedGateId: _drop, ...rest } = p;
      return rest;
    }
    return p;
  });
}

/** Break a gate's link (and its partner's). */
export function unlinkWarpGate(planets: Planet[], gateId: string): Planet[] {
  const gate = planets.find((p) => p.id === gateId);
  const partnerId = gate?.linkedGateId;
  return planets.map((p) => {
    if (p.id === gateId || (partnerId && p.id === partnerId)) {
      if (!p.linkedGateId) return p;
      const { linkedGateId: _drop, ...rest } = p;
      return rest;
    }
    return p;
  });
}

/** Other warp gates available as link targets (excluding self). */
export function warpGateLinkCandidates(
  campaign: Campaign,
  gateId: string,
): Planet[] {
  return campaign.planets.filter(
    (p) => p.type === "warp_gate" && p.id !== gateId,
  );
}

export function randomOtherSystemId(
  campaign: Campaign,
  excludeSystemId: string,
): string | null {
  const ids = campaign.systems
    .map((s) => s.id)
    .filter((id) => id !== excludeSystemId);
  if (ids.length === 0) return null;
  return ids[Math.floor(Math.random() * ids.length)]!;
}

/** All warp-lane endpoints as system id pairs (for galaxy drawing). */
export function warpLaneSystemPairs(
  campaign: Campaign,
): { a: string; b: string; gateA: string; gateB: string }[] {
  const seen = new Set<string>();
  const pairs: { a: string; b: string; gateA: string; gateB: string }[] = [];
  for (const gate of campaign.planets) {
    if (gate.type !== "warp_gate" || !gate.linkedGateId) continue;
    const other = linkedWarpGate(campaign, gate);
    if (!other) continue;
    const key = [gate.id, other.id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      a: gate.systemId,
      b: other.systemId,
      gateA: gate.id,
      gateB: other.id,
    });
  }
  return pairs;
}

export function armyStationTile(armyDir: SphereDir, planetId?: string): number {
  const walkable = planetId ? buildStationMaze(planetId).walkable : null;
  return nearestStationTile(armyDir, STATION_HEX_RADIUS, walkable);
}

export function placeArmyOnStationTile(tileIndex: number): SphereDir {
  return stationDirFromTile(tileIndex, STATION_HEX_RADIUS);
}

export function stationCenterTile(planetId?: string): number {
  if (planetId) return buildStationMaze(planetId).crownTile;
  return 0;
}

/** Boarding locks at the bottom of the station maze. */
export function stationDockTiles(planetId?: string): number[] {
  if (planetId) return buildStationMaze(planetId).dockTiles;
  return buildStationMaze("default-docks").dockTiles;
}
