import type {
  Campaign,
  Fleet,
  FleetLocation,
  Ship,
  ShipChassis,
  StarSystem,
} from "../types/campaign";
import { SHIP_CHASSIS_LABELS } from "../types/campaign";
import { buildHyperlanes, getCampaignHyperlanes } from "./hyperlanes";

const VALID_CHASSIS = new Set<string>(Object.keys(SHIP_CHASSIS_LABELS));

/** Max BP a single transport hull can carry in its hold. */
export const TRANSPORT_BP_CAPACITY = 1000;

/** Map legacy hull ids onto the current chassis set. */
export function normalizeShipChassis(chassis: string): ShipChassis {
  const legacy: Record<string, ShipChassis> = {
    corvette: "escort",
    destroyer: "light_cruiser",
    titan: "battlecruiser",
    colossus: "grand_cruiser",
    science: "escort",
    construction: "transport",
  };
  if (legacy[chassis]) return legacy[chassis]!;
  if (VALID_CHASSIS.has(chassis)) return chassis as ShipChassis;
  return "escort";
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
  const counts = new Map<ShipChassis, number>();
  for (const ship of fleet.ships) {
    counts.set(ship.chassis, (counts.get(ship.chassis) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([c, n]) => `${n}× ${SHIP_CHASSIS_LABELS[c]}`)
    .join(", ");
}

export function defaultShipName(chassis: ShipChassis, index: number): string {
  return `${SHIP_CHASSIS_LABELS[chassis]} ${index}`;
}

export function createShip(chassis: ShipChassis, index: number): Ship {
  return {
    id: crypto.randomUUID(),
    name: defaultShipName(chassis, index),
    chassis,
    notes: "",
    ...(chassis === "transport" ? { cargoBp: 0 } : {}),
  };
}

/** Clamp / strip cargo when chassis changes. */
export function normalizeShipCargo(ship: Ship): Ship {
  if (ship.chassis !== "transport") {
    if (ship.cargoBp == null) return ship;
    const { cargoBp: _drop, ...rest } = ship;
    return rest;
  }
  const n =
    typeof ship.cargoBp === "number" && Number.isFinite(ship.cargoBp)
      ? Math.max(0, Math.min(TRANSPORT_BP_CAPACITY, Math.floor(ship.cargoBp)))
      : 0;
  return { ...ship, cargoBp: n };
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
