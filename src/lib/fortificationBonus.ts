import type { Army, District, Planet, PlanetStructure } from "../types/campaign";
import { armyStrength, combinedForceStrength } from "./battleResolve";
import { armyTileIndex } from "./armyActions";
import { isDistrictActivated } from "./activation";
import { buildHexSphere } from "./hexSphere";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";
import { tilesAreHexAdjacent } from "./supplyNetwork";

/** Neutral trench: +1% STR per trench hex in the cluster you stand on (max 3%). */
export const TRENCH_STR_BONUS_PCT = 1;
/** Cap on stacked trench bonuses while standing on a trench line. */
export const TRENCH_STR_BONUS_MAX_PCT = 3;
/** Bastion district: +10% STR when standing on that hex (controlling faction, activated). */
export const BASTION_STR_BONUS_PCT = 10;
/** Outpost structure: +1% STR when on or adjacent (controlling faction). */
export const OUTPOST_STR_BONUS_PCT = 1;

function tileOnOrAdjacent(armyTile: number, featureTile: number): boolean {
  if (armyTile === featureTile) return true;
  return tilesAreHexAdjacent(armyTile, featureTile);
}

/**
 * Trench bonus: unit must stand on a trench hex. +1% for that hex, plus +1%
 * for each adjacent trench-line structure, capped at {@link TRENCH_STR_BONUS_MAX_PCT}.
 */
function trenchBonusPercent(planet: Planet, armyTile: number): number {
  const trenches = (planet.structures ?? []).filter(
    (st) => st.kind === "trench_line",
  );
  const onTrench = trenches.find((st) => st.tileIndex === armyTile);
  if (!onTrench) return 0;

  let stacks = 1; // the trench you occupy
  for (const st of trenches) {
    if (st.id === onTrench.id) continue;
    if (tilesAreHexAdjacent(armyTile, st.tileIndex)) stacks += 1;
  }
  return Math.min(
    TRENCH_STR_BONUS_MAX_PCT,
    stacks * TRENCH_STR_BONUS_PCT,
  );
}

/**
 * Percent STR bonus from fortifications.
 * - Bastion: on-hex only, +10% (activated, owning faction)
 * - Trench: on-hex only, stacks with adjacent trenches up to +3%
 * - Outpost: on or adjacent, +1% (owning faction)
 */
export function fortificationStrBonusPercent(
  planet: Planet,
  army: Pick<Army, "dir" | "factionId">,
): number {
  if (planet.type === "warp_gate") {
    // Station tiles use a different grid; skip sphere fortifications for now.
    return 0;
  }
  // Ensure sphere exists for neighbor tables used by tilesAreHexAdjacent.
  buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const tile = armyTileIndex(planet, army);
  let bonus = trenchBonusPercent(planet, tile);

  for (const st of planet.structures ?? []) {
    if (st.kind !== "outpost") continue;
    if (st.controllingFactionId !== army.factionId) continue;
    if (tileOnOrAdjacent(tile, st.tileIndex)) {
      bonus += OUTPOST_STR_BONUS_PCT;
    }
  }

  const visitBastion = (d: District) => {
    if (d.kind !== "bastion") return;
    if (d.tileIndex !== tile) return;
    if (!isDistrictActivated(planet, d.id)) return;
    if (d.controllingFactionId === army.factionId) {
      bonus += BASTION_STR_BONUS_PCT;
    }
  };

  for (const city of planet.cities ?? []) {
    for (const d of city.districts) visitBastion(d);
  }
  for (const d of planet.independentDistricts ?? []) visitBastion(d);

  return bonus;
}

/** Base STR × (1 + fortification%). */
export function armyStrengthWithFortifications(
  planet: Planet,
  army: Pick<Army, "dir" | "factionId" | "strengthPercent">,
): number {
  const base = armyStrength(army);
  const pct = fortificationStrBonusPercent(planet, army);
  if (pct <= 0) return base;
  return Math.round(base * (1 + pct / 100));
}

export function combinedForceStrengthWithFortifications(
  planet: Planet,
  primary: Army,
  supports: Army[],
): number {
  return (
    armyStrengthWithFortifications(planet, primary) +
    supports.reduce(
      (n, a) => n + armyStrengthWithFortifications(planet, a),
      0,
    )
  );
}

/** Unmodified combined STR (kept for call sites that don't pass a planet). */
export { combinedForceStrength };

export function describeFortificationBonus(
  planet: Planet,
  army: Pick<Army, "dir" | "factionId">,
): string | null {
  const pct = fortificationStrBonusPercent(planet, army);
  if (pct <= 0) return null;
  return `+${pct}% fortification`;
}

/** True when a structure kind grants trench-style (any faction) bonus. */
export function isNeutralFortification(
  kind: PlanetStructure["kind"] | District["kind"],
): boolean {
  return kind === "trench_line";
}
