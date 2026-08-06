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
import { buildStationMaze } from "./stationMaze";
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

/**
 * Orthogonal corridor station: boarding locks at the bottom,
 * relay crown chamber at the top.
 */
export function generateWarpGateSurface(
  planetId: string,
  options?: { controllingFactionId?: string },
): { cities: City[]; structures: PlanetStructure[] } {
  const rng = mulberry32(seedFromString(planetId + ":sq-surface-v2"));
  const maze = buildStationMaze(planetId);

  const crown: PlanetStructure = {
    id: crypto.randomUUID(),
    name: "Relay Crown",
    kind: RELAY_CROWN_KIND,
    tileIndex: maze.crownTile,
    dir: stationDirFromTile(maze.crownTile),
    controllingFactionId: options?.controllingFactionId,
    notes: "Whoever holds the crown commands the gate.",
  };

  const structures: PlanetStructure[] = [crown];
  const used = new Set<number>([maze.crownTile, ...maze.dockTiles]);

  maze.dockTiles.forEach((tileIndex, i) => {
    structures.push({
      id: crypto.randomUUID(),
      name: i === 0 ? "Primary Boarding Lock" : `Boarding Lock ${i + 1}`,
      kind: "space_port",
      tileIndex,
      dir: stationDirFromTile(tileIndex),
      notes: "Orbit-to-station ingress. Detachments deploy here.",
    });
  });

  const chamberKinds: StructureKind[] = [
    "reactor",
    "relay",
    "fortress_bastion",
    "outpost",
  ];
  const chamberNames = [
    "Plasma Core",
    "Mag-Seal Vault",
    "Gun Gallery",
    "Coolant Junction",
    "Vox Hub",
    "Bulkhead Shrine",
  ];
  const chamberColors = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7"];

  maze.chamberTiles.forEach((tileIndex, i) => {
    if (used.has(tileIndex)) return;
    used.add(tileIndex);
    structures.push({
      id: crypto.randomUUID(),
      name: pick(rng, chamberNames),
      kind: pick(rng, chamberKinds),
      tileIndex,
      dir: stationDirFromTile(tileIndex),
      notes: `Interior chamber · ${chamberColors[i % chamberColors.length]}`,
    });
  });

  // A few extra outposts along corridors.
  const extras = [...maze.walkable].filter((t) => !used.has(t));
  for (let n = 0; n < 3 && extras.length; n++) {
    const idx = Math.floor(rng() * extras.length);
    const tileIndex = extras.splice(idx, 1)[0]!;
    used.add(tileIndex);
    structures.push({
      id: crypto.randomUUID(),
      name: pick(rng, ["Transit Chokepoint", "Hab Niche", "Seal Archive"]),
      kind: "outpost",
      tileIndex,
      dir: stationDirFromTile(tileIndex),
      notes: "Corridor hardpoint.",
    });
  }

  return { cities: [], structures };
}

function needsSquareMazeRegen(structures: PlanetStructure[], planetId: string): boolean {
  const maze = buildStationMaze(planetId);
  const crown = structures.find((s) => s.kind === RELAY_CROWN_KIND);
  if (!crown) return true;
  if (crown.tileIndex !== maze.crownTile) return true;
  if (!maze.walkable.has(crown.tileIndex)) return true;
  const hasBoardingLock = structures.some(
    (s) =>
      s.kind === "space_port" &&
      (s.name.includes("Boarding") || s.notes.includes("ingress")),
  );
  if (!hasBoardingLock) return true;
  return structures.some(
    (s) =>
      typeof s.tileIndex !== "number" || !maze.walkable.has(s.tileIndex),
  );
}

/** Ensure a warp gate uses the square-corridor maze layout. */
export function ensureWarpGateSurface(planet: Planet): Planet {
  if (planet.type !== "warp_gate") return planet;
  const structures = planet.structures ?? [];
  const maze = buildStationMaze(planet.id);

  if (!needsSquareMazeRegen(structures, planet.id)) {
    return {
      ...planet,
      cities: planet.cities ?? [],
      structures,
      armies: planet.armies ?? [],
      controllingFactionId: structures.find((s) => s.kind === RELAY_CROWN_KIND)
        ?.controllingFactionId,
    };
  }

  const gen = generateWarpGateSurface(planet.id, {
    controllingFactionId: planet.controllingFactionId,
  });
  const oldCrown = structures.find((s) => s.kind === RELAY_CROWN_KIND);
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
    cities: [],
    structures: nextStructures,
    armies,
    controllingFactionId: nextStructures.find((s) => s.kind === RELAY_CROWN_KIND)
      ?.controllingFactionId,
  };
}
