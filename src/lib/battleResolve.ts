import type {
  Army,
  BattleEntry,
  Campaign,
  VictoryKind,
} from "../types/campaign";
import {
  nearestTileIndex,
  type HexSphere,
  type Vec3,
} from "./hexSphere";

export type BattleResolveInput = {
  planetId: string;
  attackerArmyId: string;
  defenderArmyId: string;
  attackerVp: number;
  defenderVp: number;
  attackerCasualties: number;
  defenderCasualties: number;
  /** Percent of each attacking force detachment lost this battle (0–100). */
  attackerStrengthLostPct: number;
  /** Percent of each defending force detachment lost this battle (0–100). */
  defenderStrengthLostPct: number;
  /** Same-faction detachments adjacent to the attacker that join the fight. */
  attackerSupportArmyIds?: string[];
  /** Same-faction detachments adjacent to the defender that join the fight. */
  defenderSupportArmyIds?: string[];
};

export type BattleResolvePending = {
  planetId: string;
  attackerArmyId: string;
  defenderArmyId: string;
};

/** Clamp army strength to a usable 0–100 value. */
export function normalizeArmyStrength(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function armyStrength(army: Pick<Army, "strengthPercent">): number {
  return normalizeArmyStrength(army.strengthPercent);
}

/** True when a detachment has been wiped out. */
export function isArmyDestroyed(
  army: Pick<Army, "strengthPercent">,
): boolean {
  return armyStrength(army) <= 0;
}

/** Drop wiped detachments from a planet roster. */
export function pruneDestroyedArmies<T extends Pick<Army, "strengthPercent">>(
  armies: T[] | undefined,
): T[] {
  return (armies ?? []).filter((a) => !isArmyDestroyed(a));
}

/**
 * Apply a battle loss percentage to current strength.
 * Losing 30% of a 80-strength detachment → 56.
 * A result of 0 (or below) means the detachment is destroyed.
 */
export function applyStrengthLoss(
  currentPercent: number,
  lostPercent: number,
): number {
  const cur = normalizeArmyStrength(currentPercent);
  const lost = Math.max(0, Math.min(100, lostPercent));
  if (lost >= 100) return 0;
  return normalizeArmyStrength(cur * (1 - lost / 100));
}

/**
 * Base victory from VP margin and cost (no heroic/epochal rules).
 */
export function classifyVictory(args: {
  winnerVp: number;
  loserVp: number;
  winnerStrengthLostPct: number;
  winnerCasualties: number;
  loserCasualties: number;
}): VictoryKind {
  const {
    winnerVp,
    loserVp,
    winnerStrengthLostPct,
    winnerCasualties,
    loserCasualties,
  } = args;

  if (winnerVp === loserVp) return "draw";

  const total = winnerVp + loserVp;
  const margin = total > 0 ? (winnerVp - loserVp) / total : 1;

  const costly =
    winnerStrengthLostPct >= 40 ||
    (winnerCasualties > 0 &&
      winnerCasualties >= Math.max(1, loserCasualties) * 1.25);

  if (costly) return "pyrrhic";
  if (loserVp <= 0 && winnerVp > 0) return "decisive";
  if (margin >= 0.4) return "decisive";
  if (margin >= 0.2) return "major";
  return "minor";
}

/**
 * Full battle classification including Heroic / Epochal monuments.
 *
 * Heroic if either:
 *   (A) win with ≥3× enemy VP and equal-or-lower combined STR, or
 *   (B) win at all with combined STR ≤ 75.
 * Epochal when both (A) and (B) are true.
 */
export function classifyBattleVictory(args: {
  attackerVp: number;
  defenderVp: number;
  attackerCombinedStrength: number;
  defenderCombinedStrength: number;
  attackerStrengthLostPct: number;
  defenderStrengthLostPct: number;
  attackerCasualties: number;
  defenderCasualties: number;
}): {
  kind: VictoryKind;
  victorSide: "attacker" | "defender" | null;
} {
  const {
    attackerVp,
    defenderVp,
    attackerCombinedStrength,
    defenderCombinedStrength,
    attackerStrengthLostPct,
    defenderStrengthLostPct,
    attackerCasualties,
    defenderCasualties,
  } = args;

  if (attackerVp === defenderVp) {
    return { kind: "draw", victorSide: null };
  }

  const victorSide = attackerVp > defenderVp ? "attacker" : "defender";
  const winnerVp = victorSide === "attacker" ? attackerVp : defenderVp;
  const loserVp = victorSide === "attacker" ? defenderVp : attackerVp;
  const winnerStr =
    victorSide === "attacker"
      ? attackerCombinedStrength
      : defenderCombinedStrength;
  const loserStr =
    victorSide === "attacker"
      ? defenderCombinedStrength
      : attackerCombinedStrength;
  const winnerLost =
    victorSide === "attacker"
      ? attackerStrengthLostPct
      : defenderStrengthLostPct;
  const winnerCas =
    victorSide === "attacker" ? attackerCasualties : defenderCasualties;
  const loserCas =
    victorSide === "attacker" ? defenderCasualties : attackerCasualties;

  const condA = winnerVp >= loserVp * 3 && winnerStr <= loserStr;
  const condB = winnerStr <= 75;

  if (condA && condB) return { kind: "epochal", victorSide };
  if (condA || condB) return { kind: "heroic", victorSide };

  return {
    kind: classifyVictory({
      winnerVp,
      loserVp,
      winnerStrengthLostPct: winnerLost,
      winnerCasualties: winnerCas,
      loserCasualties: loserCas,
    }),
    victorSide,
  };
}

export const VICTORY_KIND_LABELS: Record<VictoryKind, string> = {
  decisive: "Decisive Victory",
  major: "Major Victory",
  minor: "Minor Victory",
  pyrrhic: "Pyrrhic Victory",
  draw: "Draw",
  heroic: "Heroic Victory",
  epochal: "Epochal Victory",
};

export function formatBattleDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function buildBattleRecord(args: {
  id: string;
  planetName: string;
  attackerName: string;
  defenderName: string;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerFactionName: string;
  defenderFactionName: string;
  attackerArmyId: string;
  defenderArmyId: string;
  attackerSupportNames?: string[];
  defenderSupportNames?: string[];
  attackerSupportArmyIds?: string[];
  defenderSupportArmyIds?: string[];
  attackerCombinedStrength: number;
  defenderCombinedStrength: number;
  attackerVp: number;
  defenderVp: number;
  attackerCasualties: number;
  defenderCasualties: number;
  attackerStrengthLostPct: number;
  defenderStrengthLostPct: number;
  victoryKind: VictoryKind;
  victorFactionId: string | null;
}): BattleEntry {
  const {
    victoryKind,
    victorFactionId,
    attackerFactionName,
    defenderFactionName,
    attackerName,
    defenderName,
    planetName,
    attackerVp,
    defenderVp,
    attackerCasualties,
    defenderCasualties,
  } = args;

  const victorLabel =
    victoryKind === "draw"
      ? "Neither side claimed victory"
      : victorFactionId === args.attackerFactionId
        ? attackerFactionName
        : defenderFactionName;

  const atkSupport =
    args.attackerSupportNames && args.attackerSupportNames.length > 0
      ? ` Supported by ${args.attackerSupportNames.join(", ")}.`
      : "";
  const defSupport =
    args.defenderSupportNames && args.defenderSupportNames.length > 0
      ? ` Supported by ${args.defenderSupportNames.join(", ")}.`
      : "";

  const summary = `${attackerName} (${attackerFactionName}, combined STR ${args.attackerCombinedStrength})${atkSupport} engaged ${defenderName} (${defenderFactionName}, combined STR ${args.defenderCombinedStrength})${defSupport} on ${planetName}. Table result ${attackerVp}–${defenderVp} VP. Casualties ${attackerCasualties} / ${defenderCasualties}.`;

  const outcome =
    victoryKind === "draw"
      ? `Draw — ${attackerVp}–${defenderVp} VP. Forces withdraw bloodied.`
      : `${VICTORY_KIND_LABELS[victoryKind]} for ${victorLabel} (${Math.max(attackerVp, defenderVp)}–${Math.min(attackerVp, defenderVp)} VP).`;

  return {
    id: args.id,
    date: formatBattleDate(),
    summary,
    outcome,
    attackerFactionId: args.attackerFactionId,
    defenderFactionId: args.defenderFactionId,
    attackerArmyId: args.attackerArmyId,
    defenderArmyId: args.defenderArmyId,
    attackerSupportArmyIds: args.attackerSupportArmyIds,
    defenderSupportArmyIds: args.defenderSupportArmyIds,
    attackerVp: args.attackerVp,
    defenderVp: args.defenderVp,
    attackerCasualties: args.attackerCasualties,
    defenderCasualties: args.defenderCasualties,
    attackerStrengthLostPct: args.attackerStrengthLostPct,
    defenderStrengthLostPct: args.defenderStrengthLostPct,
    victoryKind,
    victorFactionId,
  };
}

/** Sum recorded battle casualties for Galactic Overview KIA. */
export function totalBattleCasualties(campaign: Campaign): number {
  let n = 0;
  for (const p of campaign.planets ?? []) {
    for (const b of p.battles ?? []) {
      n += b.attackerCasualties ?? 0;
      n += b.defenderCasualties ?? 0;
    }
  }
  return n;
}

export function rivalArmiesOnPlanet(
  armies: Army[] | undefined,
  armyId: string,
): Army[] {
  const self = (armies ?? []).find((a) => a.id === armyId);
  if (!self) return [];
  return (armies ?? []).filter(
    (a) => a.id !== armyId && a.factionId !== self.factionId,
  );
}

function asVec3(dir: { x: number; y: number; z: number }): Vec3 {
  return { x: dir.x, y: dir.y, z: dir.z };
}

/** True if both detachments share a hex or sit on neighboring hexes. */
export function armiesAreAdjacent(
  a: Pick<Army, "dir">,
  b: Pick<Army, "dir">,
  sphere: HexSphere,
): boolean {
  const ta = nearestTileIndex(sphere, asVec3(a.dir));
  const tb = nearestTileIndex(sphere, asVec3(b.dir));
  if (ta === tb) return true;
  return sphere.neighbors[ta]?.includes(tb) ?? false;
}

/**
 * Hex tiles the attacker can fight on → rival army ids on that tile
 * (same hex or neighboring hexes that hold enemies).
 */
export function engageTargetsForArmy(
  armies: Army[] | undefined,
  attackerId: string,
  sphere: HexSphere,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const attacker = (armies ?? []).find((a) => a.id === attackerId);
  if (!attacker) return out;
  const atkTile = nearestTileIndex(sphere, asVec3(attacker.dir));
  const fightTiles = new Set<number>([atkTile, ...(sphere.neighbors[atkTile] ?? [])]);

  for (const army of armies ?? []) {
    if (army.id === attackerId) continue;
    if (army.factionId === attacker.factionId) continue;
    const tile = nearestTileIndex(sphere, asVec3(army.dir));
    if (!fightTiles.has(tile)) continue;
    const list = out.get(tile) ?? [];
    list.push(army.id);
    out.set(tile, list);
  }
  return out;
}

/**
 * Same-faction detachments adjacent to a primary that can join as supports.
 * Excludes the primary, the opposing primary, and optionally armies that already acted.
 */
export function eligibleSupportArmies(
  armies: Army[] | undefined,
  primary: Army,
  opposingPrimaryId: string,
  sphere: HexSphere,
  alreadyActedIds?: ReadonlySet<string> | string[],
): Army[] {
  const acted = alreadyActedIds
    ? alreadyActedIds instanceof Set
      ? alreadyActedIds
      : new Set(alreadyActedIds)
    : null;
  return (armies ?? []).filter((a) => {
    if (a.id === primary.id || a.id === opposingPrimaryId) return false;
    if (a.factionId !== primary.factionId) return false;
    if (acted?.has(a.id)) return false;
    return armiesAreAdjacent(primary, a, sphere);
  });
}

/** Sum of strength percents for a primary + selected supports (may exceed 100). */
export function combinedForceStrength(
  primary: Pick<Army, "strengthPercent">,
  supports: Pick<Army, "strengthPercent">[],
): number {
  return (
    armyStrength(primary) +
    supports.reduce((n, a) => n + armyStrength(a), 0)
  );
}

/** Midpoint on the sphere between two detachments (famous-battle monument). */
export function battleMonumentDir(
  a: Pick<Army, "dir">,
  b: Pick<Army, "dir">,
): { x: number; y: number; z: number } {
  const x = a.dir.x + b.dir.x;
  const y = a.dir.y + b.dir.y;
  const z = a.dir.z + b.dir.z;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

export function commanderLabel(
  faction: { name: string; leader?: string } | undefined,
  armyName: string,
): string {
  const leader = faction?.leader?.trim();
  if (leader) return leader;
  if (armyName.trim()) return armyName.trim();
  return faction?.name ?? "Unknown commander";
}
