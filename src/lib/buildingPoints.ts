import type {
  Campaign,
  City,
  District,
  Fleet,
  Planet,
  PlanetStructure,
  Ship,
  ShipChassis,
} from "../types/campaign";
import { normalizeCampaignPlay, SHIP_CHASSIS_ORDER } from "../types/campaign";
import { isTileAroundCity, settlementTileSet, tilesAroundCity } from "./settlements";
import { CHASSIS_RANK } from "./shipMeshes";
import { normalizeShipCargo, TRANSPORT_BP_CAPACITY } from "./fleets";

/** BP per owned manufactorum district at start of turn. */
export const MANUFACTORUM_BP_INCOME = 10;

export const DETACHMENT_BP_COST = 500;

/** Build a new manufactorum district adjacent to an owned city. */
export const MANUFACTORUM_BP_COST = 1000;

/** Re-export transport hold capacity. */
export { TRANSPORT_BP_CAPACITY };

/** Baseline: escort costs 50 BP; other hulls scale by chassis rank. */
export const ESCORT_BP_COST = 50;

function shipBpFromRank(chassis: ShipChassis): number {
  const baseRank = CHASSIS_RANK.escort;
  const rank = CHASSIS_RANK[chassis] ?? baseRank;
  return Math.max(
    ESCORT_BP_COST,
    Math.round((ESCORT_BP_COST * rank) / baseRank),
  );
}

export const SHIP_BP_COST: Record<ShipChassis, number> = Object.fromEntries(
  SHIP_CHASSIS_ORDER.map((c) => [c, shipBpFromRank(c)]),
) as Record<ShipChassis, number>;

export function shipBpCost(chassis: ShipChassis): number {
  return SHIP_BP_COST[chassis] ?? ESCORT_BP_COST;
}

export function districtOwnedBy(district: District, factionId: string): boolean {
  return district.controllingFactionId === factionId;
}

function structureOwnedBy(
  structure: PlanetStructure,
  factionId: string,
): boolean {
  return structure.controllingFactionId === factionId;
}

export function getBuildingPoints(
  planet: Planet,
  factionId: string,
): number {
  const n = planet.buildingPoints?.[factionId];
  return typeof n === "number" && n > 0 ? Math.floor(n) : 0;
}

export function countOwnedManufactorums(
  planet: Planet,
  factionId: string,
): number {
  let n = 0;
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind === "manufactorum" && districtOwnedBy(d, factionId)) n += 1;
    }
  }
  return n;
}

/** BP gained at start of turn from manufactorums on this planet. */
export function incomeForFaction(planet: Planet, factionId: string): number {
  return countOwnedManufactorums(planet, factionId) * MANUFACTORUM_BP_INCOME;
}

export type RecruitBlockReason =
  | "not_play"
  | "wrong_faction"
  | "no_site"
  | "insufficient_bp";

export function ownedCities(planet: Planet, factionId: string): City[] {
  return (planet.cities ?? []).filter(
    (c) => c.controllingFactionId === factionId,
  );
}

export function canBuildManufactorum(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  cityId?: string | null,
): { ok: true; city: City } | { ok: false; reason: RecruitBlockReason; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return { ok: false, reason: "not_play", message: "Start Play to build" };
  }
  if (play.activeFactionId !== factionId) {
    return {
      ok: false,
      reason: "wrong_faction",
      message: "Only the active faction can build",
    };
  }
  const cities = ownedCities(planet, factionId);
  if (cities.length === 0) {
    return {
      ok: false,
      reason: "no_site",
      message: "Need an owned city to place a manufactorum around",
    };
  }
  const city = cityId
    ? cities.find((c) => c.id === cityId)
    : cities[0];
  if (!city) {
    return {
      ok: false,
      reason: "no_site",
      message: "Select an owned city for the manufactorum",
    };
  }
  if (getBuildingPoints(planet, factionId) < MANUFACTORUM_BP_COST) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: `Need ${MANUFACTORUM_BP_COST} BP (have ${getBuildingPoints(planet, factionId)})`,
    };
  }
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
  );
  if (tilesAroundCity(city, occupied).length === 0) {
    return {
      ok: false,
      reason: "no_site",
      message: "No free hexes around that city",
    };
  }
  return { ok: true, city };
}

export function canPlaceManufactorumAtTile(
  planet: Planet,
  city: City,
  tileIndex: number,
): string | null {
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
  );
  if (occupied.has(tileIndex)) return "That hex is occupied";
  if (!isTileAroundCity(city, tileIndex)) {
    return "Manufactorums must be placed next to the city";
  }
  return null;
}

