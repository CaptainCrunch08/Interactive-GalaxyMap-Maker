import type { PlanetClassification } from "../types/campaign";
import { PLANET_CLASSIFICATION_ORDER } from "../types/campaign";
import { normalizePlanetClassification } from "./planetClass";

/** Stable visual preset id, e.g. `earthlike_2`. */
export type PlanetVisualModelId = string;

export type PlanetVisualModel = {
  id: PlanetVisualModelId;
  classification: PlanetClassification;
  /** Display name for debugging / future UI. */
  label: string;
  /** Variant index within its classification (0-based). */
  variant: number;
};

const VARIANT_LABELS = ["Alpha", "Beta", "Gamma", "Delta"] as const;

/** How many distinct procedural looks per climate class. */
export const MODELS_PER_CLASSIFICATION = 4;

function modelId(
  classification: PlanetClassification,
  variant: number,
): PlanetVisualModelId {
  return `${classification}_${variant}`;
}

/** Full catalog: several models per classification. */
export const PLANET_VISUAL_MODELS: PlanetVisualModel[] =
  PLANET_CLASSIFICATION_ORDER.flatMap((classification) =>
    Array.from({ length: MODELS_PER_CLASSIFICATION }, (_, variant) => ({
      id: modelId(classification, variant),
      classification,
      label: `${classification} ${VARIANT_LABELS[variant] ?? variant}`,
      variant,
    })),
  );

const BY_ID = new Map(PLANET_VISUAL_MODELS.map((m) => [m.id, m]));

export function getPlanetVisualModel(
  id: string | undefined,
): PlanetVisualModel | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function modelsForClassification(
  classification: PlanetClassification,
): PlanetVisualModel[] {
  const cls = normalizePlanetClassification(classification);
  return PLANET_VISUAL_MODELS.filter((m) => m.classification === cls);
}

/** Seeded RNG (mulberry32). */
export function rngFromSeed(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a random model of the given climate class. */
export function pickPlanetVisualModel(
  classification: PlanetClassification,
  rng: () => number = Math.random,
): PlanetVisualModelId {
  const list = modelsForClassification(classification);
  if (list.length === 0) return modelId("earthlike", 0);
  return list[Math.floor(rng() * list.length)]!.id;
}

/**
 * Resolve a planet's portrait model. Invalid / missing ids get a
 * deterministic pick from classification + fallbackSeed (usually planet id).
 */
export function resolvePlanetVisualModelId(
  classification: PlanetClassification | undefined,
  visualModelId: string | undefined,
  fallbackSeed: string,
): PlanetVisualModelId {
  const cls = normalizePlanetClassification(classification);
  const existing = getPlanetVisualModel(visualModelId);
  if (existing && existing.classification === cls) return existing.id;
  return pickPlanetVisualModel(cls, rngFromSeed(`${fallbackSeed}:${cls}`));
}
