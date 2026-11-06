import type { Planet, SphereDir } from "../types/campaign";
import { structureOwnedBy } from "./buildingPoints";
import {
  buildHexSphere,
  hexTileDistance,
  nearestTileIndex,
  type HexSphere,
} from "./hexSphere";
import {
  normalizeTerrainKind,
  sampleTerrainAtDirection,
} from "./planetTerrain";
import { isSettlementForbiddenTerrain } from "./terrainGenerate";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";

/** Max hex distance from the aimed tile when not landing on a Space Port. */
export const LANDING_SCATTER_RANGE = 4;

function planetSphere(): HexSphere {
  return buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
}

/** Controlled docks district or owned space_port structure tile. */
export function isControlledSpacePortTile(
  planet: Planet,
  tileIndex: number,
  factionId: string,
): boolean {
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (
        d.kind === "docks" &&
        d.controllingFactionId === factionId &&
        d.tileIndex === tileIndex
      ) {
        return true;
      }
    }
  }
  for (const d of planet.independentDistricts ?? []) {
    if (
      d.kind === "docks" &&
      d.controllingFactionId === factionId &&
      d.tileIndex === tileIndex
    ) {
      return true;
    }
  }
  return (planet.structures ?? []).some(
    (s) =>
      s.kind === "space_port" &&
      structureOwnedBy(s, factionId) &&
      s.tileIndex === tileIndex,
  );
}

function isLandableTile(planet: Planet, sphere: HexSphere, tileIndex: number): boolean {
  const dir = sphere.tiles[tileIndex]?.center;
  if (!dir) return false;
  const override = normalizeTerrainKind(planet.tileTerrain?.[String(tileIndex)]);
  const sample = sampleTerrainAtDirection(
    dir.x,
    dir.y,
    dir.z,
    planet.id,
    planet.classification,
    planet.type,
    override,
  );
  return !isSettlementForbiddenTerrain(sample.kind);
}

/**
 * Resolve where a detachment lands after the player aims at a hex.
 * Controlled Space Port → exact tile. Otherwise → random land tile within
 * LANDING_SCATTER_RANGE hexes of the aim (including the aim tile if landable).
 */
export function resolveLandingTile(
  planet: Planet,
  aimTileIndex: number,
  factionId: string,
): { tileIndex: number; exactPort: boolean } {
  if (isControlledSpacePortTile(planet, aimTileIndex, factionId)) {
    return { tileIndex: aimTileIndex, exactPort: true };
  }

  const sphere = planetSphere();
  const n = sphere.tiles.length;
  const aim = Math.max(0, Math.min(n - 1, Math.floor(aimTileIndex)));
  const candidates: number[] = [];
  for (let i = 0; i < n; i++) {
    const dist = hexTileDistance(sphere, aim, i);
    if (!Number.isFinite(dist) || dist > LANDING_SCATTER_RANGE) continue;
    if (!isLandableTile(planet, sphere, i)) continue;
    candidates.push(i);
  }

  if (candidates.length === 0) {
    // Fall back to aim even if ocean/lava — better than failing silently.
    return { tileIndex: aim, exactPort: false };
  }
  const tileIndex =
    candidates[Math.floor(Math.random() * candidates.length)]!;
  return { tileIndex, exactPort: false };
}

export function dirForTileIndex(tileIndex: number): SphereDir {
  const sphere = planetSphere();
  const c = sphere.tiles[tileIndex]?.center ?? { x: 0, y: 1, z: 0 };
  return { x: c.x, y: c.y, z: c.z };
}

export function tileIndexFromDir(dir: SphereDir): number {
  return nearestTileIndex(planetSphere(), dir);
}
