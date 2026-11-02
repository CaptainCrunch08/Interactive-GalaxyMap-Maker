import type {
  Planet,
  PlanetClassification,
  PlanetType,
  StarSystem,
} from "../types/campaign";
import {
  pickPlanetTypeForClassification,
  pickRandomClassification,
} from "./planetClass";
import { defaultPlanetName } from "./planetNames";
import { pickPlanetVisualModel } from "./planetModels";
import {
  generatePlanetSurface,
  planetOwnerFromCities,
  settlementTileSet,
} from "./settlements";
import {
  generateWorldTileTerrain,
} from "./terrainGenerate";

/** Share of worlds that follow the inner/habitable/outer climate trend. */
const ORBIT_CLIMATE_TREND_RATE = 0.65;

/** Occasional asteroid belt among generated bodies (not usually the innermost). */
const ASTEROID_BELT_CHANCE = 0.08;

type OrbitBand = "inner" | "habitable" | "outer";

function pickWeighted(
  rng: () => number,
  weights: Partial<Record<string, number>>,
): string {
  const entries = Object.entries(weights).filter(
    ([, w]) => typeof w === "number" && w > 0,
  ) as [string, number][];
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
 * Majority 2–3; some 1 or 4; few 5; under 1% with 6–8.
 */
export function pickSystemPlanetCount(rng: () => number = Math.random): number {
  const roll = rng();
  if (roll < 0.12) return 1;
  if (roll < 0.47) return 2;
  if (roll < 0.82) return 3;
  if (roll < 0.94) return 4;
  if (roll < 0.99) return 5;
  if (roll < 0.995) return 6;
  if (roll < 0.998) return 7;
  return 8;
}

function orbitBand(orbitIndex: number, planetCount: number): OrbitBand {
  if (planetCount <= 1) return "habitable";
  if (planetCount === 2) {
    return orbitIndex === 0 ? "inner" : "outer";
  }
  const t = orbitIndex / (planetCount - 1);
  if (t < 0.34) return "inner";
  if (t < 0.67) return "habitable";
  return "outer";
}

const BAND_WEIGHTS: Record<
  OrbitBand,
  Partial<Record<PlanetClassification, number>>
> = {
  // Hot / scorched — close to the star
  inner: {
    magma: 16,
    volcanic: 20,
    desert: 16,
    arid: 14,
    tidally_locked: 10,
    barren: 10,
    toxic: 8,
    savannah: 4,
    earthlike: 2,
  },
  // Temperate / life-bearing band
  habitable: {
    earthlike: 20,
    jungle: 12,
    savannah: 11,
    islands: 11,
    swamp: 8,
    water: 8,
    super_earth: 8,
    arid: 6,
    desert: 5,
    tundra: 4,
    tidally_locked: 3,
    volcanic: 2,
    ice: 2,
  },
  // Cold / distant
  outer: {
    ice: 24,
    tundra: 18,
    gas_giant: 14,
    barren: 12,
    water: 10,
    toxic: 6,
    swamp: 5,
    tidally_locked: 4,
    desert: 3,
    earthlike: 2,
    volcanic: 2,
  },
};

/**
 * Climate for an orbit. ~65% of the time prefers the band for that distance;
 * otherwise a free roll (exceptions / oddities).
 */
export function pickClassificationForOrbit(
  orbitIndex: number,
  planetCount: number,
  rng: () => number = Math.random,
): PlanetClassification {
  if (rng() >= ORBIT_CLIMATE_TREND_RATE) {
    return pickRandomClassification(rng);
  }
  const band = orbitBand(orbitIndex, planetCount);
  return pickWeighted(rng, BAND_WEIGHTS[band]) as PlanetClassification;
}

/**
 * Build a full set of planets for a newly placed star (edit-mode generation).
 */
export function generatePlanetsForNewSystem(
  system: Pick<StarSystem, "id" | "name" | "controllingFactionId">,
  rng: () => number = Math.random,
): Planet[] {
  const count = pickSystemPlanetCount(rng);
  const planets: Planet[] = [];

  for (let orbitIndex = 0; orbitIndex < count; orbitIndex++) {
    const allowBelt = orbitIndex > 0 || count === 1;
    const isBelt = allowBelt && rng() < ASTEROID_BELT_CHANCE;
    const classification: PlanetClassification = isBelt
      ? "barren"
      : pickClassificationForOrbit(orbitIndex, count, rng);
    const type: PlanetType = isBelt
      ? "asteroid_belt"
      : pickPlanetTypeForClassification(classification, rng);

    const planetId = crypto.randomUUID();
    const { cities, structures, independentDistricts } = generatePlanetSurface(
      planetId,
      type,
      {
        defaultFactionId: system.controllingFactionId,
        classification,
      },
    );
    const reservedTiles = [
      ...settlementTileSet(cities, structures, independentDistricts),
    ];
    const tileTerrain = generateWorldTileTerrain(classification, type, {
      planetId,
      rng,
      settlement: {
        reservedTiles,
        cityHubTiles: cities.map((c) => c.tileIndex),
      },
    });

    const planet: Planet = {
      id: planetId,
      systemId: system.id,
      name: defaultPlanetName(system.name, type, planets),
      orbitIndex,
      type,
      classification,
      visualModelId:
        type === "asteroid_belt"
          ? undefined
          : pickPlanetVisualModel(classification, rng),
      controllingFactionId:
        planetOwnerFromCities(
          cities,
          undefined,
          structures,
          independentDistricts,
        ) ?? system.controllingFactionId,
      notes: "",
      battles: [],
      cities,
      independentDistricts,
      structures,
      surfaceReady: true,
      tileTerrain,
      armies: [],
    };
    planets.push(planet);
  }

  return planets;
}
