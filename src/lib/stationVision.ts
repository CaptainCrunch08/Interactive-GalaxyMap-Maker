import type { Army, Planet } from "../types/campaign";
import {
  nearestStationTile,
  stationAdjacentTiles,
} from "./stationHex";
import type { StationMaze } from "./stationMaze";
import { warpGateController } from "./warpGates";

/**
 * Tiles the viewer can see on a warp-gate station.
 * - Outside campaign play: full maze.
 * - Crown-controlling faction: full maze.
 * - Otherwise: entrance / boarding-lock tiles are always visible, and each of
 *   that faction's detachments reveals its tile + ortho neighbors.
 * Returns `null` when the whole maze is visible.
 */
export function stationVisibleWalkableTiles(args: {
  maze: StationMaze;
  planet: Planet;
  /** Campaign play is running. */
  playActive: boolean;
  /** Active / viewing faction in play mode. */
  viewerFactionId?: string | null;
  armies?: Army[];
}): Set<number> | null {
  const { maze, planet, playActive, viewerFactionId } = args;
  if (!playActive) return null;

  const controller = warpGateController(planet);
  if (
    viewerFactionId &&
    controller &&
    controller === viewerFactionId
  ) {
    return null;
  }

  const visible = new Set<number>();
  // Boarding locks are always known — detachments land here from escorts.
  for (const dock of maze.dockTiles) {
    if (maze.walkable.has(dock)) visible.add(dock);
  }

  if (!viewerFactionId) {
    return visible;
  }

  const armies = args.armies ?? planet.armies ?? [];
  for (const army of armies) {
    if (army.factionId !== viewerFactionId) continue;
    const tile = nearestStationTile(army.dir, undefined, maze.walkable);
    for (const t of stationAdjacentTiles(tile, maze.walkable)) {
      visible.add(t);
    }
  }
  return visible;
}

export function isStationTileVisible(
  tileIndex: number,
  visible: Set<number> | null,
): boolean {
  if (visible == null) return true;
  return visible.has(tileIndex);
}
