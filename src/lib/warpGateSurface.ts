import type {
  City,
  Planet,
  PlanetStructure,
  StructureKind,
} from "../types/campaign";
import {
  buildStationGrid,
  stationDirFromTile,
  STATION_HEX_RADIUS,
} from "./stationHex";
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
 * Build a flat station layout: relay crown at center, docks/habitats on the ring.
 * Ownership is solely the crown's controllingFactionId (starts unclaimed).
 */
export function generateWarpGateSurface(
  planetId: string,
  options?: { controllingFactionId?: string },
): { cities: City[]; structures: PlanetStructure[] } {
  const rng = mulberry32(seedFromString(planetId));
  const grid = buildStationGrid(STATION_HEX_RADIUS);
  const used = new Set<number>([0]);

  const crown: PlanetStructure = {
    id: crypto.randomUUID(),
    name: "Relay Crown",
    kind: RELAY_CROWN_KIND,
    tileIndex: 0,
    dir: stationDirFromTile(0),
    controllingFactionId: options?.controllingFactionId,
    notes: "Whoever holds the crown commands the gate.",
  };

  const structures: PlanetStructure[] = [crown];
  const auxKinds: StructureKind[] = [
    "space_port",
    "outpost",
    "relay",
    "reactor",
  ];
  const auxNames = [
    "Boarding Dock",
    "Hab Ring",
    "Vox Spur",
    "Plasma Spine",
    "Gun Gallery",
    "Transit Quay",
  ];

  const ringTiles = grid.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      const dist = Math.max(
        Math.abs(t.q),
        Math.abs(t.r),
        Math.abs(-t.q - t.r),
      );
      return dist >= 2;
    })
    .map(({ i }) => i);

  const extras = 3 + Math.floor(rng() * 3);
  for (let n = 0; n < extras && ringTiles.length; n++) {
    const idx = Math.floor(rng() * ringTiles.length);
    const tileIndex = ringTiles.splice(idx, 1)[0]!;
    if (used.has(tileIndex)) continue;
    used.add(tileIndex);
    structures.push({
      id: crypto.randomUUID(),
      name: pick(rng, auxNames),
      kind: pick(rng, auxKinds),
      tileIndex,
      dir: stationDirFromTile(tileIndex),
      notes: "",
    });
  }

  return { cities: [], structures };
}

/** Ensure a warp gate has a relay crown on the flat station grid. */
export function ensureWarpGateSurface(planet: Planet): Planet {
  if (planet.type !== "warp_gate") return planet;
  const structures = planet.structures ?? [];
  const hasCrown = structures.some((s) => s.kind === RELAY_CROWN_KIND);
  if (hasCrown && structures.every((s) => typeof s.tileIndex === "number")) {
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
  // Preserve existing crown owner if present under another layout.
  const oldCrown = structures.find((s) => s.kind === RELAY_CROWN_KIND);
  const nextStructures = gen.structures.map((s) =>
    s.kind === RELAY_CROWN_KIND && oldCrown?.controllingFactionId
      ? { ...s, controllingFactionId: oldCrown.controllingFactionId }
      : s,
  );
  return {
    ...planet,
    cities: [],
    structures: nextStructures,
    armies: planet.armies ?? [],
    controllingFactionId: nextStructures.find((s) => s.kind === RELAY_CROWN_KIND)
      ?.controllingFactionId,
  };
}
