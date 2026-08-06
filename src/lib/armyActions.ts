import type { Army, Campaign, CampaignPlay, Planet } from "../types/campaign";
import { normalizeCampaignPlay } from "../types/campaign";
import {
  armiesAreAdjacent,
  armyStrength,
  stationArmiesAreAdjacent,
} from "./battleResolve";
import { districtOwnedBy } from "./buildingPoints";
import { buildHexSphere, nearestTileIndex } from "./hexSphere";
import {
  armyMovementRemaining,
  withPlay,
} from "./play";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";
import { nearestStationTile } from "./stationHex";
import { buildStationMaze } from "./stationMaze";

function asVec3(dir: { x: number; y: number; z: number }) {
  return { x: dir.x, y: dir.y, z: dir.z };
}

/** Tile index under an army on a planet or warp-gate station. */
export function armyTileIndex(planet: Planet, army: Pick<Army, "dir">): number {
  if (planet.type === "warp_gate") {
    const maze = buildStationMaze(planet.id);
    return nearestStationTile(army.dir, undefined, maze.walkable);
  }
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  return nearestTileIndex(sphere, asVec3(army.dir));
}

export function armiesAdjacentOnPlanet(
  planet: Planet,
  a: Pick<Army, "dir">,
  b: Pick<Army, "dir">,
): boolean {
  if (planet.type === "warp_gate") {
    return stationArmiesAreAdjacent(a, b, planet.id);
  }
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  return armiesAreAdjacent(a, b, sphere);
}

/** True when the army sits on a War Camp owned by its faction. */
export function isOnFriendlyWarCamp(planet: Planet, army: Army): boolean {
  const tile = armyTileIndex(planet, army);
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.kind !== "camp") continue;
      if (d.tileIndex !== tile) continue;
      if (!districtOwnedBy(d, army.factionId)) continue;
      return true;
    }
  }
  return false;
}

export function campHealEnteredRound(
  play: CampaignPlay,
  armyId: string,
): number | null {
  const n = play.armyCampEnteredRound?.[armyId];
  return typeof n === "number" && n >= 1 ? n : null;
}

/** Mark that this army just entered / reset rest on a friendly war camp. */
export function withCampEnter(
  play: CampaignPlay,
  armyId: string,
): CampaignPlay {
  return normalizeCampaignPlay({
    ...play,
    armyCampEnteredRound: {
      ...(play.armyCampEnteredRound ?? {}),
      [armyId]: play.round,
    },
  });
}

export function withoutCampEnter(
  play: CampaignPlay,
  armyId: string,
): CampaignPlay {
  const next = { ...(play.armyCampEnteredRound ?? {}) };
  delete next[armyId];
  return normalizeCampaignPlay({
    ...play,
    armyCampEnteredRound: next,
  });
}

/**
 * After a move onto a friendly War Camp, start the rest timer.
 * Any move clears the previous timer first.
 */
export function playAfterArmyMoved(
  play: CampaignPlay,
  planet: Planet,
  army: Army,
  distance: number,
): CampaignPlay {
  if (!play.active || distance <= 0) return play;
  let next = withoutCampEnter(play, army.id);
  if (isOnFriendlyWarCamp(planet, army) && armyStrength(army) < 100) {
    next = withCampEnter(next, army.id);
  }
  return next;
}

/**
 * Heal detachments that have stayed on a friendly War Camp for a full round
 * (entered in an earlier round, still there, still damaged).
 */
export function applyWarCampHeals(campaign: Campaign): {
  campaign: Campaign;
  healedIds: string[];
} {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) return { campaign, healedIds: [] };

  const healedIds: string[] = [];
  const campRounds = { ...(play.armyCampEnteredRound ?? {}) };

  const planets = campaign.planets.map((planet) => {
    let changed = false;
    const armies = (planet.armies ?? []).map((army) => {
      const entered = campRounds[army.id];
      if (entered == null) return army;
      if (entered >= play.round) return army;
      if (!isOnFriendlyWarCamp(planet, army)) {
        delete campRounds[army.id];
        return army;
      }
      if (armyStrength(army) >= 100) {
        delete campRounds[army.id];
        return army;
      }
      healedIds.push(army.id);
      delete campRounds[army.id];
      changed = true;
      return { ...army, strengthPercent: 100 };
    });
    return changed ? { ...planet, armies } : planet;
  });

  // Drop timers for armies that no longer exist.
  const living = new Set(
    planets.flatMap((p) => (p.armies ?? []).map((a) => a.id)),
  );
  for (const id of Object.keys(campRounds)) {
    if (!living.has(id)) delete campRounds[id];
  }

  let next = {
    ...campaign,
    planets,
  };
  next = withPlay(next, {
    ...play,
    armyCampEnteredRound: campRounds,
  });
  return { campaign: next, healedIds };
}