export function ownedCamps(
  planet: Planet,
  factionId: string,
): { cityId: string; district: District }[] {
  const out: { cityId: string; district: District }[] = [];
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind === "camp" && districtOwnedBy(d, factionId)) {
        out.push({ cityId: city.id, district: d });
      }
    }
  }
  return out;
}

export function ownedSpacePorts(
  planet: Planet,
  factionId: string,
): { cityId: string; district: District }[] {
  const out: { cityId: string; district: District }[] = [];
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind === "docks" && districtOwnedBy(d, factionId)) {
        out.push({ cityId: city.id, district: d });
      }
    }
  }
  return out;
}

export function applyTurnIncome(
  campaign: Campaign,
  factionId: string,
): Campaign {
  return {
    ...campaign,
    planets: campaign.planets.map((p) => {
      const gain = incomeForFaction(p, factionId);
      if (gain <= 0) return p;
      const prev = getBuildingPoints(p, factionId);
      return {
        ...p,
        buildingPoints: {
          ...(p.buildingPoints ?? {}),
          [factionId]: prev + gain,
        },
      };
    }),
  };
}

export function canRecruitDetachment(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
): { ok: true } | { ok: false; reason: RecruitBlockReason; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return { ok: false, reason: "not_play", message: "Start Play to recruit" };
  }
  if (play.activeFactionId !== factionId) {
    return {
      ok: false,
      reason: "wrong_faction",
      message: "Only the active faction can recruit",
    };
  }
  if (ownedCamps(planet, factionId).length === 0) {
    return {
      ok: false,
      reason: "no_site",
      message: "Need an owned War Camp on this planet",
    };
  }
  if (getBuildingPoints(planet, factionId) < DETACHMENT_BP_COST) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: `Need ${DETACHMENT_BP_COST} BP (have ${getBuildingPoints(planet, factionId)})`,
    };
  }
  return { ok: true };
}

/** Space port present for ship builds (cost checked separately per chassis). */
export function canUseSpacePort(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
): { ok: true } | { ok: false; reason: RecruitBlockReason; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return { ok: false, reason: "not_play", message: "Start Play to recruit" };
  }
  if (play.activeFactionId !== factionId) {
    return {
      ok: false,
      reason: "wrong_faction",
      message: "Only the active faction can recruit",
    };
  }
  if (ownedSpacePorts(planet, factionId).length === 0) {
    return {
      ok: false,
      reason: "no_site",
      message: "Need an owned Space Port on this planet",
    };
  }
  return { ok: true };
}

export function canRecruitShip(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  chassis: ShipChassis,
): { ok: true } | { ok: false; reason: RecruitBlockReason; message: string } {
  const site = canUseSpacePort(campaign, planet, factionId);
  if (!site.ok) return site;
  const cost = shipBpCost(chassis);
  if (getBuildingPoints(planet, factionId) < cost) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: `Need ${cost} BP (have ${getBuildingPoints(planet, factionId)})`,
    };
  }
  return { ok: true };
}

/** @deprecated Use canRecruitShip — kept for older call sites. */
export function canRecruitFleet(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
): { ok: true } | { ok: false; reason: RecruitBlockReason; message: string } {
  return canRecruitShip(campaign, planet, factionId, "escort");
}

export function spendBuildingPoints(
  planet: Planet,
  factionId: string,
  cost: number,
): Planet {
  const next = Math.max(0, getBuildingPoints(planet, factionId) - cost);
  return {
    ...planet,
    buildingPoints: {
      ...(planet.buildingPoints ?? {}),
      [factionId]: next,
    },
  };
}

export function shipCargoBp(ship: Ship): number {
  if (ship.chassis !== "transport") return 0;
  const n = ship.cargoBp;
  return typeof n === "number" && n > 0 ? Math.floor(n) : 0;
}

export function shipCargoCapacity(ship: Ship): number {
  return ship.chassis === "transport" ? TRANSPORT_BP_CAPACITY : 0;
}

export function fleetCargoBp(fleet: Fleet): number {
  return fleet.ships.reduce((n, s) => n + shipCargoBp(s), 0);
}

export function fleetCargoCapacity(fleet: Fleet): number {
  return fleet.ships.reduce((n, s) => n + shipCargoCapacity(s), 0);
}

export function fleetCargoRoom(fleet: Fleet): number {
  return Math.max(0, fleetCargoCapacity(fleet) - fleetCargoBp(fleet));
}

