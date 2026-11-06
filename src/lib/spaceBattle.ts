import type {
  Campaign,
  CampaignBattleLogEntry,
  Fleet,
  Planet,
  VictoryKind,
} from "../types/campaign";
import {
  applyStrengthLoss,
  armyStrength,
  formatBattleDate,
  VICTORY_KIND_LABELS,
} from "./battleResolve";
import { fleetPower, hasFlagship } from "./fleetPower";
import { fleetsShareOrbit } from "./fleets";
import { buildHexSphere } from "./hexSphere";
import {
  normalizeTerrainKind,
  sampleTerrainAtDirection,
} from "./planetTerrain";
import { isSettlementForbiddenTerrain } from "./terrainGenerate";
import { normalizePlanetClassification } from "./planetClass";
import { getFactionById } from "./territory";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";
import type { Army } from "../types/campaign";

export type SpaceBattlePending = {
  attackerFleetId: string;
  defenderFleetId: string;
};

export type SpaceBattleInput = {
  attackerVp: number;
  defenderVp: number;
  attackerFleetDestroyed: boolean;
  defenderFleetDestroyed: boolean;
  attackerFlagshipDestroyed: boolean;
  defenderFlagshipDestroyed: boolean;
};

export function canFleetsSpaceBattle(
  attacker: Fleet,
  defender: Fleet,
): string | null {
  if (attacker.id === defender.id) return "Pick two different fleets";
  if (attacker.factionId === defender.factionId) {
    return "Fleets must belong to opposing factions";
  }
  if (!fleetsShareOrbit(attacker, defender)) {
    return "Fleets must be in the same orbit (same star or planet)";
  }
  return null;
}

/**
 * Space victory: wipe beats VP. Heroic if double VP or own FP ≤ ¾ enemy FP.
 * Epochal if both.
 */
export function classifySpaceBattleVictory(args: {
  attackerVp: number;
  defenderVp: number;
  attackerFp: number;
  defenderFp: number;
  attackerFleetDestroyed: boolean;
  defenderFleetDestroyed: boolean;
}): {
  kind: VictoryKind;
  victorSide: "attacker" | "defender" | null;
} {
  const {
    attackerVp,
    defenderVp,
    attackerFp,
    defenderFp,
    attackerFleetDestroyed,
    defenderFleetDestroyed,
  } = args;

  let victorSide: "attacker" | "defender" | null = null;
  if (defenderFleetDestroyed && !attackerFleetDestroyed) {
    victorSide = "attacker";
  } else if (attackerFleetDestroyed && !defenderFleetDestroyed) {
    victorSide = "defender";
  } else if (attackerFleetDestroyed && defenderFleetDestroyed) {
    victorSide = null;
  } else if (attackerVp > defenderVp) {
    victorSide = "attacker";
  } else if (defenderVp > attackerVp) {
    victorSide = "defender";
  } else {
    return { kind: "draw", victorSide: null };
  }

  if (!victorSide) {
    return { kind: "draw", victorSide: null };
  }

  const winnerVp = victorSide === "attacker" ? attackerVp : defenderVp;
  const loserVp = victorSide === "attacker" ? defenderVp : attackerVp;
  const winnerFp = victorSide === "attacker" ? attackerFp : defenderFp;
  const loserFp = victorSide === "attacker" ? defenderFp : attackerFp;

  const doubleVp = loserVp > 0 ? winnerVp >= loserVp * 2 : winnerVp > 0;
  const underdog = loserFp > 0 && winnerFp <= loserFp * 0.75;

  if (doubleVp && underdog) return { kind: "epochal", victorSide };
  if (doubleVp || underdog) return { kind: "heroic", victorSide };

  const total = winnerVp + loserVp;
  const margin = total > 0 ? (winnerVp - loserVp) / total : 1;
  if (loserVp <= 0 && winnerVp > 0) return { kind: "decisive", victorSide };
  if (margin >= 0.4) return { kind: "decisive", victorSide };
  if (margin >= 0.2) return { kind: "major", victorSide };
  return { kind: "minor", victorSide };
}

