import type { City, District, Planet, PlanetStructure } from "../types/campaign";
import {
  buildHexSphere,
  hexTileDistance,
} from "./hexSphere";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";

/**
 * Max hex hops for a supply link between any two supply nodes:
 * stations and networks. Links chain into one logistics component.
 */
export const SUPPLY_LINK_RANGE = 3;

type SupplyPlanet = Pick<Planet, "cities" | "structures">;

export type SupplyStationRef = {
  id: string;
  cityId: string;
  name: string;
  tileIndex: number;
  controllingFactionId?: string;
};

export type SupplyNetworkRef = {
  id: string;
  name: string;
  tileIndex: number;
  controllingFactionId?: string;
};

export type SupplyLinkSegment =
  | {
      kind: "station_network";
      from: SupplyStationRef;
      to: SupplyNetworkRef;
    }
  | {
      kind: "station_station";
      from: SupplyStationRef;
      to: SupplyStationRef;
    }
  | {
      kind: "network_network";
      from: SupplyNetworkRef;
      to: SupplyNetworkRef;
    };

export function collectSupplyStations(planet: SupplyPlanet): SupplyStationRef[] {
  const out: SupplyStationRef[] = [];
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind !== "supply_station") continue;
      out.push({
        id: d.id,
        cityId: city.id,
        name: d.name,
        tileIndex: d.tileIndex,
        controllingFactionId: d.controllingFactionId,
      });
    }
  }
  return out;
}

export function collectSupplyNetworks(planet: SupplyPlanet): SupplyNetworkRef[] {
  return (planet.structures ?? [])
    .filter((s) => s.kind === "supply_network")
    .map((s) => ({
      id: s.id,
      name: s.name,
      tileIndex: s.tileIndex,
      controllingFactionId: s.controllingFactionId,
    }));
}

let cachedSphere: ReturnType<typeof buildHexSphere> | null = null;
function supplySphere() {
  return (cachedSphere ??= buildHexSphere(SETTLEMENT_HEX_FREQUENCY));
}

function withinSupplyRange(a: number, b: number): boolean {
  if (a === b) return false;
  return hexTileDistance(supplySphere(), a, b) <= SUPPLY_LINK_RANGE;
}

/** Build full adjacency: station↔station, station↔network, network↔network. */
function buildSupplyAdjacency(planet: SupplyPlanet): Map<string, Set<string>> {
  const stations = collectSupplyStations(planet);
  const networks = collectSupplyNetworks(planet);
  const adj = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i]!;
      const b = stations[j]!;
      if (withinSupplyRange(a.tileIndex, b.tileIndex)) {
        touch(`s:${a.id}`, `s:${b.id}`);
      }
    }
  }

  for (const station of stations) {
    for (const network of networks) {
      if (withinSupplyRange(station.tileIndex, network.tileIndex)) {
        touch(`s:${station.id}`, `n:${network.id}`);
      }
    }
  }

  for (let i = 0; i < networks.length; i++) {
    for (let j = i + 1; j < networks.length; j++) {
      const a = networks[i]!;
      const b = networks[j]!;
      if (withinSupplyRange(a.tileIndex, b.tileIndex)) {
        touch(`n:${a.id}`, `n:${b.id}`);
      }
    }
  }

  return adj;
}

function bfsReachable(adj: Map<string, Set<string>>, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      q.push(next);
    }
  }
  return seen;
}

/** Stations directly within link range of a network. */
export function stationsLinkedToNetwork(
  planet: SupplyPlanet,
  networkId: string,
): SupplyStationRef[] {
  const network = collectSupplyNetworks(planet).find((n) => n.id === networkId);
  if (!network) return [];
  return collectSupplyStations(planet).filter((s) =>
    withinSupplyRange(s.tileIndex, network.tileIndex),
  );
}

/** Other networks directly within link range. */
export function networksLinkedToNetwork(
  planet: SupplyPlanet,
  networkId: string,
): SupplyNetworkRef[] {
  const networks = collectSupplyNetworks(planet);
  const self = networks.find((n) => n.id === networkId);
  if (!self) return [];
  return networks.filter(
    (n) =>
      n.id !== networkId &&
      withinSupplyRange(self.tileIndex, n.tileIndex),
  );
}

