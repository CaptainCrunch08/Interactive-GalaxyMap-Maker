import type {
  Planet,
  PlanetClassification,
  PlanetType,
} from "../types/campaign";
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

type WorldRole = Exclude<PlanetType, "asteroid_belt" | "warp_gate">;

function pickWeighted<T extends string>(
  rng: () => number,
  weights: Partial<Record<T, number>>,
  fallback: T,
): T {
  const entries = Object.entries(weights).filter(
    ([, w]) => typeof w === "number" && w > 0,
  ) as [T, number][];
  if (entries.length === 0) return fallback;
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}

/**
 * Role / world type that fits a climate classification (40k-flavored).
 * Magma & volcanic lean death; jungle/swamp often death; hospitable worlds
 * favor agri / feudal / hive / etc.
 */
export function pickPlanetTypeForClassification(
  classification: PlanetClassification,
  rng: () => number = Math.random,
): WorldRole {
  const c = normalizePlanetClassification(classification);
  const weights: Partial<Record<WorldRole, number>> = (() => {
    switch (c) {
      case "magma":
        return {
          death: 66,
          forge: 12,
          mining: 10,
          abandoned_colony: 8,
          fortress: 8,
          custom: 6,
        };
      case "volcanic":
        return {
          death: 38,
          forge: 18,
          mining: 14,
          abandoned_colony: 10,
          fortress: 10,
          custom: 8,
          feudal: 4,
        };
      case "toxic":
        return {
          death: 44,
          abandoned_colony: 16,
          forge: 14,
          mining: 12,
          custom: 10,
          fortress: 6,
          hive: 4,
        };
      case "jungle":
        return {
          death: 30,
          feudal: 14,
          archaeological: 12,
          abandoned_colony: 10,
          agri: 10,
          custom: 10,
          homeworld: 8,
          trade: 6,
          shrine: 6,
          hive: 4,
        };
      case "swamp":
        return {
          death: 26,
          feudal: 16,
          archaeological: 12,
          abandoned_colony: 10,
          agri: 12,
          custom: 12,
          shrine: 8,
          trade: 6,
          hive: 4,
          fortress: 4,
        };
      case "ice":
        return {
          death: 22,
          fortress: 14,
          feudal: 12,
          archaeological: 12,
          abandoned_colony: 12,
          custom: 12,
          shrine: 10,
          forge: 6,
          hive: 4,
        };
      case "tundra":
        return {
          feudal: 18,
          agri: 14,
          archaeological: 12,
          abandoned_colony: 10,
          death: 12,
          fortress: 12,
          homeworld: 10,
          trade: 6,
          custom: 8,
          shrine: 6,
          hive: 4,
        };
      case "desert":
      case "arid":
        return {
          death: 14,
          mining: 14,
          archaeological: 12,
          abandoned_colony: 14,
          feudal: 12,
          fortress: 10,
          agri: 8,
          shrine: 8,
          hive: 6,
          custom: 6,
          forge: 4,
        };
      case "barren":
        return {
          mining: 20,
          abandoned_colony: 18,
          archaeological: 14,
          death: 14,
          fortress: 12,
          forge: 10,
          custom: 8,
          hive: 4,
          shrine: 4,
        };
      case "savannah":
        return {
          agri: 28,
          feudal: 22,
          homeworld: 12,
          trade: 12,
          custom: 14,
          shrine: 8,
          fortress: 6,
          death: 6,
          hive: 4,
        };
      case "islands":
        return {
          agri: 20,
          feudal: 18,
          trade: 16,
          shrine: 14,
          custom: 16,
          homeworld: 10,
          hive: 10,
          fortress: 6,
          death: 6,
        };
      case "water":
        return {
          custom: 28,
          trade: 18,
          agri: 16,
          shrine: 14,
          feudal: 12,
          homeworld: 10,
          hive: 8,
          fortress: 6,
          death: 6,
        };
      case "gas_giant":
        return { custom: 100 };
      case "tidally_locked":
        return {
          death: 20,
          mining: 14,
          abandoned_colony: 14,
          fortress: 14,
          forge: 12,
          custom: 12,
          hive: 8,
          shrine: 6,
          feudal: 4,
        };
      case "super_earth":
        return {
          hive: 22,
          homeworld: 16,
          trade: 14,
          fortress: 14,
          forge: 12,
          agri: 10,
          feudal: 10,
          shrine: 8,
          custom: 8,
        };
      case "earthlike":
      default:
        return {
          agri: 14,
          feudal: 12,
          hive: 12,
          trade: 12,
          homeworld: 10,
          shrine: 10,
          fortress: 10,
          forge: 10,
          archaeological: 6,
          abandoned_colony: 6,
          mining: 6,
          custom: 6,
          death: 4,
        };
    }
  })();

  return pickWeighted(rng, weights, "custom");
}
