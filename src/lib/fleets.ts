import type {
  Campaign,
  Fleet,
  FleetLocation,
  Ship,
  ShipRole,
  StarSystem,
} from "../types/campaign";
import { SHIP_ROLE_LABELS, SHIP_ROLE_ORDER } from "../types/campaign";
import { buildHyperlanes, getCampaignHyperlanes } from "./hyperlanes";
import {
  normalizeShipRole,
  shipRole,
  shipsSortedByRole,
} from "./fleetPower";

export { shipsSortedByRole, roleSortIndex } from "./fleetPower";

/** Max BP a single transport hull can carry in its hold. */
export const TRANSPORT_BP_CAPACITY = 1000;

/** Max detachments embarked on one escort. */
export const ESCORT_ARMY_CAPACITY = 1;

/** Map legacy hull ids onto the current role set. */
export function normalizeShipChassis(chassis: string): ShipRole {
  return normalizeShipRole(chassis);
}

export function fleetSystemId(fleet: Fleet): string {
  return fleet.location.systemId;
}

export function fleetsInSystem(fleets: Fleet[], systemId: string): Fleet[] {
  return fleets.filter((f) => fleetSystemId(f) === systemId);
}

export function fleetsAtSystemStar(fleets: Fleet[], systemId: string): Fleet[] {
  return fleets.filter(
    (f) => f.location.kind === "system" && f.location.systemId === systemId,
  );
}

export function fleetsInOrbit(
  fleets: Fleet[],
  systemId: string,
  planetId: string,
): Fleet[] {
  return fleets.filter(
    (f) =>
      f.location.kind === "orbit" &&
      f.location.systemId === systemId &&
      f.location.planetId === planetId,
  );
}

/** Group fleets by system for galaxy map badges. */
export function fleetsBySystemId(fleets: Fleet[]): Map<string, Fleet[]> {
  const map = new Map<string, Fleet[]>();
  for (const fleet of fleets) {
    const sid = fleetSystemId(fleet);
    const list = map.get(sid);
    if (list) list.push(fleet);
    else map.set(sid, [fleet]);
  }
  return map;
}

export function shipCount(fleet: Fleet): number {
  return fleet.ships.length;
}