/** Networks directly within link range of a station. */
export function networksLinkedToStation(
  planet: SupplyPlanet,
  stationId: string,
): SupplyNetworkRef[] {
  const station = collectSupplyStations(planet).find((s) => s.id === stationId);
  if (!station) return [];
  return collectSupplyNetworks(planet).filter((n) =>
    withinSupplyRange(station.tileIndex, n.tileIndex),
  );
}

/** Other stations directly within link range (not via chain). */
export function stationsLinkedToStation(
  planet: SupplyPlanet,
  stationId: string,
): SupplyStationRef[] {
  const stations = collectSupplyStations(planet);
  const self = stations.find((s) => s.id === stationId);
  if (!self) return [];
  return stations.filter(
    (s) =>
      s.id !== stationId &&
      withinSupplyRange(self.tileIndex, s.tileIndex),
  );
}

/**
 * Other supply stations reachable through the logistics graph
 * (station ↔ station ↔ network ↔ network …).
 */
export function connectedSupplyStations(
  planet: SupplyPlanet,
  stationId: string,
): SupplyStationRef[] {
  const stations = collectSupplyStations(planet);
  if (!stations.some((s) => s.id === stationId)) return [];

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const reached = bfsReachable(buildSupplyAdjacency(planet), `s:${stationId}`);

  return [...reached]
    .filter((k) => k.startsWith("s:") && k !== `s:${stationId}`)
    .map((k) => stationById.get(k.slice(2)))
    .filter((s): s is SupplyStationRef => s != null);
}

/**
 * All supply stations in the same logistics component as this network.
 */
export function stationsInNetworkComponent(
  planet: SupplyPlanet,
  networkId: string,
): SupplyStationRef[] {
  const stations = collectSupplyStations(planet);
  const networks = collectSupplyNetworks(planet);
  if (!networks.some((n) => n.id === networkId)) return [];

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const reached = bfsReachable(buildSupplyAdjacency(planet), `n:${networkId}`);

  return [...reached]
    .filter((k) => k.startsWith("s:"))
    .map((k) => stationById.get(k.slice(2)))
    .filter((s): s is SupplyStationRef => s != null);
}

/** All direct links within range (for map visuals). */
export function supplyLinkSegments(planet: SupplyPlanet): SupplyLinkSegment[] {
  const stations = collectSupplyStations(planet);
  const networks = collectSupplyNetworks(planet);
  const out: SupplyLinkSegment[] = [];

  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i]!;
      const b = stations[j]!;
      if (withinSupplyRange(a.tileIndex, b.tileIndex)) {
        out.push({ kind: "station_station", from: a, to: b });
      }
    }
  }

  for (const station of stations) {
    for (const network of networks) {
      if (withinSupplyRange(station.tileIndex, network.tileIndex)) {
        out.push({ kind: "station_network", from: station, to: network });
      }
    }
  }

  for (let i = 0; i < networks.length; i++) {
    for (let j = i + 1; j < networks.length; j++) {
      const a = networks[i]!;
      const b = networks[j]!;
      if (withinSupplyRange(a.tileIndex, b.tileIndex)) {
        out.push({ kind: "network_network", from: a, to: b });
      }
    }
  }

  return out;
}

/** True if two stations participate in the same supply component. */
export function areInSameSupplyNetwork(
  planet: SupplyPlanet,
  stationAId: string,
  stationBId: string,
): boolean {
  if (stationAId === stationBId) return true;
  return connectedSupplyStations(planet, stationAId).some(
    (s) => s.id === stationBId,
  );
}

export function findSupplyStation(
  cities: City[] | undefined,
  districtId: string,
): District | null {
  for (const city of cities ?? []) {
    const d = city.districts.find((x) => x.id === districtId);
    if (d) return d;
  }
  return null;
}

export function isSupplyNetworkStructure(
  structure: PlanetStructure | undefined,
): boolean {
  return structure?.kind === "supply_network";
}
