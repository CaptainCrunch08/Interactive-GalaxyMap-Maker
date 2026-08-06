import type {
  Campaign,
  Planet,
  PlanetType,
  StarSystem,
} from "../types/campaign";
import { GALAXY_EDGE_PADDING } from "../types/campaign";
import { HYPERLANE_MAX_DIST, buildHyperlanes, systemHopDistance } from "./hyperlanes";
import { generatePlanetSurface, planetOwnerFromCities } from "./settlements";
import { generateWarpGateSurface } from "./warpGateSurface";
import {
  applyWarpGateOwnership,
  isWarpGateSystemTooClose,
  MIN_WARP_GATE_SYSTEM_HOPS,
} from "./warpGates";
import { pickDysonCoreStarClass, pickRandomStarClass } from "./stars";
import { pickRandomClassification } from "./planetClass";
import { pickPlanetVisualModel } from "./planetModels";

export type GalaxySize = "small" | "medium" | "large";

/** Playable square border size for each preset. */
export const GALAXY_MAP_SIZE: Record<GalaxySize, number> = {
  small: 5600,
  medium: 10000,
  large: 16000,
};

/** Base star counts before gap-filling inserts extras. */
export const SIZE_SYSTEM_COUNT: Record<GalaxySize, number> = {
  small: 48,
  medium: 100,
  large: 180,
};

/** Soft minimum spacing between stars. */
function minDistForSize(size: GalaxySize, mapSize: number, count: number): number {
  const pad = GALAXY_EDGE_PADDING;
  const area = Math.PI * Math.pow(mapSize / 2 - pad - 40, 2);
  const fromArea = Math.sqrt(area / Math.max(count, 1)) * 0.72;
  const floor: Record<GalaxySize, number> = {
    small: 200,
    medium: 220,
    large: 230,
  };
  return Math.max(floor[size], Math.min(fromArea, 380));
}

/** Gaps longer than this get new stars so local hyperlanes can connect. */
function maxGapDist(): number {
  return HYPERLANE_MAX_DIST * 0.9;
}

const PLANET_TYPES: PlanetType[] = [
  "hive",
  "forge",
  "agri",
  "death",
  "shrine",
  "feudal",
  "fortress",
  "homeworld",
  "asteroid_belt",
  "custom",
];

const NAME_A = [
  "Ash",
  "Black",
  "Crimson",
  "Dawn",
  "Ember",
  "Frost",
  "Ghost",
  "Hollow",
  "Iron",
  "Jade",
  "Kron",
  "Lumen",
  "Mire",
  "Null",
  "Obsidian",
  "Pale",
  "Quasar",
  "Rift",
  "Sable",
  "Thorn",
  "Umbral",
  "Void",
  "Wraith",
  "Xenos",
  "Yonder",
  "Zenith",
];

const NAME_B = [
  "reach",
  "gate",
  "march",
  "spire",
  "well",
  "deep",
  "flare",
  "hold",
  "crown",
  "wake",
  "shard",
  "veil",
  "forge",
  "haven",
  "exodus",
  "prime",
  "nexus",
  "cluster",
  "expanse",
  "terminus",
];

const WORLD_NAMES = [
  "Primaris",
  "Secundus",
  "Tertius",
  "Orbitus",
  "Bastion",
  "Agrippa",
  "Helion",
  "Nox",
  "Vespera",
  "Aurelia",
  "Karn",
  "Solace",
  "Ruin",
  "Foundry",
  "Cathedral",
  "Outpost",
];

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function parseGalaxySize(raw: string): GalaxySize | null {
  const s = raw.trim().toLowerCase();
  if (s === "s" || s === "small") return "small";
  if (s === "m" || s === "medium" || s === "med") return "medium";
  if (s === "l" || s === "large" || s === "big") return "large";
  return null;
}

