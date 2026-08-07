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
import { buildHexSphere } from "./hexSphere";
import {
  normalizeTerrainKind,
  sampleTerrainAtDirection,
  type TerrainKind,
} from "./planetTerrain";
import {
  isTileAroundCity,
  SETTLEMENT_HEX_FREQUENCY,
  settlementTileSet,
  tilesAroundCity,
} from "./settlements";
import { CHASSIS_RANK } from "./shipMeshes";
import { normalizeShipCargo, TRANSPORT_BP_CAPACITY } from "./fleets";
import {
  tilesAreHexAdjacent,
  tilesShareSupplyComponent,
} from "./supplyNetwork";
import {
  activatedDistrictsOfKind,
  computeActivation,
  DOMED_HABITAT_BP_COST,
  SPIRE_BP_COST,
  UNDERHIVE_BP_COST,
} from "./activation";

export { DOMED_HABITAT_BP_COST, SPIRE_BP_COST, UNDERHIVE_BP_COST };

/** BP per owned manufactorum district at start of turn. */
export const MANUFACTORUM_BP_INCOME = 10;

/** Extra BP per owned ore mine linked to an owned manufactorum. */
export const ORE_MINE_BP_BONUS = 5;

export const DETACHMENT_BP_COST = 500;

/** Build a new manufactorum district adjacent to an owned city. */
export const MANUFACTORUM_BP_COST = 1000;

/** Play-mode fortification / outpost / habitat build costs (slightly steep). */
export const TRENCH_LINE_BP_COST = 400;
export const ORE_MINE_BP_COST = 500;
export const OUTPOST_BP_COST = 550;
export const BASTION_BP_COST = 700;

/** Registered BP costs for play build / demolish. */
export const SURFACE_BP_COST: Partial<
  Record<District["kind"] | PlanetStructure["kind"], number>
> = {
  manufactorum: MANUFACTORUM_BP_COST,
  bastion: BASTION_BP_COST,
  outpost: OUTPOST_BP_COST,
  trench_line: TRENCH_LINE_BP_COST,
  ore_mine: ORE_MINE_BP_COST,
  underhive: UNDERHIVE_BP_COST,
  domed_habitat: DOMED_HABITAT_BP_COST,
  spire: SPIRE_BP_COST,
};

export function surfaceBpCost(
  kind: District["kind"] | PlanetStructure["kind"],
): number | null {
  const n = SURFACE_BP_COST[kind];
  return typeof n === "number" ? n : null;
}

/** Pay half the build cost (rounded up) to demolish a priced feature. */
export function demolishBpCost(
  kind: District["kind"] | PlanetStructure["kind"],
): number | null {
  const full = surfaceBpCost(kind);
  if (full == null) return null;
  return Math.ceil(full / 2);
}

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

