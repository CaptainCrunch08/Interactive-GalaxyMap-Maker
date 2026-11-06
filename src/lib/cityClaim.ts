import type {
  Army,
  Campaign,
  City,
  District,
  Faction,
  Planet,
  PlanetStructure,
} from "../types/campaign";
import { normalizeCampaignPlay } from "../types/campaign";
import { areFederated } from "./federation";
import {
  buildHexSphere,
  hexTileDistance,
  nearestTileIndex,
} from "./hexSphere";
import {
  ARMY_MOVE_RANGE,
  armyMovementRemaining,
  playMoveBlockReason,
} from "./play";
import {
  MAX_DISTRICT_CITY_RANGE,
  SETTLEMENT_HEX_FREQUENCY,
} from "./settlements";

export type ClaimTarget =
  | { kind: "city"; cityId: string; label: string }
  | { kind: "independent_district"; districtId: string; label: string }
  | { kind: "structure"; structureId: string; label: string };

export type ClaimCheck =
  | { ok: true; target: ClaimTarget }
  | { ok: false; reason: string };

function sphere() {
  return buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
}

function armyTileIndex(army: Army): number {
  return nearestTileIndex(sphere(), army.dir);
}

/** Hub + every hex within {@link MAX_DISTRICT_CITY_RANGE} (city limits). */
export function cityLimitTiles(city: City): Set<number> {
  const s = sphere();
  const tiles = new Set<number>([city.tileIndex]);
  for (let i = 0; i < s.tiles.length; i++) {
    const d = hexTileDistance(s, city.tileIndex, i);
    if (Number.isFinite(d) && d <= MAX_DISTRICT_CITY_RANGE) tiles.add(i);
  }
  return tiles;
}

function isEnemyDetachment(
  factions: Faction[],
  selfFactionId: string,
  otherFactionId: string,
): boolean {
  if (otherFactionId === selfFactionId) return false;
  return !areFederated(factions, selfFactionId, otherFactionId);
}

/** Enemy detachments whose hex lies in `tiles`. */
export function enemyArmiesInTiles(
  planet: Planet,
  factions: Faction[],
  selfFactionId: string,
  tiles: Set<number>,
  ignoreArmyId?: string,
): Army[] {
  const s = sphere();
  return (planet.armies ?? []).filter((a) => {
    if (a.id === ignoreArmyId) return false;
    if (!isEnemyDetachment(factions, selfFactionId, a.factionId)) return false;
    const ti = nearestTileIndex(s, a.dir);
    return tiles.has(ti);
  });
}

/** Hexes within `range` of a center tile (inclusive). */
export function tilesWithinRange(centerTile: number, range: number): Set<number> {
  const s = sphere();
  const tiles = new Set<number>([centerTile]);
  for (let i = 0; i < s.tiles.length; i++) {
    const d = hexTileDistance(s, centerTile, i);
    if (Number.isFinite(d) && d <= range) tiles.add(i);
  }
  return tiles;
}

function cityContainingTile(planet: Planet, tileIndex: number): City | null {
  for (const city of planet.cities ?? []) {
    if (cityLimitTiles(city).has(tileIndex)) return city;
  }
  return null;
}

function independentDistrictAt(
  planet: Planet,
  tileIndex: number,
): District | null {
  return (
    (planet.independentDistricts ?? []).find((d) => d.tileIndex === tileIndex) ??
    null
  );
}

function structureAt(
  planet: Planet,
  tileIndex: number,
): PlanetStructure | null {
  return (planet.structures ?? []).find((s) => s.tileIndex === tileIndex) ?? null;
}

function alreadyOwned(
  ownerId: string | undefined,
  claimantFactionId: string,
): boolean {
  return ownerId === claimantFactionId;
}

/**
 * What the detachment can claim from its current hex in Play mode.
 * City claim requires no enemies in city limits; independents use a 2-hex
 * clear around the feature.
 */
