import {
  TERRAIN_KIND_ORDER,
  type TerrainKind,
} from "./planetTerrain";
import { buildHexSphere } from "./hexSphere";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";

/** Tile count on the strategic hex sphere (stable). */
export function strategicTileCount(): number {
  return buildHexSphere(SETTLEMENT_HEX_FREQUENCY).tiles.length;
}

/** Even split of 100% across all terrain kinds. */
export function equalTerrainPercents(): Record<TerrainKind, number> {
  const n = TERRAIN_KIND_ORDER.length;
  const base = Math.floor(100 / n);
  const out = {} as Record<TerrainKind, number>;
  let rem = 100;
  for (let i = 0; i < n; i++) {
    const kind = TERRAIN_KIND_ORDER[i]!;
    const v = i === n - 1 ? rem : base;
    out[kind] = v;
    rem -= v;
  }
  return out;
}

export function sumTerrainPercents(
  weights: Partial<Record<TerrainKind, number>>,
): number {
  let total = 0;
  for (const kind of TERRAIN_KIND_ORDER) {
    total += Math.max(0, Number(weights[kind]) || 0);
  }
  return total;
}

/**
 * Assign every tile a terrain kind according to percentage weights.
 * Percentages are normalized; zero-weight kinds are skipped.
 */
export function generateTileTerrainByPercents(
  weights: Partial<Record<TerrainKind, number>>,
  tileCount = strategicTileCount(),
  rng: () => number = Math.random,
): Record<string, string> {
  const entries = TERRAIN_KIND_ORDER.map((kind) => ({
    kind,
    weight: Math.max(0, Number(weights[kind]) || 0),
  })).filter((e) => e.weight > 0);

  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0 || tileCount <= 0) return {};

  const kinds: TerrainKind[] = [];
  let assigned = 0;
  for (let i = 0; i < entries.length; i++) {
    const { kind, weight } = entries[i]!;
    const n =
      i === entries.length - 1
        ? tileCount - assigned
        : Math.max(0, Math.round((weight / total) * tileCount));
    const count = Math.min(tileCount - assigned, n);
    for (let k = 0; k < count; k++) kinds.push(kind);
    assigned += count;
  }
  while (kinds.length < tileCount) {
    kinds.push(entries[entries.length - 1]!.kind);
  }
  if (kinds.length > tileCount) kinds.length = tileCount;

  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = kinds[i]!;
    kinds[i] = kinds[j]!;
    kinds[j] = tmp;
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < tileCount; i++) {
    out[String(i)] = kinds[i]!;
  }
  return out;
}

/** Paint every tile with a single kind. */
export function fillAllTileTerrain(
  kind: TerrainKind,
  tileCount = strategicTileCount(),
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < tileCount; i++) out[String(i)] = kind;
  return out;
}