export function structureOwnedBy(
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

export function collectOwnedManufactorums(
  planet: Planet,
  factionId: string,
): District[] {
  const snap = computeActivation(planet);
  return activatedDistrictsOfKind(
    planet,
    "manufactorum",
    factionId,
    snap,
  ).map((x) => x.district);
}

export function countOwnedManufactorums(
  planet: Planet,
  factionId: string,
): number {
  return collectOwnedManufactorums(planet, factionId).length;
}

export function collectOwnedOreMines(
  planet: Planet,
  factionId: string,
): PlanetStructure[] {
  return (planet.structures ?? []).filter(
    (s) => s.kind === "ore_mine" && structureOwnedBy(s, factionId),
  );
}

/**
 * Ore mine feeds a manufactorum when hex-adjacent, or when both tap the
 * same supply-station / supply-network logistics component.
 * Manufactorum must be activated; supply path uses activated stations only.
 */
export function oreMineLinkedToManufactorum(
  planet: Planet,
  mine: Pick<PlanetStructure, "tileIndex">,
  manufactorum: Pick<District, "tileIndex" | "id">,
): boolean {
  if (tilesAreHexAdjacent(mine.tileIndex, manufactorum.tileIndex)) return true;
  const snap = computeActivation(planet);
  if (!snap.activated.has(manufactorum.id)) return false;
  return tilesShareSupplyComponent(
    planet,
    mine.tileIndex,
    manufactorum.tileIndex,
    { onlyActivatedStationIds: snap.activated },
  );
}

/** Owned ore mines that feed at least one owned manufactorum. */
export function countLinkedOreMines(
  planet: Planet,
  factionId: string,
): number {
  const manus = collectOwnedManufactorums(planet, factionId);
  if (manus.length === 0) return 0;
  let n = 0;
  for (const mine of collectOwnedOreMines(planet, factionId)) {
    if (manus.some((m) => oreMineLinkedToManufactorum(planet, mine, m))) {
      n += 1;
    }
  }
  return n;
}

export type ManufactorumIncomeBreakdown = {
  manufactorums: number;
  base: number;
  oreMinesLinked: number;
  oreBonus: number;
  total: number;
};

export function manufactorumIncomeBreakdown(
  planet: Planet,
  factionId: string,
): ManufactorumIncomeBreakdown {
  const manufactorums = countOwnedManufactorums(planet, factionId);
  const oreMinesLinked = countLinkedOreMines(planet, factionId);
  const base = manufactorums * MANUFACTORUM_BP_INCOME;
  const oreBonus = oreMinesLinked * ORE_MINE_BP_BONUS;
  return {
    manufactorums,
    base,
    oreMinesLinked,
    oreBonus,
    total: base + oreBonus,
  };
}

/** BP gained at start of turn from manufactorums (+ linked ore mines). */
export function incomeForFaction(planet: Planet, factionId: string): number {
  return manufactorumIncomeBreakdown(planet, factionId).total;
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
  return canBuildCityAdjacentDistrict(
    campaign,
    planet,
    factionId,
    "manufactorum",
    MANUFACTORUM_BP_COST,
    cityId,
  );
}

export function canBuildBastion(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  cityId?: string | null,
): { ok: true; city: City } | { ok: false; reason: RecruitBlockReason; message: string } {
  return canBuildCityAdjacentDistrict(
    campaign,
    planet,
    factionId,
    "bastion",
    BASTION_BP_COST,
    cityId,
  );
}

export function canBuildOutpost(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  cityId?: string | null,
): { ok: true; city: City } | { ok: false; reason: RecruitBlockReason; message: string } {
  return canBuildCityAdjacentDistrict(
    campaign,
    planet,
    factionId,
    "outpost",
    OUTPOST_BP_COST,
    cityId,
  );
}

export function canBuildSpire(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  cityId?: string | null,
): { ok: true; city: City } | { ok: false; reason: RecruitBlockReason; message: string } {
  return canBuildCityAdjacentDistrict(
    campaign,
    planet,
    factionId,
    "spire",
    SPIRE_BP_COST,
    cityId,
  );
}

export function canBuildUnderhive(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  cityId?: string | null,
): { ok: true; city: City } | { ok: false; reason: RecruitBlockReason; message: string } {
  return canBuildCityAdjacentDistrict(
    campaign,
    planet,
    factionId,
    "underhive",
    UNDERHIVE_BP_COST,
    cityId,
  );
}

export function canBuildDomedHabitat(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  cityId?: string | null,
): { ok: true; city: City } | { ok: false; reason: RecruitBlockReason; message: string } {
  return canBuildCityAdjacentDistrict(
    campaign,
    planet,
    factionId,
    "domed_habitat",
    DOMED_HABITAT_BP_COST,
    cityId,
  );
}

function canBuildCityAdjacentDistrict(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  kind: District["kind"],
  cost: number,
  cityId?: string | null,
): { ok: true; city: City } | { ok: false; reason: RecruitBlockReason; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  const label =
    kind === "manufactorum"
      ? "manufactorum"
      : kind === "bastion"
        ? "bastion"
        : kind === "outpost"
          ? "outpost"
          : kind === "spire"
            ? "hive spire"
            : kind === "underhive"
              ? "underhive"
              : kind === "domed_habitat"
                ? "domed habitat"
                : "district";
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
      message: `Need an owned city to place a ${label} around`,
    };
  }
  const city = cityId ? cities.find((c) => c.id === cityId) : cities[0];
  if (!city) {
    return {
      ok: false,
      reason: "no_site",
      message: `Select an owned city for the ${label}`,
    };
  }
  if (getBuildingPoints(planet, factionId) < cost) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: `Need ${cost} BP (have ${getBuildingPoints(planet, factionId)})`,
    };
  }
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
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

