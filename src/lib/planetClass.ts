import type { Planet, PlanetClassification } from "../types/campaign";
import { PLANET_CLASSIFICATION_ORDER } from "../types/campaign";

export function isPlanetClassification(
  value: unknown,
): value is PlanetClassification {
  return (
    typeof value === "string" &&
    (PLANET_CLASSIFICATION_ORDER as string[]).includes(value)
  );
}

export function normalizePlanetClassification(
  value: unknown,
): PlanetClassification {
  return isPlanetClassification(value) ? value : "earthlike";
}

/**
 * Worlds that support the strategic hex surface map.
 * Gas giants have no land surface; asteroid belts use a separate view.
 */
export function supportsStrategicSurface(
  planet: Pick<Planet, "type" | "classification">,
): boolean {
  if (planet.type === "asteroid_belt") return false;
  if (normalizePlanetClassification(planet.classification) === "gas_giant") {
    return false;
  }
  return true;
}

/** Surface body color for map / planet portrait (by climate class). */
export function classificationColor(
  classification: PlanetClassification | undefined,
): string {
  switch (normalizePlanetClassification(classification)) {
    case "ice":
      return "#b8d4e8";
    case "tundra":
      return "#8aa0a8";
    case "water":
      return "#2a6fad";
    case "islands":
      return "#3a9a7a";
    case "jungle":
      return "#2d6b3a";
    case "earthlike":
      return "#3d7a4a";
    case "super_earth":
      return "#4a8f5c";
    case "desert":
      return "#c4a060";
    case "arid":
      return "#b08050";
    case "savannah":
      return "#a09040";
    case "swamp":
      return "#4a5a38";
    case "volcanic":
      return "#8a4030";
    case "magma":
      return "#c04020";
    case "toxic":
      return "#6a7a68";
    case "barren":
      return "#7a746c";
    case "gas_giant":
      return "#c8a060";
    case "tidally_locked":
      return "#8a7068";
  }
}

/** Weighted random climate for procedural generation. */
export function pickRandomClassification(
  rng: () => number = Math.random,
): PlanetClassification {
  const weights: Record<PlanetClassification, number> = {
    ice: 8,
    tundra: 6,
    water: 8,
    islands: 7,
    jungle: 8,
    earthlike: 12,
    super_earth: 5,
    desert: 9,
    arid: 7,
    savannah: 6,
    swamp: 5,
    volcanic: 6,
    magma: 3,
    toxic: 4,
    barren: 10,
    gas_giant: 4,
    tidally_locked: 4,
  };
  let total = 0;
  for (const c of PLANET_CLASSIFICATION_ORDER) total += weights[c];
  let roll = rng() * total;
  for (const c of PLANET_CLASSIFICATION_ORDER) {
    roll -= weights[c];
    if (roll <= 0) return c;
  }
  return "earthlike";
}