export function claimCheckForArmy(
  campaign: Campaign,
  planet: Planet,
  army: Army,
): ClaimCheck {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) {
    return { ok: false, reason: "Start Play mode to claim territory" };
  }
  const moveBlock = playMoveBlockReason(
    campaign,
    army.factionId,
    army.id,
    "army",
  );
  if (moveBlock) return { ok: false, reason: moveBlock };
  if (armyMovementRemaining(play, army.id) <= 0) {
    return {
      ok: false,
      reason: `This detachment has used all ${ARMY_MOVE_RANGE} hexes this turn`,
    };
  }

  const tile = armyTileIndex(army);
  const factions = campaign.factions;

  // Independents / structures are claimed on their own hex first (even if that
  // hex also falls inside a nearby city's geographic limits).
  const ind = independentDistrictAt(planet, tile);
  if (ind) {
    if (alreadyOwned(ind.controllingFactionId, army.factionId)) {
      return { ok: false, reason: `${ind.name} is already yours` };
    }
    const zone = tilesWithinRange(ind.tileIndex, MAX_DISTRICT_CITY_RANGE);
    const enemies = enemyArmiesInTiles(
      planet,
      factions,
      army.factionId,
      zone,
      army.id,
    );
    if (enemies.length > 0) {
      return {
        ok: false,
        reason: `Enemy detachments within ${MAX_DISTRICT_CITY_RANGE} hexes of ${ind.name}`,
      };
    }
    return {
      ok: true,
      target: {
        kind: "independent_district",
        districtId: ind.id,
        label: ind.name,
      },
    };
  }

  const st = structureAt(planet, tile);
  if (st) {
    if (alreadyOwned(st.controllingFactionId, army.factionId)) {
      return { ok: false, reason: `${st.name} is already yours` };
    }
    const zone = tilesWithinRange(st.tileIndex, MAX_DISTRICT_CITY_RANGE);
    const enemies = enemyArmiesInTiles(
      planet,
      factions,
      army.factionId,
      zone,
      army.id,
    );
    if (enemies.length > 0) {
      return {
        ok: false,
        reason: `Enemy detachments within ${MAX_DISTRICT_CITY_RANGE} hexes of ${st.name}`,
      };
    }
    return {
      ok: true,
      target: {
        kind: "structure",
        structureId: st.id,
        label: st.name,
      },
    };
  }

  const city = cityContainingTile(planet, tile);
  if (city) {
    if (alreadyOwned(city.controllingFactionId, army.factionId)) {
      return { ok: false, reason: `${city.name} is already yours` };
    }
    const limits = cityLimitTiles(city);
    const enemies = enemyArmiesInTiles(
      planet,
      factions,
      army.factionId,
      limits,
      army.id,
    );
    if (enemies.length > 0) {
      return {
        ok: false,
        reason: `Enemy detachments still within ${city.name}'s limits`,
      };
    }
    return {
      ok: true,
      target: { kind: "city", cityId: city.id, label: city.name },
    };
  }

  return {
    ok: false,
    reason: "Stand on a city, independent district, or structure to claim it",
  };
}

/** Apply ownership flip for a validated claim target. */
export function applyClaimToPlanet(
  planet: Planet,
  army: Army,
  target: ClaimTarget,
): Planet {
  const fid = army.factionId;
  if (target.kind === "city") {
    return {
      ...planet,
      cities: (planet.cities ?? []).map((c) =>
        c.id !== target.cityId
          ? c
          : {
              ...c,
              controllingFactionId: fid,
              districts: c.districts.map((d) => ({
                ...d,
                controllingFactionId: fid,
              })),
            },
      ),
    };
  }
  if (target.kind === "independent_district") {
    return {
      ...planet,
      independentDistricts: (planet.independentDistricts ?? []).map((d) =>
        d.id === target.districtId
          ? { ...d, controllingFactionId: fid }
          : d,
      ),
    };
  }
  return {
    ...planet,
    structures: (planet.structures ?? []).map((s) =>
      s.id === target.structureId
        ? { ...s, controllingFactionId: fid }
        : s,
    ),
  };
}