export function canPlaceCityAdjacentDistrictAtTile(
  planet: Planet,
  city: City,
  tileIndex: number,
  label = "District",
): string | null {
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
  if (occupied.has(tileIndex)) return "That hex is occupied";
  if (!isTileAroundCity(city, tileIndex)) {
    return `${label}s must be placed within 2 hexes of the city`;
  }
  return null;
}

export function canPlaceManufactorumAtTile(
  planet: Planet,
  city: City,
  tileIndex: number,
): string | null {
  return canPlaceCityAdjacentDistrictAtTile(
    planet,
    city,
    tileIndex,
    "Manufactorum",
  );
}

export function canBuildTrenchLine(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
): { ok: true } | { ok: false; reason: RecruitBlockReason; message: string } {
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
  if (getBuildingPoints(planet, factionId) < TRENCH_LINE_BP_COST) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: `Need ${TRENCH_LINE_BP_COST} BP (have ${getBuildingPoints(planet, factionId)})`,
    };
  }
  return { ok: true };
}

export function canPlaceTrenchLineAtTile(
  planet: Planet,
  tileIndex: number,
): string | null {
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
  if (occupied.has(tileIndex)) return "That hex is occupied";
  return null;
}

/** Effective biome on a strategic hex (painted override or procedural). */
export function terrainKindAtTile(
  planet: Planet,
  tileIndex: number,
): TerrainKind | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const tile = sphere.tiles[tileIndex];
  if (!tile) return null;
  const override = normalizeTerrainKind(
    planet.tileTerrain?.[String(tileIndex)],
  );
  return sampleTerrainAtDirection(
    tile.center.x,
    tile.center.y,
    tile.center.z,
    planet.id,
    planet.classification,
    planet.type,
    override,
  ).kind;
}

export function canBuildOreMine(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
): { ok: true } | { ok: false; reason: RecruitBlockReason; message: string } {
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
  if (getBuildingPoints(planet, factionId) < ORE_MINE_BP_COST) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: `Need ${ORE_MINE_BP_COST} BP (have ${getBuildingPoints(planet, factionId)})`,
    };
  }
  return { ok: true };
}

/** Play placement: free hex on crater terrain only. */
export function canPlaceOreMineAtTile(
  planet: Planet,
  tileIndex: number,
): string | null {
  const occupied = settlementTileSet(
    planet.cities ?? [],
    planet.structures ?? [],
    planet.independentDistricts ?? [],
  );
  if (occupied.has(tileIndex)) return "That hex is occupied";
  const terrain = terrainKindAtTile(planet, tileIndex);
  if (terrain !== "crater") {
    return "Ore mines can only be built on crater hexes";
  }
  return null;
}

export type DemolishTarget =
  | {
      kind: "district";
      cityId: string | null;
      district: District;
      cost: number;
    }
  | {
      kind: "structure";
      structure: PlanetStructure;
      cost: number;
    };

/** Find a demolishable owned feature on a tile (play economy kinds only). */
export function demolishTargetAtTile(
  planet: Planet,
  factionId: string,
  tileIndex: number,
): DemolishTarget | null {
  for (const city of planet.cities ?? []) {
    const d = city.districts.find((x) => x.tileIndex === tileIndex);
    if (d && districtOwnedBy(d, factionId)) {
      const cost = demolishBpCost(d.kind);
      if (cost != null) {
        return { kind: "district", cityId: city.id, district: d, cost };
      }
    }
  }
  const ind = (planet.independentDistricts ?? []).find(
    (d) => d.tileIndex === tileIndex,
  );
  if (ind && districtOwnedBy(ind, factionId)) {
    const cost = demolishBpCost(ind.kind);
    if (cost != null) {
      return { kind: "district", cityId: null, district: ind, cost };
    }
  }
  const st = (planet.structures ?? []).find((s) => s.tileIndex === tileIndex);
  if (st && structureOwnedBy(st, factionId)) {
    const cost = demolishBpCost(st.kind);
    if (cost != null) {
      return { kind: "structure", structure: st, cost };
    }
  }
  return null;
}