/** Spend BP from transport holds (most-full first). Null if not enough cargo. */
export function spendFleetCargo(fleet: Fleet, cost: number): Fleet | null {
  const need = Math.max(0, Math.floor(cost));
  if (need <= 0) return fleet;
  if (fleetCargoBp(fleet) < need) return null;

  const ships = fleet.ships.map((s) => normalizeShipCargo({ ...s }));
  const order = ships
    .map((s, i) => ({ i, bp: shipCargoBp(s) }))
    .filter((x) => x.bp > 0)
    .sort((a, b) => b.bp - a.bp);

  let remaining = need;
  for (const { i } of order) {
    if (remaining <= 0) break;
    const have = shipCargoBp(ships[i]!);
    const take = Math.min(have, remaining);
    ships[i] = { ...ships[i]!, cargoBp: have - take };
    remaining -= take;
  }
  return { ...fleet, ships };
}

/** Fill transport holds up to capacity. Returns how many BP were loaded. */
export function addFleetCargo(
  fleet: Fleet,
  amount: number,
): { fleet: Fleet; added: number } {
  let left = Math.max(0, Math.floor(amount));
  if (left <= 0) return { fleet, added: 0 };

  const ships = fleet.ships.map((s) => normalizeShipCargo({ ...s }));
  for (let i = 0; i < ships.length; i++) {
    if (left <= 0) break;
    const ship = ships[i]!;
    if (ship.chassis !== "transport") continue;
    const have = shipCargoBp(ship);
    const room = TRANSPORT_BP_CAPACITY - have;
    if (room <= 0) continue;
    const add = Math.min(room, left);
    ships[i] = { ...ship, cargoBp: have + add };
    left -= add;
  }
  return { fleet: { ...fleet, ships }, added: amount - left };
}

export type TransportDeployBlockReason =
  | RecruitBlockReason
  | "no_orbit"
  | "no_transport"
  | "insufficient_cargo";

/**
 * Deploy a detachment from orbiting transport cargo — no War Camp required.
 * Fleet must be in orbit of the target planet (including warp gates).
 */
export function canDeployFromTransport(
  campaign: Campaign,
  fleet: Fleet,
  planet: Planet,
):
  | { ok: true }
  | { ok: false; reason: TransportDeployBlockReason; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return { ok: false, reason: "not_play", message: "Start Play to deploy" };
  }
  if (play.activeFactionId !== fleet.factionId) {
    return {
      ok: false,
      reason: "wrong_faction",
      message: "Only the active faction can deploy from this fleet",
    };
  }
  if (
    fleet.location.kind !== "orbit" ||
    fleet.location.planetId !== planet.id
  ) {
    return {
      ok: false,
      reason: "no_orbit",
      message: "Fleet must be in orbit of this world to deploy",
    };
  }
  if (fleetCargoCapacity(fleet) <= 0) {
    return {
      ok: false,
      reason: "no_transport",
      message: "Need a transport ship to carry deployment BP",
    };
  }
  if (fleetCargoBp(fleet) < DETACHMENT_BP_COST) {
    return {
      ok: false,
      reason: "insufficient_cargo",
      message: `Need ${DETACHMENT_BP_COST} BP in transport holds (have ${fleetCargoBp(fleet)})`,
    };
  }
  return { ok: true };
}

/** Load planet BP into orbiting transport holds. */
export function canLoadTransportCargo(
  campaign: Campaign,
  fleet: Fleet,
  planet: Planet,
  amount?: number,
):
  | { ok: true; load: number }
  | { ok: false; reason: TransportDeployBlockReason; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return { ok: false, reason: "not_play", message: "Start Play to load cargo" };
  }
  if (play.activeFactionId !== fleet.factionId) {
    return {
      ok: false,
      reason: "wrong_faction",
      message: "Only the active faction can load this fleet",
    };
  }
  if (
    fleet.location.kind !== "orbit" ||
    fleet.location.planetId !== planet.id
  ) {
    return {
      ok: false,
      reason: "no_orbit",
      message: "Fleet must be in orbit to load BP from this world",
    };
  }
  if (fleetCargoCapacity(fleet) <= 0) {
    return {
      ok: false,
      reason: "no_transport",
      message: "Need a transport ship in the fleet",
    };
  }
  const room = fleetCargoRoom(fleet);
  if (room <= 0) {
    return {
      ok: false,
      reason: "insufficient_cargo",
      message: "Transport holds are full",
    };
  }
  const bank = getBuildingPoints(planet, fleet.factionId);
  if (bank <= 0) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: "No planet BP available to load",
    };
  }
  const want =
    amount != null && amount > 0 ? Math.floor(amount) : Math.min(room, bank);
  const load = Math.min(want, room, bank);
  if (load <= 0) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: "Nothing to load",
    };
  }
  return { ok: true, load };
}