export function buildSpaceBattleLogEntry(args: {
  campaign: Campaign;
  attacker: Fleet;
  defender: Fleet;
  input: SpaceBattleInput;
  kind: VictoryKind;
  victorSide: "attacker" | "defender" | null;
}): CampaignBattleLogEntry {
  const { campaign, attacker, defender, input, kind, victorSide } = args;
  const atkName = getFactionById(campaign, attacker.factionId)?.name ?? "Attacker";
  const defName = getFactionById(campaign, defender.factionId)?.name ?? "Defender";
  const system = campaign.systems.find((s) => s.id === attacker.location.systemId);
  const orbitPlanetId =
    attacker.location.kind === "orbit" ? attacker.location.planetId : undefined;
  const planet = orbitPlanetId
    ? campaign.planets.find((p) => p.id === orbitPlanetId)
    : undefined;
  const locationLabel = planet
    ? `${planet.name} · ${system?.name ?? "Void"}`
    : system?.name ?? "Deep void";

  const victorFactionId =
    victorSide === "attacker"
      ? attacker.factionId
      : victorSide === "defender"
        ? defender.factionId
        : null;
  const victorLabel =
    kind === "draw"
      ? "Neither side claimed victory"
      : victorSide === "attacker"
        ? atkName
        : defName;

  const outcome =
    kind === "draw"
      ? `Draw — ${input.attackerVp}–${input.defenderVp} VP.`
      : `${VICTORY_KIND_LABELS[kind]} for ${victorLabel} (${Math.max(input.attackerVp, input.defenderVp)}–${Math.min(input.attackerVp, input.defenderVp)} VP).`;

  const wipeNote = [
    input.attackerFleetDestroyed ? `${atkName} fleet destroyed` : null,
    input.defenderFleetDestroyed ? `${defName} fleet destroyed` : null,
    input.attackerFlagshipDestroyed ? `${atkName} flagship destroyed` : null,
    input.defenderFlagshipDestroyed ? `${defName} flagship destroyed` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const summary = `${atkName} fleet (${fleetPower(attacker)} FP) engaged ${defName} fleet (${fleetPower(defender)} FP) at ${locationLabel}. Table ${input.attackerVp}–${input.defenderVp} VP.${wipeNote ? ` ${wipeNote}.` : ""}`;

  return {
    id: crypto.randomUUID(),
    date: formatBattleDate(),
    summary,
    outcome,
    theater: "space",
    systemId: attacker.location.systemId,
    planetId: orbitPlanetId,
    locationLabel,
    attackerFactionId: attacker.factionId,
    defenderFactionId: defender.factionId,
    attackerFleetId: attacker.id,
    defenderFleetId: defender.id,
    attackerVp: input.attackerVp,
    defenderVp: input.defenderVp,
    victoryKind: kind,
    victorFactionId,
  };
}

export type CrashLandingResult = {
  armyId: string;
  armyName: string;
  planetId: string;
  planetName: string;
  message: string;
};

function landablePlanets(campaign: Campaign, preferSystemId?: string): Planet[] {
  const eligible = (campaign.planets ?? []).filter((p) => {
    if (p.type === "warp_gate" || p.type === "asteroid_belt") return false;
    return normalizePlanetClassification(p.classification) !== "gas_giant";
  });
  if (preferSystemId) {
    const local = eligible.filter((p) => p.systemId === preferSystemId);
    if (local.length > 0) return local;
  }
  return eligible;
}

function pickCrashTile(planet: Planet): { tileIndex: number; dir: { x: number; y: number; z: number } } | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const candidates: number[] = [];
  for (let i = 0; i < sphere.tiles.length; i++) {
    const dir = sphere.tiles[i]!.center;
    const override = normalizeTerrainKind(planet.tileTerrain?.[String(i)]);
    const sample = sampleTerrainAtDirection(
      dir.x,
      dir.y,
      dir.z,
      planet.id,
      planet.classification,
      planet.type,
      override,
    );
    if (isSettlementForbiddenTerrain(sample.kind)) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) {
    for (let i = 0; i < sphere.tiles.length; i++) candidates.push(i);
  }
  if (candidates.length === 0) return null;
  const tileIndex = candidates[Math.floor(Math.random() * candidates.length)]!;
  const dir = sphere.tiles[tileIndex]!.center;
  return { tileIndex, dir: { x: dir.x, y: dir.y, z: dir.z } };
}

/**
 * Place crashed army on a random landable planet; apply 1–50% STR loss.
 */
export function crashLandArmy(
  campaign: Campaign,
  army: {
    id: string;
    name: string;
    factionId: string;
    symbolId?: string;
    strengthPercent?: number;
  },
  preferSystemId?: string,
): { campaign: Campaign; result: CrashLandingResult } | { error: string } {
  const planets = landablePlanets(campaign, preferSystemId);
  if (planets.length === 0) return { error: "No landable planet for crash" };
  const planet = planets[Math.floor(Math.random() * planets.length)]!;
  const tile = pickCrashTile(planet);
  if (!tile) return { error: "No crash tile" };

  const lostPct = 1 + Math.floor(Math.random() * 50);
  const nextStr = applyStrengthLoss(armyStrength(army), lostPct);
  const placed: Army = {
    id: army.id,
    name: army.name,
    factionId: army.factionId,
    symbolId: army.symbolId,
    dir: tile.dir,
    notes: `Crash-landed (lost ${lostPct}% strength)`,
    strengthPercent: nextStr,
  };

  const nextPlanets = campaign.planets.map((p) => {
    // Remove from any planet that still has this army id
    let armies = (p.armies ?? []).filter((a) => a.id !== army.id);
    if (p.id === planet.id) {
      armies = [...armies, placed];
    }
    return { ...p, armies };
  });

  const result: CrashLandingResult = {
    armyId: army.id,
    armyName: army.name,
    planetId: planet.id,
    planetName: planet.name,
    message: `${army.name} was sent hurtling toward ${planet.name}`,
  };

  return {
    campaign: { ...campaign, planets: nextPlanets },
    result,
  };
}

export function fleetsCanEngage(a: Fleet, b: Fleet): boolean {
  return canFleetsSpaceBattle(a, b) == null;
}

export function fleetHasFlagshipForBattle(fleet: Fleet): boolean {
  return hasFlagship(fleet);
}