export function canDemolishAtTile(
  campaign: Campaign,
  planet: Planet,
  factionId: string,
  tileIndex: number,
):
  | { ok: true; target: DemolishTarget }
  | { ok: false; reason: RecruitBlockReason | "nothing"; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return { ok: false, reason: "not_play", message: "Start Play to demolish" };
  }
  if (play.activeFactionId !== factionId) {
    return {
      ok: false,
      reason: "wrong_faction",
      message: "Only the active faction can demolish",
    };
  }
  const target = demolishTargetAtTile(planet, factionId, tileIndex);
  if (!target) {
    return {
      ok: false,
      reason: "nothing",
      message: "No owned demolishable feature on that hex",
    };
  }
  if (getBuildingPoints(planet, factionId) < target.cost) {
    return {
      ok: false,
      reason: "insufficient_bp",
      message: `Need ${target.cost} BP to demolish (have ${getBuildingPoints(planet, factionId)})`,
    };
  }
  return { ok: true, target };
}

/** True when the active (or any) controller may rename this feature. */
export function canRenameControlled(
  campaign: Campaign,
  controllingFactionId: string | undefined,
): boolean {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) return true; // edit / setup
  if (!controllingFactionId) return false;
  return play.activeFactionId === controllingFactionId;
}

export function ownedCamps(
  planet: Planet,
  factionId: string,
): { cityId: string | null; district: District }[] {
  const snap = computeActivation(planet);
  return activatedDistrictsOfKind(planet, "camp", factionId, snap).map(
    (x) => ({ cityId: x.cityId, district: x.district }),
  );
}

export function ownedSpacePorts(
  planet: Planet,
  factionId: string,
): { cityId: string | null; district: District }[] {
  const snap = computeActivation(planet);
  return activatedDistrictsOfKind(planet, "docks", factionId, snap).map(
    (x) => ({ cityId: x.cityId, district: x.district }),
  );
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

/** Credit BP into a planet's per-faction bank. */
export function creditBuildingPoints(
  planet: Planet,
  factionId: string,
  amount: number,
): Planet {
  const add = Math.max(0, Math.floor(amount));
  if (add <= 0) return planet;
  return {
    ...planet,
    buildingPoints: {
      ...(planet.buildingPoints ?? {}),
      [factionId]: getBuildingPoints(planet, factionId) + add,
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

/**
 * Unload transport cargo into the orbit world's faction BP bank.
 * Requires an owned city on that planet so BP can feed local builds/recruiting.
 */
export function canUnloadTransportCargo(
  campaign: Campaign,
  fleet: Fleet,
  planet: Planet,
  amount?: number,
):
  | { ok: true; unload: number }
  | { ok: false; reason: TransportDeployBlockReason; message: string } {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return {
      ok: false,
      reason: "not_play",
      message: "Start Play to unload cargo",
    };
  }
  if (play.activeFactionId !== fleet.factionId) {
    return {
      ok: false,
      reason: "wrong_faction",
      message: "Only the active faction can unload this fleet",
    };
  }
  if (
    fleet.location.kind !== "orbit" ||
    fleet.location.planetId !== planet.id
  ) {
    return {
      ok: false,
      reason: "no_orbit",
      message: "Fleet must be in orbit to unload BP onto this world",
    };
  }
  if (fleetCargoCapacity(fleet) <= 0) {
    return {
      ok: false,
      reason: "no_transport",
      message: "Need a transport ship in the fleet",
    };
  }
  if (ownedCities(planet, fleet.factionId).length === 0) {
    return {
      ok: false,
      reason: "no_site",
      message: "Need an owned city on this world to receive BP",
    };
  }
  const cargo = fleetCargoBp(fleet);
  if (cargo <= 0) {
    return {
      ok: false,
      reason: "insufficient_cargo",
      message: "No BP in transport holds to unload",
    };
  }
  const want =
    amount != null && amount > 0 ? Math.floor(amount) : cargo;
  const unload = Math.min(want, cargo);
  if (unload <= 0) {
    return {
      ok: false,
      reason: "insufficient_cargo",
      message: "Nothing to unload",
    };
  }
  return { ok: true, unload };
}