function uniqueSystemName(rng: () => number, used: Set<string>): string {
  for (let attempt = 0; attempt < 80; attempt++) {
    const name = `${pick(rng, NAME_A)} ${pick(rng, NAME_B)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `System ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

/**
 * Insert stars along MST edges that are too long for local hyperlanes.
 */
function fillLargeGaps(
  points: { x: number; y: number }[],
  opts: {
    maxGap: number;
    minDist: number;
    pad: number;
    mapSize: number;
    cx: number;
    cy: number;
    maxR: number;
    maxExtra: number;
  },
) {
  const softMin = opts.minDist * 0.55;
  const softMin2 = softMin * softMin;
  let added = 0;

  const inBounds = (x: number, y: number) =>
    x >= opts.pad &&
    y >= opts.pad &&
    x <= opts.mapSize - opts.pad &&
    y <= opts.mapSize - opts.pad &&
    Math.hypot(x - opts.cx, y - opts.cy) <= opts.maxR;

  const clearOfOthers = (x: number, y: number) => {
    for (const p of points) {
      if (dist2(x, y, p.x, p.y) < softMin2) return false;
    }
    return true;
  };

  while (added < opts.maxExtra) {
    type GapEdge = { i: number; j: number; dist: number };
    const edges: GapEdge[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j]!;
        edges.push({
          i,
          j,
          dist: Math.hypot(b.x - a.x, b.y - a.y),
        });
      }
    }
    edges.sort((a, b) => a.dist - b.dist);

    const parent = new Int32Array(points.length);
    for (let i = 0; i < points.length; i++) parent[i] = i;
    const find = (i: number): number => {
      let x = i;
      while (parent[x] !== x) x = parent[x]!;
      let y = i;
      while (parent[y] !== y) {
        const next = parent[y]!;
        parent[y] = x;
        y = next;
      }
      return x;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    let longest: GapEdge | null = null;
    for (const e of edges) {
      if (find(e.i) === find(e.j)) continue;
      union(e.i, e.j);
      if (e.dist > opts.maxGap && (!longest || e.dist > longest.dist)) {
        longest = e;
      }
    }

    if (!longest) break;

    const a = points[longest.i]!;
    const b = points[longest.j]!;
    const steps = Math.max(2, Math.ceil(longest.dist / opts.maxGap));
    let placed = false;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (!inBounds(x, y) || !clearOfOthers(x, y)) continue;
      points.push({ x, y });
      added++;
      placed = true;
      if (added >= opts.maxExtra) break;
    }

    if (!placed) {
      // Soften: allow slightly closer insertion at true midpoint
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const looser = softMin * 0.7;
      const looser2 = looser * looser;
      let ok = inBounds(x, y);
      if (ok) {
        for (const p of points) {
          if (dist2(x, y, p.x, p.y) < looser2) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        points.push({ x, y });
        added++;
      } else {
        break;
      }
    }
  }
}

/**
 * Poisson scatter, then fill large MST gaps with extra stars so local
 * hyperlanes interconnect without long messy bridges.
 */
export function generateGalaxyCampaign(
  size: GalaxySize,
  name: string,
  seed = Date.now(),
): Campaign {
  const rng = mulberry32(seed);
  const mapSize = GALAXY_MAP_SIZE[size];
  const count = SIZE_SYSTEM_COUNT[size];
  const pad = GALAXY_EDGE_PADDING;
  const minDist = minDistForSize(size, mapSize, count);
  const minDist2 = minDist * minDist;

  const cx = mapSize / 2;
  const cy = mapSize / 2;
  const maxR = mapSize / 2 - pad - 40;

  const points: { x: number; y: number }[] = [];
  const maxAttempts = count * 200;

  const cell = minDist / Math.SQRT2;
  const gridW = Math.ceil(mapSize / cell);
  const grid = new Int32Array(gridW * gridW).fill(-1);

  const gridIndex = (x: number, y: number) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridW) return -1;
    return gy * gridW + gx;
  };

  const fits = (x: number, y: number) => {
    if (x < pad || y < pad || x > mapSize - pad || y > mapSize - pad) {
      return false;
    }
    if (Math.hypot(x - cx, y - cy) > maxR) return false;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const ix = gx + ox;
        const iy = gy + oy;
        if (ix < 0 || iy < 0 || ix >= gridW || iy >= gridW) continue;
        const pi = grid[iy * gridW + ix]!;
        if (pi < 0) continue;
        const p = points[pi]!;
        if (dist2(x, y, p.x, p.y) < minDist2) return false;
      }
    }
    return true;
  };

  const addPoint = (x: number, y: number) => {
    const i = points.length;
    points.push({ x, y });
    const gi = gridIndex(x, y);
    if (gi >= 0) grid[gi] = i;
  };

  addPoint(cx + (rng() - 0.5) * minDist * 0.2, cy + (rng() - 0.5) * minDist * 0.2);
  const active = [0];

  while (active.length > 0 && points.length < count) {
    const ai = Math.floor(rng() * active.length);
    const parent = points[active[ai]!]!;
    let placed = false;
    for (let k = 0; k < 30; k++) {
      const ang = rng() * Math.PI * 2;
      const rad = minDist * (1 + rng());
      const twist = ang + rad * 0.002;
      const x = parent.x + Math.cos(twist) * rad;
      const y = parent.y + Math.sin(twist) * rad;
      if (!fits(x, y)) continue;
      addPoint(x, y);
      active.push(points.length - 1);
      placed = true;
      break;
    }
    if (!placed) {
      active.splice(ai, 1);
    }
  }

  for (let attempt = 0; attempt < maxAttempts && points.length < count; attempt++) {
    const t = Math.sqrt(rng());
    const ang = rng() * Math.PI * 2;
    const x = cx + Math.cos(ang) * t * maxR;
    const y = cy + Math.sin(ang) * t * maxR;
    if (fits(x, y)) addPoint(x, y);
  }

  fillLargeGaps(points, {
    maxGap: maxGapDist(),
    minDist,
    pad,
    mapSize,
    cx,
    cy,
    maxR,
    maxExtra: Math.ceil(count * 0.55),
  });

  const usedNames = new Set<string>();
  const systems: StarSystem[] = [];
  const planets: Planet[] = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    const systemId = crypto.randomUUID();
    systems.push({
      id: systemId,
      name: uniqueSystemName(rng, usedNames),
      x: pt.x,
      y: pt.y,
      notes: "",
      starClass: pickRandomStarClass(rng),
    });

    const planetCount = 1 + Math.floor(rng() * 5);
    for (let o = 0; o < planetCount; o++) {
      const type = pick(rng, PLANET_TYPES);
      const planetId = crypto.randomUUID();
      const classification =
        type === "asteroid_belt" ? "barren" : pickRandomClassification(rng);
      const { cities, structures } = generatePlanetSurface(planetId, type, {});
      planets.push({
        id: planetId,
        systemId,
        name: `${pick(rng, WORLD_NAMES)}${planetCount > 1 ? ` ${o + 1}` : ""}`,
        orbitIndex: o,
        type,
        classification,
        visualModelId:
          type === "asteroid_belt" || type === "warp_gate"
            ? undefined
            : pickPlanetVisualModel(classification, rng),
        controllingFactionId: planetOwnerFromCities(
          cities,
          undefined,
          structures,
        ),
        notes: "",
        battles: [],
        cities,
        structures,
        tileClaims: {},
        armies: [],
      });
    }
  }

  // Rare paired warp gates on distant systems (not in the normal planet pool).
  spawnWarpGatePairs(rng, systems, planets, mapSize);

  return {
    version: 1,
    name,
    factions: [],
    symbols: [],
    systems,
    planets,
    fleets: [],
    characters: [],
    timeline: { frames: [], events: [] },
    mapSize,
  };
}

