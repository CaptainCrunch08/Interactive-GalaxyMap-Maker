import type { Planet } from "../types/campaign";
import { buildHexSphere } from "./hexSphere";
import {
  isManufactorumTerrain,
  isSettlementForbiddenTerrain,
  normalizeTerrainKind,
  sampleTerrainAtDirection,
  TERRAIN_KIND_LABELS,
  type TerrainKind,
} from "./planetTerrain";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";

/**
 * Effective terrain under a tile (painted override or procedural).
 */
export function terrainKindAtPlanetTile(
  planet: Planet,
  tileIndex: number,
): TerrainKind | null {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const tile = sphere.tiles[tileIndex];
  if (!tile) return null;
  const override = normalizeTerrainKind(
    planet.tileTerrain?.[String(tileIndex)],
  );
  return sampleTerrainAtDirection(
    tile.center.x,
    tile.center.y,
    tile.center.z,
    planet.id,
    planet.classification,
    planet.type,
    override,
  ).kind;
}

/**
 * Why Play-mode cannot build a manufactorum on this hex, or null if allowed.
 * Forge worlds are fully industrial — any hex is legal for construction.
 * Existing manufactorums operate regardless of terrain.
 */
export function manufactorumTerrainBlockReason(
  planet: Planet,
  tileIndex: number,
): string | null {
  if (planet.type === "forge") return null;
  const terrain = terrainKindAtPlanetTile(planet, tileIndex);
  if (isManufactorumTerrain(terrain)) return null;
  const label = terrain ? TERRAIN_KIND_LABELS[terrain] : "unknown terrain";
  return `Manufactorums can only be built on barren/wasteland, crater, agri, iron rich, urban, or chem spill (not ${label})`;
}

/**
 * True when a manufactorum can produce. Ocean/lava hexes never operate;
 * other biomes are fine once the district exists.
 */
export function isManufactorumOperational(
  planet: Planet,
  district: { kind: string; tileIndex: number },
): boolean {
  if (district.kind !== "manufactorum") return false;
  return settlementTerrainBlockReason(planet, district.tileIndex) == null;
}

/**
 * Why a city / district / structure cannot sit or activate on this hex.
 * Water (ocean) and lava hexes are illegal.
 */
export function settlementTerrainBlockReason(
  planet: Planet,
  tileIndex: number,
  label = "Settlements",
): string | null {
  const terrain = terrainKindAtPlanetTile(planet, tileIndex);
  if (!isSettlementForbiddenTerrain(terrain)) return null;
  const terrainLabel =
    terrain ? TERRAIN_KIND_LABELS[terrain] : "forbidden terrain";
  return `${label} cannot be on ${terrainLabel}`;
}

/** @deprecated Use {@link settlementTerrainBlockReason}. */
export function cityHubTerrainBlockReason(
  planet: Planet,
  tileIndex: number,
): string | null {
  return settlementTerrainBlockReason(planet, tileIndex, "Cities");
}
