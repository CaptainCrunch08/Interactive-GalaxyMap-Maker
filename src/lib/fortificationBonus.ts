import type { Army, District, Planet, PlanetStructure } from "../types/campaign";
import { armyStrength, combinedForceStrength } from "./battleResolve";
import { armyTileIndex } from "./armyActions";
import { isDistrictActivated } from "./activation";
import { buildHexSphere } from "./hexSphere";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";
import { tilesAreHexAdjacent } from "./supplyNetwork";

/** Neutral trench: +1% STR when on/adjacent, any faction. */
export const TRENCH_STR_BONUS_PCT = 1;
/** Bastion district: +2% STR when on/adjacent, controlling faction only. */
export const BASTION_STR_BONUS_PCT = 2;
/** Outpost (district or structure): +1% STR when on/adjacent, controlling faction only. */
export const OUTPOST_STR_BONUS_PCT = 1;

function tileOnOrAdjacent(armyTile: number, featureTile: number): boolean {
  if (armyTile === featureTile) return true;
  return tilesAreHexAdjacent(armyTile, featureTile);
}

/**
 * Percent STR bonus from fortifications near this army.
 * Bonuses stack additively (e.g. trench + bastion = 3%).
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
  let bonus = 0;

  for (const st of planet.structures ?? []) {
    if (!tileOnOrAdjacent(tile, st.tileIndex)) continue;
    if (st.kind === "trench_line") {
      bonus += TRENCH_STR_BONUS_PCT;
    } else if (
      st.kind === "outpost" &&
      st.controllingFactionId === army.factionId
    ) {
      bonus += OUTPOST_STR_BONUS_PCT;
    }
  }

  const visitDistrict = (d: District) => {
    if (!tileOnOrAdjacent(tile, d.tileIndex)) return;
    // Bastion / outpost bonuses require activation
    if (d.kind === "bastion" || d.kind === "outpost") {
      if (!isDistrictActivated(planet, d.id)) return;
    }
    if (d.kind === "bastion" && d.controllingFactionId === army.factionId) {
      bonus += BASTION_STR_BONUS_PCT;
    } else if (
      d.kind === "outpost" &&
      d.controllingFactionId === army.factionId
    ) {
      bonus += OUTPOST_STR_BONUS_PCT;
    }
  };

  for (const city of planet.cities ?? []) {
    for (const d of city.districts) visitDistrict(d);
  }
  for (const d of planet.independentDistricts ?? []) visitDistrict(d);

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