/**
 * Place a small number of bidirectional warp-gate pairs on distant stars.
 * Every gate system (paired or not) stays ≥ {@link MIN_WARP_GATE_SYSTEM_HOPS}
 * hyperlane hops from every other gate system.
 */
function spawnWarpGatePairs(
  rng: () => number,
  systems: StarSystem[],
  planets: Planet[],
  _mapSize: number,
) {
  if (systems.length < MIN_WARP_GATE_SYSTEM_HOPS + 1) return;

  const lanes = buildHyperlanes(systems);
  const maxPairs = Math.max(1, Math.floor(systems.length / 28));
  const usedSystems = new Set<string>();
  let placed = 0;

  for (
    let attempt = 0;
    attempt < maxPairs * 8 && placed < maxPairs;
    attempt++
  ) {
    if (rng() > 0.62) continue;

    const available = systems.filter((s) => !usedSystems.has(s.id));
    if (available.length < 2) break;

    let bestA: StarSystem | null = null;
    let bestB: StarSystem | null = null;
    let bestHops = 0;

    for (let s = 0; s < 80; s++) {
      const a = pick(rng, available);
      const b = pick(rng, available);
      if (a.id === b.id) continue;

      const hops = systemHopDistance(systems, a.id, b.id, lanes);
      if (hops < MIN_WARP_GATE_SYSTEM_HOPS) continue;
      if (
        isWarpGateSystemTooClose(systems, planets, a.id, {
          lanes,
          extraGateSystemIds: usedSystems,
        })
      ) {
        continue;
      }
      if (
        isWarpGateSystemTooClose(systems, planets, b.id, {
          lanes,
          extraGateSystemIds: new Set([...usedSystems, a.id]),
        })
      ) {
        continue;
      }

      if (hops > bestHops) {
        bestHops = hops;
        bestA = a;
        bestB = b;
      }
    }
    if (!bestA || !bestB) continue;

    // Warp gates require a Dyson Sphere / Black Hole Bomb around the core.
    for (const sys of [bestA, bestB]) {
      const idx = systems.findIndex((s) => s.id === sys.id);
      if (idx < 0) continue;
      systems[idx] = {
        ...systems[idx]!,
        dysonSphere: true,
        starClass: pickDysonCoreStarClass(rng),
      };
    }

    const gateA = makeWarpGatePlanet(rng, bestA, planets);
    const gateB = makeWarpGatePlanet(rng, bestB, planets);
    gateA.linkedGateId = gateB.id;
    gateB.linkedGateId = gateA.id;
    planets.push(gateA, gateB);
    usedSystems.add(bestA.id);
    usedSystems.add(bestB.id);
    placed += 1;
  }
}

function makeWarpGatePlanet(
  rng: () => number,
  system: StarSystem,
  planets: Planet[],
): Planet {
  const orbitIndex = planets.filter((p) => p.systemId === system.id).length;
  const planetId = crypto.randomUUID();
  const { cities, structures } = generateWarpGateSurface(planetId);
  const gate: Planet = {
    id: planetId,
    systemId: system.id,
    name: `Warp Gate ${pick(rng, ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"])}`,
    orbitIndex,
    type: "warp_gate",
    classification: "barren",
    notes: "Paired transit terminus. Control the relay crown to lock the gate.",
    battles: [],
    cities,
    structures,
    tileClaims: {},
    armies: [],
  };
  return applyWarpGateOwnership(gate);
}

export { parseGalaxySize };
