import type {
  Campaign,
  Fleet,
  Planet,
  PlanetStructure,
  SphereDir,
} from "../types/campaign";
import {
  buildStationGrid,
  nearestStationTile,
  stationDirFromTile,
  STATION_HEX_RADIUS,
} from "./stationHex";

export const RELAY_CROWN_KIND = "relay_crown" as const;

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

export function armyStationTile(armyDir: SphereDir): number {
  return nearestStationTile(armyDir, STATION_HEX_RADIUS);
}

export function placeArmyOnStationTile(tileIndex: number): SphereDir {
  return stationDirFromTile(tileIndex, STATION_HEX_RADIUS);
}

export function stationCenterTile(): number {
  return 0;
}

export function stationDockTiles(): number[] {
  const grid = buildStationGrid();
  // Outer ring tiles as docks / boarding points.
  const docks: number[] = [];
  for (let i = 0; i < grid.tiles.length; i++) {
    const t = grid.tiles[i]!;
    const dist = Math.max(
      Math.abs(t.q),
      Math.abs(t.r),
      Math.abs(-t.q - t.r),
    );
    if (dist === STATION_HEX_RADIUS) docks.push(i);
  }
  return docks;
}
