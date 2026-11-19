import type {
  City,
  Planet,
  PlanetStructure,
  StructureKind,
} from "../types/campaign";
import {
  nearestStationTile,
  stationDirFromTile,
} from "./stationHex";
import {
  buildStationMaze,
  resolveStationMazeId,
} from "./stationMaze";
import { STATION_MAZE_CATALOG_COUNT } from "./stationMazeCatalog";
import { RELAY_CROWN_KIND } from "./warpGates";

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(id: string): number {
  let s = 2166136261;
  for (let i = 0; i < id.length; i++) {
    s ^= id.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  return s >>> 0;
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function makeRelayCrown(
  mazeCrownTile: number,
  controllingFactionId?: string,
  existingId?: string,
): PlanetStructure {
  return {
    id: existingId ?? crypto.randomUUID(),
    name: "Relay Crown",
    kind: RELAY_CROWN_KIND,
    tileIndex: mazeCrownTile,
    dir: stationDirFromTile(mazeCrownTile),
    controllingFactionId,
    notes: "Whoever holds the crown commands the gate.",
  };
}

/**
 * Compact corridor station from the fixed maze catalog:
 * two entrances, relay crown in the center chamber.
 */
export function generateWarpGateSurface(
  planetId: string,
  options?: { controllingFactionId?: string; stationMazeId?: number },
): { cities: City[]; structures: PlanetStructure[]; stationMazeId: number } {
  const stationMazeId =
    options?.stationMazeId != null
      ? resolveStationMazeId(planetId, options.stationMazeId)
      : Math.floor(
          mulberry32(seedFromString(planetId + ":pick-maze"))() *
            STATION_MAZE_CATALOG_COUNT,
        );
  const rng = mulberry32(seedFromString(planetId + `:maze-${stationMazeId}`));
  const maze = buildStationMaze(planetId, stationMazeId);

  const crown = makeRelayCrown(maze.crownTile, options?.controllingFactionId);
  const structures: PlanetStructure[] = [crown];
  const used = new Set<number>([maze.crownTile, ...maze.dockTiles]);

  const entranceMeta = [
    {
      tileIndex: maze.entranceA,
      name: "Boarding Lock A",
      notes: "Primary ingress. Detachments deploy here.",
    },
    {
      tileIndex: maze.entranceB,
      name: "Boarding Lock B",
      notes: "Secondary ingress. Detachments deploy here.",
    },
  ];
  for (const entr of entranceMeta) {
    if (entr.tileIndex == null) continue;
    structures.push({
      id: crypto.randomUUID(),
      name: entr.name,
      kind: "space_port",
      tileIndex: entr.tileIndex,
      dir: stationDirFromTile(entr.tileIndex),
      notes: entr.notes,
    });
  }

  const chamberKinds: StructureKind[] = [
    "relay",
    "outpost",
    "supply_network",
    "trench_line",
  ];
  const chamberNames = [
    "Plasma Core",
    "Mag-Seal Vault",
    "Gun Gallery",
    "Coolant Junction",
    "Vox Hub",
    "Bulkhead Shrine",
  ];

  // A couple of corridor hardpoints (not crowns).
  const extras = [...maze.walkable].filter(
    (t) => !used.has(t) && t !== maze.crownTile,
  );
  const hardpointCount = Math.min(2, extras.length);
  for (let n = 0; n < hardpointCount; n++) {
    const idx = Math.floor(rng() * extras.length);
    const tileIndex = extras.splice(idx, 1)[0]!;
    used.add(tileIndex);
    structures.push({
      id: crypto.randomUUID(),
      name: pick(rng, chamberNames),
      kind: pick(rng, chamberKinds),
      tileIndex,
      dir: stationDirFromTile(tileIndex),
      notes: "Corridor hardpoint.",
    });
  }

  return { cities: [], structures, stationMazeId };
}

/** Keep exactly one relay crown locked to the maze center chamber. */
export function ensureRelayCrownOnStation(
  planet: Planet,
  mazeCrownTile: number,
): PlanetStructure[] {
  const structures = [...(planet.structures ?? [])].filter(
    (s) => s.kind !== RELAY_CROWN_KIND,
  );
  const old = (planet.structures ?? []).find((s) => s.kind === RELAY_CROWN_KIND);
  structures.push(
    makeRelayCrown(
      mazeCrownTile,
      old?.controllingFactionId ?? planet.controllingFactionId,
      old?.id,
    ),
  );
  return structures;
}

/** Ensure a warp gate uses a fixed catalog maze + center relay crown. */
export function ensureWarpGateSurface(planet: Planet): Planet {
  if (planet.type !== "warp_gate") return planet;

  // Persist a catalog pick; existing gates keep theirs, new ones roll once.
  const stationMazeId =
    planet.stationMazeId != null
      ? resolveStationMazeId(planet.id, planet.stationMazeId)
      : Math.floor(
          mulberry32(seedFromString(planet.id + ":pick-maze"))() *
            STATION_MAZE_CATALOG_COUNT,
        );
  const maze = buildStationMaze(planet.id, stationMazeId);

  // Player already edited this station — still force the crown into the center.
  if (planet.surfaceReady) {
    const structures = ensureRelayCrownOnStation(planet, maze.crownTile);
    // Snap any structures that fell off the new 16×16 walkable set onto corridors.
    const snapped = structures.map((s) => {
      if (maze.walkable.has(s.tileIndex)) {
        if (s.kind === RELAY_CROWN_KIND && s.tileIndex !== maze.crownTile) {
          return {
            ...s,
            tileIndex: maze.crownTile,
            dir: stationDirFromTile(maze.crownTile),
          };
        }
        return s;
      }
      if (s.kind === RELAY_CROWN_KIND) {
        return {
          ...s,
          tileIndex: maze.crownTile,
          dir: stationDirFromTile(maze.crownTile),
        };
      }
      const nearest = nearestStationTile(s.dir, undefined, maze.walkable);
      return { ...s, tileIndex: nearest, dir: stationDirFromTile(nearest) };
    });
    const armies = (planet.armies ?? []).map((a) => {
      const tile = nearestStationTile(a.dir, undefined, maze.walkable);
      return { ...a, dir: stationDirFromTile(tile) };
    });
    return {
      ...planet,
      stationMazeId,
      cities: planet.cities ?? [],
      structures: snapped,
      surfaceReady: true,
      armies,
      controllingFactionId:
        snapped.find((s) => s.kind === RELAY_CROWN_KIND)?.controllingFactionId ??
        planet.controllingFactionId,
    };
  }

  const gen = generateWarpGateSurface(planet.id, {
    controllingFactionId: planet.controllingFactionId,
    stationMazeId,
  });
  const oldCrown = (planet.structures ?? []).find(
    (s) => s.kind === RELAY_CROWN_KIND,
  );
  const nextStructures = gen.structures.map((s) =>
    s.kind === RELAY_CROWN_KIND && oldCrown?.controllingFactionId
      ? { ...s, controllingFactionId: oldCrown.controllingFactionId }
      : s,
  );

  const armies = (planet.armies ?? []).map((a) => {
    const tile = nearestStationTile(a.dir, undefined, maze.walkable);
    return { ...a, dir: stationDirFromTile(tile) };
  });

  return {
    ...planet,
    stationMazeId: gen.stationMazeId,
    cities: [],
    structures: nextStructures,
    surfaceReady: true,
    armies,
    controllingFactionId: nextStructures.find((s) => s.kind === RELAY_CROWN_KIND)
      ?.controllingFactionId,
  };
}