export function canMergeArmies(
  campaign: Campaign,
  planet: Planet,
  sourceId: string,
  targetId: string,
): { ok: true } | { ok: false; message: string } {
  if (sourceId === targetId) {
    return { ok: false, message: "Pick a different detachment to merge into" };
  }
  const source = (planet.armies ?? []).find((a) => a.id === sourceId);
  const target = (planet.armies ?? []).find((a) => a.id === targetId);
  if (!source || !target) {
    return { ok: false, message: "Detachment not found" };
  }
  if (source.factionId !== target.factionId) {
    return { ok: false, message: "Detachments must be the same faction" };
  }
  if (!armiesAdjacentOnPlanet(planet, source, target)) {
    return { ok: false, message: "Detachments must be on adjacent hexes" };
  }
  const combined = armyStrength(source) + armyStrength(target);
  if (combined > 100) {
    return {
      ok: false,
      message: `Combined strength would be ${combined}% (max 100%)`,
    };
  }

  const play = normalizeCampaignPlay(campaign.play);
  if (play.active) {
    if (play.activeFactionId !== source.factionId) {
      return { ok: false, message: "Only the active faction can merge" };
    }
    if (armyMovementRemaining(play, sourceId) < 1) {
      return {
        ok: false,
        message: "Merging costs 1 movement (none remaining)",
      };
    }
  }
  return { ok: true };
}

/** Same-faction adjacent detachments the source can merge into. */
export function mergeTargetsForArmy(
  campaign: Campaign,
  planet: Planet,
  sourceId: string,
): Army[] {
  const source = (planet.armies ?? []).find((a) => a.id === sourceId);
  if (!source) return [];
  return (planet.armies ?? []).filter((a) => {
    if (a.id === sourceId) return false;
    return canMergeArmies(campaign, planet, sourceId, a.id).ok;
  });
}

export function mergeArmiesInto(
  campaign: Campaign,
  planetId: string,
  sourceId: string,
  targetId: string,
): { ok: true; campaign: Campaign } | { ok: false; message: string } {
  const planet = campaign.planets.find((p) => p.id === planetId);
  if (!planet) return { ok: false, message: "Planet not found" };
  const check = canMergeArmies(campaign, planet, sourceId, targetId);
  if (!check.ok) return check;

  const source = (planet.armies ?? []).find((a) => a.id === sourceId)!;
  const target = (planet.armies ?? []).find((a) => a.id === targetId)!;
  const combined = armyStrength(source) + armyStrength(target);

  const play = normalizeCampaignPlay(campaign.play);
  let nextPlay = play;
  if (play.active) {
    // Source spends its merge action (requires 1 movement remaining), then is removed.
    const movement = { ...(play.armyMovementUsed ?? {}) };
    delete movement[sourceId];
    const camps = { ...(play.armyCampEnteredRound ?? {}) };
    delete camps[sourceId];
    nextPlay = normalizeCampaignPlay({
      ...play,
      armyMovementUsed: movement,
      movedArmyIds: play.movedArmyIds.filter((id) => id !== sourceId),
      armyCampEnteredRound: camps,
    });
  }

  const planets = campaign.planets.map((p) => {
    if (p.id !== planetId) return p;
    return {
      ...p,
      armies: (p.armies ?? [])
        .filter((a) => a.id !== sourceId)
        .map((a) =>
          a.id === targetId ? { ...a, strengthPercent: combined } : a,
        ),
    };
  });

  return {
    ok: true,
    campaign: withPlay({ ...campaign, planets }, nextPlay),
  };
}