export function chassisSummary(fleet: Fleet): string {
  const counts = new Map<ShipRole, number>();
  for (const ship of fleet.ships) {
    const role = shipRole(ship);
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return SHIP_ROLE_ORDER.filter((role) => (counts.get(role) ?? 0) > 0)
    .map((role) => `${counts.get(role)}× ${SHIP_ROLE_LABELS[role]}`)
    .join(", ");
}

export function defaultShipName(role: ShipRole, index: number): string {
  return `${SHIP_ROLE_LABELS[role]} ${index}`;
}

export function createShip(role: ShipRole, index: number): Ship {
  return {
    id: crypto.randomUUID(),
    name: defaultShipName(role, index),
    role,
    notes: "",
    ...(role === "transport" ? { cargoBp: 0 } : {}),
    ...(role === "escort" ? { embarkedArmyIds: [] } : {}),
  };
}

/** Normalize a raw ship from saves (chassis → role, cargo, embark). */
export function normalizeShip(raw: Ship | Record<string, unknown>): Ship {
  const r = raw as Ship & { chassis?: string };
  const role = normalizeShipRole(
    typeof r.role === "string"
      ? r.role
      : typeof r.chassis === "string"
        ? r.chassis
        : "line",
  );
  const base: Ship = {
    id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
    name: typeof r.name === "string" && r.name.trim() ? r.name : defaultShipName(role, 1),
    role,
    notes: typeof r.notes === "string" ? r.notes : "",
  };
  const withEmbark =
    role === "escort"
      ? {
          ...base,
          embarkedArmyIds: Array.isArray(r.embarkedArmyIds)
            ? r.embarkedArmyIds.filter(
                (id): id is string => typeof id === "string",
              )
            : [],
          embarkedArmies: Array.isArray(r.embarkedArmies)
            ? (r.embarkedArmies as Ship["embarkedArmies"])
            : [],
        }
      : base;
  return normalizeShipCargo(withEmbark);
}

/** Clamp / strip cargo when role changes. */
export function normalizeShipCargo(ship: Ship): Ship {
  const role = shipRole(ship);
  let next: Ship = { ...ship, role };
  if (role !== "transport") {
    if (next.cargoBp != null) {
      const { cargoBp: _drop, ...rest } = next;
      next = rest;
    }
  } else {
    const n =
      typeof next.cargoBp === "number" && Number.isFinite(next.cargoBp)
        ? Math.max(0, Math.min(TRANSPORT_BP_CAPACITY, Math.floor(next.cargoBp)))
        : 0;
    next = { ...next, cargoBp: n };
  }
  if (role !== "escort") {
    if (next.embarkedArmyIds != null) {
      const { embarkedArmyIds: _e, ...rest } = next;
      next = rest;
    }
  } else {
    const ids = Array.isArray(next.embarkedArmyIds)
      ? next.embarkedArmyIds.filter((id): id is string => typeof id === "string")
      : [];
    next = {
      ...next,
      embarkedArmyIds: ids.slice(0, ESCORT_ARMY_CAPACITY),
    };
  }
  return next;
}

export function normalizeFleetShips(fleet: Fleet): Fleet {
  return {
    ...fleet,
    ships: shipsSortedByRole(fleet.ships.map((s) => normalizeShip(s))),
  };
}

/** Adjacent system ids via hyperlanes. */
export function adjacentSystemIds(
  systems: StarSystem[],
  systemId: string,
  lanes?: ReturnType<typeof buildHyperlanes>,
): Set<string> {
  const graph = lanes ?? buildHyperlanes(systems);
  const next = new Set<string>();
  for (const lane of graph) {
    if (lane.a === systemId) next.add(lane.b);
    else if (lane.b === systemId) next.add(lane.a);
  }
  return next;
}

export function canMoveFleetInterSystem(
  systems: StarSystem[],
  fromSystemId: string,
  toSystemId: string,
  lanes?: ReturnType<typeof buildHyperlanes>,
): boolean {
  if (fromSystemId === toSystemId) return false;
  return adjacentSystemIds(systems, fromSystemId, lanes).has(toSystemId);
}

export function canMoveFleetIntraSystem(
  from: FleetLocation,
  to: FleetLocation,
): boolean {
  if (from.systemId !== to.systemId) return false;
  if (from.kind === "system" && to.kind === "system") return false;
  if (from.kind === "orbit" && to.kind === "orbit") {
    return from.planetId !== to.planetId;
  }
  return true;
}

export function isValidFleetMove(
  campaign: Campaign,
  fleet: Fleet,
  destination: FleetLocation,
): boolean {
  const fromId = fleetSystemId(fleet);
  if (destination.kind === "orbit") {
    const planet = campaign.planets.find((p) => p.id === destination.planetId);
    if (!planet || planet.systemId !== destination.systemId) return false;
  }
  if (!campaign.systems.some((s) => s.id === destination.systemId)) return false;

  if (destination.systemId === fromId) {
    return canMoveFleetIntraSystem(fleet.location, destination);
  }
  return canMoveFleetInterSystem(
    campaign.systems,
    fromId,
    destination.systemId,
    getCampaignHyperlanes(campaign),
  );
}

export function locationLabel(
  campaign: Campaign,
  location: FleetLocation,
): string {
  const system = campaign.systems.find((s) => s.id === location.systemId);
  const systemName = system?.name ?? "Unknown system";
  if (location.kind === "system") return `${systemName} (star)`;
  const planet = campaign.planets.find((p) => p.id === location.planetId);
  return `${planet?.name ?? "Orbit"} · ${systemName}`;
}

/** Same body: both at star, or both in the same planet orbit. */
export function fleetsShareOrbit(a: Fleet, b: Fleet): boolean {
  if (a.location.systemId !== b.location.systemId) return false;
  if (a.location.kind === "system" && b.location.kind === "system") return true;
  if (a.location.kind === "orbit" && b.location.kind === "orbit") {
    return a.location.planetId === b.location.planetId;
  }
  return false;
}
