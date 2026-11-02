import type {
  Planet,
  PlanetClassification,
  PlanetType,
} from "../types/campaign";
import { normalizePlanetClassification } from "./planetClass";
import {
  normalizeTerrainKind,
  sampleTerrainAtDirection,
  TERRAIN_KIND_ORDER,
  type TerrainKind,
} from "./planetTerrain";
import { buildHexSphere } from "./hexSphere";
import { SETTLEMENT_HEX_FREQUENCY } from "./settlements";

/** Tile count on the strategic hex sphere (stable). */
export function strategicTileCount(): number {
  return buildHexSphere(SETTLEMENT_HEX_FREQUENCY).tiles.length;
}

/** Empty percent map (all zeros). */
export function zeroTerrainPercents(): Record<TerrainKind, number> {
  const out = {} as Record<TerrainKind, number>;
  for (const kind of TERRAIN_KIND_ORDER) out[kind] = 0;
  return out;
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

/** Renormalize partial weights so they sum to 100 (largest kinds absorb remainder). */
export function normalizeTerrainPercents(
  weights: Partial<Record<TerrainKind, number>>,
): Record<TerrainKind, number> {
  const out = zeroTerrainPercents();
  let sum = 0;
  for (const kind of TERRAIN_KIND_ORDER) {
    const v = Math.max(0, Math.round(Number(weights[kind]) || 0));
    out[kind] = v;
    sum += v;
  }
  if (sum <= 0) return equalTerrainPercents();
  if (sum === 100) return out;
  let rem = 100;
  const nonzero = TERRAIN_KIND_ORDER.filter((k) => out[k]! > 0);
  for (let i = 0; i < nonzero.length; i++) {
    const kind = nonzero[i]!;
    if (i === nonzero.length - 1) {
      out[kind] = Math.max(0, rem);
    } else {
      const v = Math.round((out[kind]! / sum) * 100);
      out[kind] = v;
      rem -= v;
    }
  }
  return out;
}

/**
 * Climate-first biome mixes inspired by hand-authored Amphoran worlds
 * (cohesive themes — not equal splits across every kind).
 */
const CLASS_TERRAIN_PRESETS: Record<
  PlanetClassification,
  Partial<Record<TerrainKind, number>>
> = {
  ice: { ice: 45, tundra: 35, ocean: 15, urban: 3, crater: 2 },
  tundra: { tundra: 40, ice: 30, ocean: 20, wasteland: 5, urban: 3, crater: 2 },
  water: { ocean: 88, ice: 8, tundra: 4 },
  islands: { ocean: 68, forest: 10, jungle: 8, agri: 7, ice: 4, urban: 3 },
  jungle: {
    ocean: 38,
    forest: 22,
    jungle: 18,
    swamp: 14,
    agri: 4,
    ice: 2,
    tundra: 2,
  },
  earthlike: {
    ocean: 46,
    forest: 15,
    agri: 13,
    jungle: 5,
    savanna: 5,
    desert: 4,
    ice: 4,
    tundra: 3,
    swamp: 3,
    urban: 2,
  },
  super_earth: {
    ocean: 50,
    agri: 16,
    forest: 11,
    jungle: 6,
    desert: 5,
    ice: 5,
    tundra: 4,
    swamp: 3,
  },
  desert: {
    desert: 48,
    wasteland: 22,
    iron_rich: 12,
    crater: 10,
    ocean: 4,
    lava: 2,
    urban: 2,
  },
  /** Default arid: barren flats with desert / oxide pockets (not Mars-dominant). */
  arid: {
    wasteland: 58,
    desert: 16,
    iron_rich: 12,
    crater: 6,
    ocean: 4,
    urban: 4,
  },
  /** Grass seas with small agri pockets and rare gallery forest. */
  savannah: {
    savanna: 48,
    ocean: 30,
    agri: 6,
    desert: 5,
    forest: 2,
    urban: 3,
    tundra: 3,
    swamp: 3,
  },
  swamp: { swamp: 45, ocean: 30, forest: 8, agri: 5, urban: 4, ice: 4, tundra: 4 },
  /** No greenery — ash, rock, and fire only. */
  volcanic: { crater: 52, lava: 28, wasteland: 14, desert: 4, urban: 2 },
  magma: { lava: 48, crater: 32, wasteland: 16, urban: 4 },
  /** Mottled chem world — mixed ocean / spoil / ore / ash / dunes / industry. */
  toxic: {
    ocean: 20,
    toxic: 22,
    wasteland: 16,
    iron_rich: 14,
    desert: 14,
    urban: 14,
  },
  barren: {
    wasteland: 55,
    crater: 20,
    iron_rich: 12,
    desert: 8,
    urban: 3,
    ocean: 2,
  },
  gas_giant: { wasteland: 100 },
  /** Approximate mix for dialogs; actual bake is hemisphere-spatial. */
  tidally_locked: {
    desert: 22,
    ice: 18,
    ocean: 14,
    forest: 10,
    wasteland: 10,
    jungle: 8,
    agri: 6,
    tundra: 5,
    lava: 4,
    urban: 3,
  },
};

const GREENERY_KINDS: TerrainKind[] = [
  "forest",
  "jungle",
  "agri",
  "savanna",
  "swamp",
];

/** Mars-oxide arid/desert: majority iron-rich hexes. */
const MARS_LIKE_PRESET: Partial<Record<TerrainKind, number>> = {
  iron_rich: 55,
  wasteland: 18,
  desert: 12,
  crater: 8,
  urban: 4,
  ocean: 3,
};

/** Share of arid worlds that roll as Mars-like (~10–20%). */
const ARID_MARS_LIKE_RATE = 0.15;
/** Share of desert worlds that roll as Mars-like. */
const DESERT_MARS_LIKE_RATE = 0.12;
/** Share of tundra worlds with a thin equatorial green belt. */
export const TUNDRA_GREEN_BELT_RATE = 0.18;

/** Rare tundra thaw: polar ice + equatorial forest / agri patches. */
const TUNDRA_GREEN_BELT_PRESET: Partial<Record<TerrainKind, number>> = {
  tundra: 34,
  ice: 24,
  ocean: 20,
  forest: 6,
  agri: 5,
  savanna: 3,
  swamp: 3,
  urban: 3,
  crater: 2,
};

function fnvSeed(id: string): number {
  let s = 2166136261;
  for (let i = 0; i < id.length; i++) {
    s ^= id.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  return s >>> 0;
}

/** Deterministic Mars-like roll from planet id (stable across regenerations). */
export function isMarsLikeWorld(
  classification: PlanetClassification | undefined,
  planetId?: string | null,
  rng?: () => number,
): boolean {
  const cls = normalizePlanetClassification(classification);
  if (cls !== "arid" && cls !== "desert") return false;
  const rate = cls === "arid" ? ARID_MARS_LIKE_RATE : DESERT_MARS_LIKE_RATE;
  if (rng) return rng() < rate;
  if (planetId) return (fnvSeed(`${planetId}:mars-like`) % 1000) / 1000 < rate;
  return Math.random() < rate;
}

/** Deterministic equatorial green-belt roll for a minority of tundra worlds. */
export function isTundraGreenBeltWorld(
  classification: PlanetClassification | undefined,
  planetId?: string | null,
  rng?: () => number,
): boolean {
  const cls = normalizePlanetClassification(classification);
  if (cls !== "tundra") return false;
  if (rng) return rng() < TUNDRA_GREEN_BELT_RATE;
  if (planetId) {
    return (fnvSeed(`${planetId}:tundra-green`) % 1000) / 1000 < TUNDRA_GREEN_BELT_RATE;
  }
  return Math.random() < TUNDRA_GREEN_BELT_RATE;
}

function stripGreenery(weights: Record<TerrainKind, number>): Record<TerrainKind, number> {
  const out = { ...weights };
  let removed = 0;
  for (const kind of GREENERY_KINDS) {
    removed += out[kind] ?? 0;
    out[kind] = 0;
  }
  if (removed > 0) {
    out.wasteland = (out.wasteland ?? 0) + Math.floor(removed * 0.45);
    out.crater = (out.crater ?? 0) + Math.floor(removed * 0.35);
    out.lava = (out.lava ?? 0) + (removed - Math.floor(removed * 0.45) - Math.floor(removed * 0.35));
  }
  return normalizeTerrainPercents(out);
}

const COLD_KINDS: TerrainKind[] = ["ice", "tundra"];

/** Hot / dry climates must never grow polar ice caps. */
function stripColdBiomes(
  weights: Record<TerrainKind, number>,
): Record<TerrainKind, number> {
  const out = { ...weights };
  let removed = 0;
  for (const kind of COLD_KINDS) {
    removed += out[kind] ?? 0;
    out[kind] = 0;
  }
  if (removed > 0) {
    out.desert = (out.desert ?? 0) + Math.floor(removed * 0.55);
    out.wasteland = (out.wasteland ?? 0) + (removed - Math.floor(removed * 0.55));
  }
  return normalizeTerrainPercents(out);
}

function isHotDryClimate(cls: PlanetClassification): boolean {
  return (
    cls === "desert" ||
    cls === "arid" ||
    cls === "volcanic" ||
    cls === "magma"
  );
}

function isLushClimate(cls: PlanetClassification): boolean {
  return (
    cls === "earthlike" ||
    cls === "super_earth" ||
    cls === "jungle" ||
    cls === "islands"
  );
}

/** Lush worlds stay vegetated / coastal — no dead wasteland flats. */
function stripWastelandForLush(
  weights: Record<TerrainKind, number>,
  cls: PlanetClassification,
): Record<TerrainKind, number> {
  const out = { ...weights };
  const removed = out.wasteland ?? 0;
  if (removed <= 0) return normalizeTerrainPercents(out);
  out.wasteland = 0;
  if (cls === "jungle") {
    out.jungle = (out.jungle ?? 0) + Math.floor(removed * 0.55);
    out.forest = (out.forest ?? 0) + Math.floor(removed * 0.25);
    out.swamp = (out.swamp ?? 0) + (removed - Math.floor(removed * 0.55) - Math.floor(removed * 0.25));
  } else if (cls === "islands") {
    out.forest = (out.forest ?? 0) + Math.floor(removed * 0.4);
    out.agri = (out.agri ?? 0) + Math.floor(removed * 0.35);
    out.jungle = (out.jungle ?? 0) + (removed - Math.floor(removed * 0.4) - Math.floor(removed * 0.35));
  } else {
    // earthlike / super_earth
    out.forest = (out.forest ?? 0) + Math.floor(removed * 0.4);
    out.agri = (out.agri ?? 0) + Math.floor(removed * 0.35);
    out.savanna = (out.savanna ?? 0) + (removed - Math.floor(removed * 0.4) - Math.floor(removed * 0.35));
  }
  return normalizeTerrainPercents(out);
}

/** Island chains stay tropical / coastal — no arid dune biomes. */
function stripDesertForIslands(
  weights: Record<TerrainKind, number>,
): Record<TerrainKind, number> {
  const out = { ...weights };
  const removed = out.desert ?? 0;
  if (removed <= 0) return normalizeTerrainPercents(out);
  out.desert = 0;
  out.forest = (out.forest ?? 0) + Math.floor(removed * 0.4);
  out.agri = (out.agri ?? 0) + Math.floor(removed * 0.35);
  out.jungle =
    (out.jungle ?? 0) +
    (removed - Math.floor(removed * 0.4) - Math.floor(removed * 0.35));
  return normalizeTerrainPercents(out);
}

/** Island chains rarely host major ore fields — keep iron deposits sparse. */
const ISLAND_IRON_MAX_PCT = 2;

function capIronForIslands(
  weights: Record<TerrainKind, number>,
): Record<TerrainKind, number> {
  const out = { ...weights };
  const iron = out.iron_rich ?? 0;
  if (iron <= ISLAND_IRON_MAX_PCT) return normalizeTerrainPercents(out);
  const removed = iron - ISLAND_IRON_MAX_PCT;
  out.iron_rich = ISLAND_IRON_MAX_PCT;
  out.forest = (out.forest ?? 0) + Math.floor(removed * 0.4);
  out.agri = (out.agri ?? 0) + Math.floor(removed * 0.35);
  out.jungle =
    (out.jungle ?? 0) +
    (removed - Math.floor(removed * 0.4) - Math.floor(removed * 0.35));
  return normalizeTerrainPercents(out);
}

/** Raise one biome to a minimum % by taking from the largest other shares. */
function enforceKindMinimum(
  weights: Record<TerrainKind, number>,
  kind: TerrainKind,
  minPct: number,
): Record<TerrainKind, number> {
  const out = { ...weights };
  const cur = out[kind] ?? 0;
  if (cur >= minPct) return normalizeTerrainPercents(out);
  let need = minPct - cur;
  out[kind] = minPct;
  const donors = TERRAIN_KIND_ORDER.filter(
    (k) => k !== kind && (out[k] ?? 0) > 0,
  ).sort((a, b) => (out[b] ?? 0) - (out[a] ?? 0));
  for (const donor of donors) {
    if (need <= 0) break;
    const take = Math.min(out[donor]!, need);
    out[donor]! -= take;
    need -= take;
  }
  return normalizeTerrainPercents(out);
}

/** World-role accents layered onto the climate mix (Amphoran-style). */
function applyTypeTerrainBias(
  base: Record<TerrainKind, number>,
  type: PlanetType,
  classification: PlanetClassification,
): Record<TerrainKind, number> {
  const out = { ...base };
  const bump = (kind: TerrainKind, amount: number) => {
    out[kind] = (out[kind] ?? 0) + amount;
  };
  const barrenClimate =
    classification === "volcanic" ||
    classification === "magma" ||
    classification === "barren" ||
    classification === "arid" ||
    classification === "desert" ||
    classification === "toxic";
  const lush = isLushClimate(classification);

  switch (type) {
    case "hive":
      bump("urban", 10);
      if (lush) bump("urban", 4);
      else bump("wasteland", 4);
      if (!barrenClimate) {
        bump("ocean", -2);
        bump("forest", -4);
      }
      break;
    case "forge":
      bump("urban", 8);
      bump("crater", 6);
      bump("toxic", lush ? 2 : 4);
      if (lush) bump("urban", 6);
      else bump("wasteland", 10);
      if (!barrenClimate) {
        bump("ocean", -4);
        bump("forest", -6);
        bump("agri", -4);
      }
      break;
    case "agri":
      if (classification === "volcanic" || classification === "magma") {
        bump("wasteland", 4);
        bump("crater", 2);
      } else if (classification === "arid" || classification === "desert") {
        bump("desert", 4);
        bump("wasteland", 4);
      } else {
        bump("agri", 12);
        bump("savanna", 6);
        bump("ocean", 4);
        bump("urban", -4);
        bump("wasteland", -6);
        bump("crater", -4);
      }
      break;
    case "death":
      bump("crater", 4);
      if (lush) {
        bump("jungle", 6);
        bump("swamp", 6);
        bump("agri", -6);
      } else {
        bump("wasteland", 8);
        if (!barrenClimate) {
          bump("jungle", 4);
          bump("swamp", 4);
          bump("agri", -6);
        }
      }
      bump("urban", -4);
      break;
    case "shrine":
      if (!barrenClimate) {
        bump("forest", 6);
        bump("jungle", 4);
        bump("agri", 2);
      } else {
        bump("wasteland", 4);
      }
      bump("urban", -2);
      break;
    case "feudal":
      if (!barrenClimate) {
        bump("agri", 8);
        bump("savanna", 4);
        bump("forest", 2);
      } else {
        bump("wasteland", 4);
        bump("desert", 2);
      }
      bump("urban", -2);
      break;
    case "fortress":
      bump("urban", 8);
      bump("crater", 4);
      if (lush) bump("urban", 4);
      else bump("wasteland", 4);
      // Ice only on cold climates — never on desert / arid / volcanic.
      if (classification === "ice" || classification === "tundra") {
        bump("ice", 2);
      }
      if (!barrenClimate) {
        bump("forest", -4);
        bump("jungle", -4);
      }
      break;
    case "homeworld":
      bump("urban", 6);
      if (!barrenClimate) {
        bump("agri", 4);
        bump("ocean", 2);
      }
      break;
    case "trade":
      // Mercantile ports: urban hubs, coastal access, light agri hinterland.
      bump("urban", 8);
      bump("ocean", 4);
      if (!barrenClimate) {
        bump("agri", 2);
        bump("savanna", 2);
      } else {
        bump("desert", 2);
        bump("wasteland", 2);
      }
      bump("crater", -2);
      break;
    case "mining":
      if (classification === "islands") {
        // Sparse ore seams on island chains — not continental iron belts.
        bump("iron_rich", 2);
        bump("crater", 2);
        bump("savanna", 2);
      } else {
        bump("iron_rich", lush ? 6 : 14);
        bump("crater", lush ? 4 : 10);
        bump("desert", lush ? 0 : 4);
        if (!lush) bump("wasteland", 8);
        else bump("savanna", 4);
        if (!barrenClimate) {
          bump("ocean", -4);
          bump("forest", -8);
          bump("agri", -6);
          bump("jungle", -4);
        }
      }
      break;
    case "archaeological":
      bump("crater", 6);
      if (classification === "islands") {
        bump("savanna", 4);
        bump("forest", 2);
      } else if (lush) {
        bump("savanna", 4);
        bump("desert", 2);
      } else {
        bump("wasteland", 8);
        bump("desert", 4);
      }
      bump("urban", -2);
      break;
    case "abandoned_colony":
      bump("crater", 4);
      if (lush) bump("savanna", 8);
      else bump("wasteland", 12);
      bump("urban", -4);
      bump("agri", -4);
      break;
    case "asteroid_belt":
    case "warp_gate":
    case "custom":
      break;
  }
  for (const kind of TERRAIN_KIND_ORDER) {
    out[kind] = Math.max(0, out[kind] ?? 0);
  }
  return normalizeTerrainPercents(out);
}

export type TerrainPercentOpts = {
  /** Stable id — drives Mars-like / tundra green-belt rolls. */
  planetId?: string | null;
  /** Force / override Mars-like oxide world. */
  marsLike?: boolean;
  /** Force / override tundra equatorial green belt. */
  tundraGreenBelt?: boolean;
  rng?: () => number;
};

/**
 * Default regen / auto-gen biome weights for a world.
 * Tuned from hand-authored Amphoran Sub-Sector planets, with hard rules:
 * volcanic/magma → no greenery; earthlike/super_earth → ≥40% ocean +
 * equatorial desert pockets; islands → ≥60% ocean and no desert;
 * arid → wasteland + desert/oxide pockets;
 * ~10–20% of arid (and some desert) worlds are Mars-like (≥50% iron-rich);
 * ~18% of tundras grow a thin equatorial green belt.
 */
export function defaultTerrainPercentsForWorld(
  classification: PlanetClassification | undefined,
  type: PlanetType,
  opts?: TerrainPercentOpts,
): Record<TerrainKind, number> {
  const cls = normalizePlanetClassification(classification);
  if (cls === "gas_giant" || type === "asteroid_belt" || type === "warp_gate") {
    return zeroTerrainPercents();
  }

  const marsLike =
    opts?.marsLike ??
    isMarsLikeWorld(cls, opts?.planetId, opts?.rng);
  const tundraGreen =
    opts?.tundraGreenBelt ??
    isTundraGreenBeltWorld(cls, opts?.planetId, opts?.rng);

  let base: Record<TerrainKind, number>;
  if (marsLike && (cls === "arid" || cls === "desert")) {
    base = normalizeTerrainPercents(MARS_LIKE_PRESET);
  } else if (tundraGreen && cls === "tundra") {
    base = normalizeTerrainPercents(TUNDRA_GREEN_BELT_PRESET);
  } else {
    base = normalizeTerrainPercents(
      CLASS_TERRAIN_PRESETS[cls] ?? { ocean: 40, wasteland: 30, agri: 30 },
    );
  }

  let mix = applyTypeTerrainBias(base, type, cls);

  if (cls === "volcanic" || cls === "magma") {
    mix = stripGreenery(mix);
  }
  if (cls === "toxic") {
    // Chem worlds stay a mottled spoil palette — no forests or polar caps.
    mix = stripGreenery(mix);
    mix = stripColdBiomes(mix);
  }
  if (isHotDryClimate(cls)) {
    // Fortress / other roles must not paint polar ice onto dune worlds.
    mix = stripColdBiomes(mix);
  }
  if (isLushClimate(cls)) {
    mix = stripWastelandForLush(mix, cls);
  }
  if (cls === "islands") {
    mix = stripDesertForIslands(mix);
    mix = capIronForIslands(mix);
  }
  if (cls === "earthlike" || cls === "super_earth") {
    mix = enforceKindMinimum(mix, "ocean", 40);
  }
  if (cls === "jungle") {
    mix = enforceKindMinimum(mix, "ocean", 35);
  }
  if (cls === "islands") {
    mix = enforceKindMinimum(mix, "ocean", 60);
  }
  if (marsLike && (cls === "arid" || cls === "desert")) {
    mix = enforceKindMinimum(mix, "iron_rich", 50);
  }

  return mix;
}

/**
 * Measure the current on-map terrain mix (painted overrides + procedural fill).
 * Used to prefill the Regenerate Tiles dialog.
 */
export function terrainPercentsOnPlanet(
  planet: Pick<Planet, "id" | "classification" | "type" | "tileTerrain">,
): Record<TerrainKind, number> {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const counts = zeroTerrainPercents();
  const n = sphere.tiles.length;
  for (let i = 0; i < n; i++) {
    const t = sphere.tiles[i]!;
    const c = t.center;
    const override = normalizeTerrainKind(planet.tileTerrain?.[String(i)]);
    const { kind } = sampleTerrainAtDirection(
      c.x,
      c.y,
      c.z,
      planet.id,
      planet.classification,
      planet.type,
      override,
    );
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const out = zeroTerrainPercents();
  let rem = 100;
  for (let i = 0; i < TERRAIN_KIND_ORDER.length; i++) {
    const kind = TERRAIN_KIND_ORDER[i]!;
    if (i === TERRAIN_KIND_ORDER.length - 1) {
      out[kind] = Math.max(0, rem);
    } else {
      const v = Math.round(((counts[kind] ?? 0) / n) * 100);
      out[kind] = v;
      rem -= v;
    }
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

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Intent curve: high world-share → few large bodies (oceans/continents);
 * low share → many small lakes/patches.
 * s = T/N (normalized share of the planet).
 */
export function seedCountForShare(target: number, tileCount: number): number {
  if (target <= 0 || tileCount <= 0) return 0;
  const s = clamp(0, 1, target / tileCount);
  const maxSeeds = Math.min(target, Math.max(1, Math.round(tileCount / 10)));
  return clamp(
    1,
    target,
    Math.round(1 + (maxSeeds - 1) * (1 - s) * (1 - s)),
  );
}

const HIGH_SHARE_THRESHOLD = 0.45;

/**
 * Terrain that must never sit under cities, districts, or structures.
 * Ocean/lava/chem spills are unbuildable or lethal; settlements stay on land.
 */
export const SETTLEMENT_FORBIDDEN_TERRAIN = new Set<TerrainKind>([
  "ocean",
  "lava",
  "toxic",
]);

export function isSettlementForbiddenTerrain(kind: TerrainKind): boolean {
  return SETTLEMENT_FORBIDDEN_TERRAIN.has(kind);
}

/** Safe defaults when painting over settlements with a forbidden kind. */
export const SETTLEMENT_LAND_FALLBACK: TerrainKind = "urban";

export type TerrainGenSettlementOpts = {
  /** City / district / structure tile indices. */
  reservedTiles?: Iterable<number>;
  /** City hub tiles — strongly prefer urban. */
  cityHubTiles?: Iterable<number>;
};

/** Preferred land when settlements must avoid forbidden biomes. */
const SETTLEMENT_PREFERRED_LAND: TerrainKind[] = [
  "urban",
  "wasteland",
  "agri",
  "desert",
  "forest",
  "savanna",
  "tundra",
  "swamp",
  "crater",
  "jungle",
  "ice",
];

/** Cold biomes that should form polar caps / polar patches. */
function isPolarKind(kind: TerrainKind): boolean {
  return kind === "ice" || kind === "tundra";
}

/** Warm biomes that prefer the equator; jungle outranks forest. */
function isEquatorialKind(kind: TerrainKind): boolean {
  return kind === "jungle" || kind === "forest";
}

/**
 * Arid pockets: few contiguous patches near the equator
 * (not the low-share "many lakes" seed curve).
 */
function isDesertPocketKind(kind: TerrainKind): boolean {
  return kind === "desert";
}

/** Vegetated biomes that prefer coasts / proximity to water. */
function isGreenlandKind(kind: TerrainKind): boolean {
  return kind === "agri" || kind === "forest" || kind === "jungle";
}

/** Seed count for desert: 1–3 equatorial pockets, never a scatter of singles. */
function desertPocketSeedCount(target: number): number {
  if (target <= 0) return 0;
  if (target <= 3) return 1;
  if (target <= 10) return Math.min(2, target);
  return Math.min(3, Math.max(1, Math.ceil(target / 12)));
}

function isWaterKind(kind: TerrainKind): boolean {
  return kind === "ocean" || kind === "swamp";
}

function chordDist2(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** Absolute latitude proxy on the unit sphere (Y-up). */
function polarScore(tileY: number, kind: TerrainKind): number {
  const lat = Math.abs(tileY);
  // Ice hugs the extremes harder; tundra sits a bit equator-ward of ice.
  return kind === "ice" ? lat * lat * lat : lat * lat;
}

/** Equator affinity: 1 at equator, 0 at poles. Jungle / desert hug the belt harder. */
function equatorScore(tileY: number, kind: TerrainKind): number {
  const equatorial = 1 - Math.abs(tileY);
  if (kind === "jungle" || kind === "desert") {
    return equatorial * equatorial * equatorial;
  }
  return equatorial * equatorial;
}

/**
 * Day–night contrast for tidally locked worlds (0 = mild desert↔tundra,
 * 1 = extreme lava/desert↔deep ice). Stable per planet id.
 */
export function tidalContrastForPlanet(
  planetId?: string | null,
  rng?: () => number,
): number {
  // Bias toward visible day/night drama (0.4 mild → 1.0 extreme).
  const unit = rng
    ? rng()
    : planetId
      ? (fnvSeed(`${planetId}:tidal-contrast`) % 1000) / 1000
      : Math.random();
  return 0.4 + 0.6 * unit;
}

/**
 * Hemisphere-aware tidally locked bake: scorched day, frozen night, and a
 * clean twilight green belt (water + greenery). Contrast varies by planet.
 */
export function generateTidallyLockedTileTerrain(
  tileCount = strategicTileCount(),
  rng: () => number = Math.random,
  settlement?: TerrainGenSettlementOpts,
  opts?: { planetId?: string | null; contrast?: number },
): Record<string, string> {
  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const n = Math.min(tileCount, sphere.tiles.length);
  if (n <= 0) return {};

  const contrast = Math.max(
    0,
    Math.min(1, opts?.contrast ?? tidalContrastForPlanet(opts?.planetId, rng)),
  );
  // Extreme contrast → narrow terminator; mild → wider habitable belt.
  const twilightHalf = 0.07 + (1 - contrast) * 0.15;
  const hotEdge = 0.5 + twilightHalf;
  const coldEdge = 0.5 - twilightHalf;

  const reserved = new Set<number>();
  for (const t of settlement?.reservedTiles ?? []) {
    if (t >= 0 && t < n) reserved.add(t);
  }
  const cityHubs = new Set<number>();
  for (const t of settlement?.cityHubTiles ?? []) {
    if (t >= 0 && t < n) cityHubs.add(t);
  }

  const assignment: (TerrainKind | null)[] = Array(n).fill(null);

  const forceSettlement = (tile: number) => {
    assignment[tile] = cityHubs.has(tile) ? "urban" : "urban";
  };

  const reservedList = [...reserved];
  shuffleInPlace(reservedList, rng);
  for (const tile of reservedList) forceSettlement(tile);

  const pickHot = (dayFac: number): TerrainKind => {
    const heat = (dayFac - hotEdge) / Math.max(1e-6, 1 - hotEdge);
    const roll = rng();
    if (contrast > 0.5 && heat > 0.55 && roll < 0.12 + contrast * 0.22) {
      return "lava";
    }
    if (roll < 0.12) return "crater";
    if (roll < 0.12 + 0.18 + contrast * 0.08) return "wasteland";
    return "desert";
  };

  const pickCold = (dayFac: number): TerrainKind => {
    const cold = (coldEdge - dayFac) / Math.max(1e-6, coldEdge);
    const roll = rng();
    // Mild: tundra-heavy. Extreme: nearly all ice on the night side.
    const iceBias = 0.25 + contrast * 0.65;
    if (cold > 0.25 || roll < iceBias) return "ice";
    if (contrast < 0.45 && roll < iceBias + 0.35) return "tundra";
    return contrast > 0.65 ? "ice" : "tundra";
  };

  const pickTwilight = (): TerrainKind => {
    const roll = rng();
    // Water pockets + greenery dominate the terminator (little barren land).
    if (roll < 0.34) return "ocean";
    if (roll < 0.44) return "swamp";
    if (roll < 0.60) return "forest";
    if (roll < 0.74) return "jungle";
    if (roll < 0.86) return "agri";
    if (roll < 0.95) return "savanna";
    return "ocean";
  };

  for (let i = 0; i < n; i++) {
    if (assignment[i] != null) continue;
    const z = sphere.tiles[i]!.center.z;
    const dayFac = Math.max(0, Math.min(1, 0.5 + 0.5 * z));
    let kind: TerrainKind;
    if (dayFac >= hotEdge) kind = pickHot(dayFac);
    else if (dayFac <= coldEdge) kind = pickCold(dayFac);
    else kind = pickTwilight();
    if (reserved.has(i) && isSettlementForbiddenTerrain(kind)) {
      kind = "urban";
    }
    assignment[i] = kind;
  }

  // Cluster twilight water: convert isolated greenery next to ocean stays water-ward.
  for (let pass = 0; pass < 2; pass++) {
    const next = assignment.slice();
    for (let i = 0; i < n; i++) {
      const z = sphere.tiles[i]!.center.z;
      const dayFac = Math.max(0, Math.min(1, 0.5 + 0.5 * z));
      if (dayFac >= hotEdge || dayFac <= coldEdge) continue;
      if (reserved.has(i)) continue;
      const cur = assignment[i];
      if (cur !== "forest" && cur !== "jungle" && cur !== "agri" && cur !== "savanna") {
        continue;
      }
      let oceanN = 0;
      let greenN = 0;
      for (const nb of sphere.neighbors[i] ?? []) {
        if (nb >= n) continue;
        const k = assignment[nb];
        if (k === "ocean" || k === "swamp") oceanN += 1;
        if (
          k === "forest" ||
          k === "jungle" ||
          k === "agri" ||
          k === "savanna"
        ) {
          greenN += 1;
        }
      }
      // Soften single desert-like leftovers: pull lonely tiles toward water pockets.
      if (oceanN >= 2 && greenN <= 1 && rng() < 0.55) next[i] = "ocean";
    }
    for (let i = 0; i < n; i++) assignment[i] = next[i]!;
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    let kind = assignment[i] ?? "wasteland";
    if (reserved.has(i) && isSettlementForbiddenTerrain(kind)) {
      kind = cityHubs.has(i) ? "urban" : "urban";
    }
    out[String(i)] = kind;
  }
  return out;
}

export type GenerateWorldTerrainOpts = {
  planetId?: string | null;
  tileCount?: number;
  rng?: () => number;
  settlement?: TerrainGenSettlementOpts;
  /** When set (e.g. regenerate dialog), use percent bake even for tidal worlds. */
  percentWeights?: Partial<Record<TerrainKind, number>> | null;
  /** Prefer spatial tidal bake (default true for tidally_locked). */
  spatialTidal?: boolean;
};

/**
 * World-aware tile bake: tidally locked uses hemisphere layout; others use
 * climate percent mixes.
 */
export function generateWorldTileTerrain(
  classification: PlanetClassification | undefined,
  type: PlanetType,
  opts?: GenerateWorldTerrainOpts,
): Record<string, string> {
  const cls = normalizePlanetClassification(classification);
  if (type === "asteroid_belt" || cls === "gas_giant") return {};

  const rng = opts?.rng ?? Math.random;
  const settlement = opts?.settlement;
  const tileCount = opts?.tileCount;

  const useSpatialTidal =
    cls === "tidally_locked" &&
    opts?.spatialTidal !== false &&
    !opts?.percentWeights;

  if (useSpatialTidal) {
    return generateTidallyLockedTileTerrain(tileCount, rng, settlement, {
      planetId: opts?.planetId,
    });
  }

  const weights =
    opts?.percentWeights ??
    defaultTerrainPercentsForWorld(cls, type, {
      planetId: opts?.planetId,
      rng,
    });
  return generateTileTerrainByPercents(weights, tileCount, rng, settlement);
}

/**
 * Assign every tile a terrain kind according to percentage weights.
 * Area follows normalized weights; shape follows share intent
 * (high % → few large regions, low % → many small lakes/patches).
 * Optional settlement tiles are kept off ocean / lava / chem spills.
 */
export function generateTileTerrainByPercents(
  weights: Partial<Record<TerrainKind, number>>,
  tileCount = strategicTileCount(),
  rng: () => number = Math.random,
  settlement?: TerrainGenSettlementOpts,
): Record<string, string> {
  const entries = TERRAIN_KIND_ORDER.map((kind) => ({
    kind,
    weight: Math.max(0, Number(weights[kind]) || 0),
  })).filter((e) => e.weight > 0);

  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  if (totalWeight <= 0 || tileCount <= 0) return {};

  const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
  const n = Math.min(tileCount, sphere.tiles.length);
  if (n <= 0) return {};

  const reserved = new Set<number>();
  for (const t of settlement?.reservedTiles ?? []) {
    if (t >= 0 && t < n) reserved.add(t);
  }
  const cityHubs = new Set<number>();
  for (const t of settlement?.cityHubTiles ?? []) {
    if (t >= 0 && t < n) cityHubs.add(t);
  }

  const targets = new Map<TerrainKind, number>();
  let assignedQuota = 0;
  for (let i = 0; i < entries.length; i++) {
    const { kind, weight } = entries[i]!;
    const count =
      i === entries.length - 1
        ? n - assignedQuota
        : Math.max(0, Math.round((weight / totalWeight) * n));
    const capped = Math.min(n - assignedQuota, count);
    targets.set(kind, capped);
    assignedQuota += capped;
  }
  if (assignedQuota < n && entries.length > 0) {
    const last = entries[entries.length - 1]!.kind;
    targets.set(last, (targets.get(last) ?? 0) + (n - assignedQuota));
  }

  const shareOf = (kind: TerrainKind): number =>
    (targets.get(kind) ?? 0) / n;

  const assignment: (TerrainKind | null)[] = Array(n).fill(null);
  const counts = new Map<TerrainKind, number>();
  for (const kind of targets.keys()) counts.set(kind, 0);

  const landKinds = TERRAIN_KIND_ORDER.filter(
    (k) => !isSettlementForbiddenTerrain(k) && (targets.get(k) ?? 0) > 0,
  );
  const anyLandKind =
    landKinds[0] ??
    SETTLEMENT_PREFERRED_LAND.find((k) => !isSettlementForbiddenTerrain(k)) ??
    SETTLEMENT_LAND_FALLBACK;

  const pickSettlementKind = (tile: number): TerrainKind => {
    // City hubs are always urban — settlements aren't underwater or on lava.
    if (cityHubs.has(tile)) return "urban";
    if ((targets.get("urban") ?? 0) > 0) return "urban";
    for (const k of landKinds) {
      if ((counts.get(k) ?? 0) < (targets.get(k) ?? 0)) return k;
    }
    return landKinds[0] ?? anyLandKind;
  };

  const claim = (tile: number, kind: TerrainKind): boolean => {
    if (tile < 0 || tile >= n) return false;
    if (assignment[tile] != null) return false;
    if (reserved.has(tile) && isSettlementForbiddenTerrain(kind)) {
      return false;
    }
    const have = counts.get(kind) ?? 0;
    const want = targets.get(kind) ?? 0;
    if (have >= want) return false;
    assignment[tile] = kind;
    counts.set(kind, have + 1);
    return true;
  };

  /** Force-claim settlement tiles (may exceed quota slightly for urban). */
  const forceSettlement = (tile: number, kind: TerrainKind) => {
    if (assignment[tile] != null) return;
    const safe = isSettlementForbiddenTerrain(kind) ? anyLandKind : kind;
    assignment[tile] = safe;
    counts.set(safe, (counts.get(safe) ?? 0) + 1);
    // Bump target so growth doesn't starve this kind later.
    targets.set(safe, Math.max(targets.get(safe) ?? 0, counts.get(safe)!));
  };

  // Reserve settlements first so ocean/lava/toxic never claim them.
  const reservedList = [...reserved];
  shuffleInPlace(reservedList, rng);
  reservedList.sort((a, b) => {
    const ha = cityHubs.has(a) ? 0 : 1;
    const hb = cityHubs.has(b) ? 0 : 1;
    return ha - hb;
  });
  for (const tile of reservedList) {
    forceSettlement(tile, pickSettlementKind(tile));
  }

  /** Hex distance to nearest ocean/swamp (Infinity if no water yet). */
  const waterDistanceField = (): number[] => {
    const dist = Array<number>(n).fill(Number.POSITIVE_INFINITY);
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = assignment[i];
      if (k && isWaterKind(k)) {
        dist[i] = 0;
        q.push(i);
      }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi]!;
      const d = dist[cur]!;
      for (const nb of sphere.neighbors[cur] ?? []) {
        if (nb >= n) continue;
        if (dist[nb]! <= d + 1) continue;
        dist[nb] = d + 1;
        q.push(nb);
      }
    }
    return dist;
  };

  /** Free tile farthest (chord) from existing same-kind seeds; fallback random.
   * Polar → high |Y|; equatorial → low |Y|; greenland → near water.
   */
  const pickSpreadSeed = (
    kind: TerrainKind,
    existingSeeds: number[],
  ): number | null => {
    const free: number[] = [];
    for (let i = 0; i < n; i++) {
      if (assignment[i] == null) free.push(i);
    }
    if (free.length === 0) return null;

    const spreadBonus = (t: number): number => {
      if (existingSeeds.length === 0) return 0;
      const c = sphere.tiles[t]!.center;
      let minD = Infinity;
      for (const s of existingSeeds) {
        const d = chordDist2(c, sphere.tiles[s]!.center);
        if (d < minD) minD = d;
      }
      return minD;
    };

    if (isPolarKind(kind)) {
      let north = 0;
      let south = 0;
      for (const s of existingSeeds) {
        const y = sphere.tiles[s]!.center.y;
        if (y >= 0) north += 1;
        else south += 1;
      }
      const preferNorth = north <= south;

      let best = free[0]!;
      let bestScore = -Infinity;
      for (const t of free) {
        const c = sphere.tiles[t]!.center;
        const hemiBoost = preferNorth === c.y >= 0 ? 0.35 : 0;
        const score =
          polarScore(c.y, kind) * 4 +
          hemiBoost +
          spreadBonus(t) * 0.15 +
          rng() * 1e-4;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    }

    if (isGreenlandKind(kind)) {
      const waterDist = waterDistanceField();
      const hasWater = waterDist.some((d) => Number.isFinite(d));
      let best = free[0]!;
      let bestScore = -Infinity;
      for (const t of free) {
        const c = sphere.tiles[t]!.center;
        const coastal = hasWater
          ? 1 / (1 + (waterDist[t] ?? 99))
          : 0;
        // Jungle/forest also keep equatorial bias; agri is mainly coastal.
        const lat =
          kind === "agri" ? 0 : equatorScore(c.y, kind === "jungle" ? "jungle" : "forest");
        const score =
          coastal * 5 +
          lat * 2.5 +
          spreadBonus(t) * 0.12 +
          rng() * 1e-4;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    }

    if (isEquatorialKind(kind) || isDesertPocketKind(kind)) {
      // Desert pockets: keep later seeds moderately apart so we get a few
      // distinct equatorial basins, not one blob and not planet-wide scatter.
      const spreadWeight = isDesertPocketKind(kind) ? 0.08 : 0.15;
      let best = free[0]!;
      let bestScore = -Infinity;
      for (const t of free) {
        const c = sphere.tiles[t]!.center;
        // Desert must stay near the equator — hard reject polar free tiles.
        if (isDesertPocketKind(kind) && Math.abs(c.y) > 0.42) continue;
        const score =
          equatorScore(c.y, kind) * (isDesertPocketKind(kind) ? 6 : 4) +
          spreadBonus(t) * spreadWeight +
          rng() * 1e-4;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (bestScore > -Infinity) return best;
      // Fallback: closest-to-equator free tile if every free hex was polar.
      if (isDesertPocketKind(kind)) {
        let bestLat = free[0]!;
        let bestAbs = Infinity;
        for (const t of free) {
          const ay = Math.abs(sphere.tiles[t]!.center.y);
          if (ay < bestAbs) {
            bestAbs = ay;
            bestLat = t;
          }
        }
        return bestLat;
      }
      return best;
    }

    if (existingSeeds.length === 0) {
      return free[Math.floor(rng() * free.length)]!;
    }
    let best = free[0]!;
    let bestScore = -1;
    for (const t of free) {
      const score = spreadBonus(t) + rng() * 1e-6;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  };

  type Frontier = { kind: TerrainKind; tiles: number[] };
  const frontiers: Frontier[] = [];

  const kindsBySize = [...targets.entries()]
    .filter(([, t]) => t > 0)
    .sort((a, b) => b[1] - a[1]);

  const plantKind = (kind: TerrainKind) => {
    const target = targets.get(kind) ?? 0;
    if (target <= 0) return;
    if (frontiers.some((f) => f.kind === kind)) return;
    let seedsWanted = isDesertPocketKind(kind)
      ? desertPocketSeedCount(target)
      : seedCountForShare(target, n);
    if (isPolarKind(kind) && target >= 2) {
      seedsWanted = Math.max(seedsWanted, Math.min(2, target));
    }
    const seedTiles: number[] = [];
    for (let s = 0; s < seedsWanted; s++) {
      const tile = pickSpreadSeed(kind, seedTiles);
      if (tile == null) break;
      if (claim(tile, kind)) seedTiles.push(tile);
    }
    if (seedTiles.length > 0) {
      frontiers.push({ kind, tiles: seedTiles });
    }
  };

  const rebuildFrontierFromOwned = (kind: TerrainKind): number[] => {
    const tiles: number[] = [];
    for (let i = 0; i < n; i++) {
      if (assignment[i] !== kind) continue;
      for (const nb of sphere.neighbors[i] ?? []) {
        if (nb < n && assignment[nb] == null) {
          tiles.push(i);
          break;
        }
      }
    }
    shuffleInPlace(tiles, rng);
    return tiles;
  };

  const sortOpenNeighbors = (kind: TerrainKind, open: number[]) => {
    if (open.length <= 1) return;
    if (isPolarKind(kind)) {
      open.sort((a, b) => {
        const ya = Math.abs(sphere.tiles[a]!.center.y);
        const yb = Math.abs(sphere.tiles[b]!.center.y);
        if (yb !== ya) return yb - ya;
        return rng() - 0.5;
      });
      return;
    }
    if (isGreenlandKind(kind)) {
      const waterDist = waterDistanceField();
      open.sort((a, b) => {
        const da = waterDist[a] ?? 99;
        const db = waterDist[b] ?? 99;
        if (da !== db) return da - db;
        if (kind !== "agri") {
          const ya = Math.abs(sphere.tiles[a]!.center.y);
          const yb = Math.abs(sphere.tiles[b]!.center.y);
          if (ya !== yb) return ya - yb;
        }
        return rng() - 0.5;
      });
      return;
    }
    if (isEquatorialKind(kind) || isDesertPocketKind(kind)) {
      open.sort((a, b) => {
        const ya = Math.abs(sphere.tiles[a]!.center.y);
        const yb = Math.abs(sphere.tiles[b]!.center.y);
        if (ya !== yb) return ya - yb;
        return rng() - 0.5;
      });
      return;
    }
    shuffleInPlace(open, rng);
  };

  /** Grow only the given kinds until their quotas fill or frontiers stall. */
  const growKinds = (kinds: Set<TerrainKind>, maxRounds = n * 3) => {
    let progress = true;
    let rounds = 0;
    while (progress && rounds < maxRounds) {
      progress = false;
      rounds += 1;
      const active = frontiers.filter((f) => kinds.has(f.kind));
      shuffleInPlace(active, rng);
      for (const front of active) {
        const want = targets.get(front.kind) ?? 0;
        if ((counts.get(front.kind) ?? 0) >= want) {
          front.tiles.length = 0;
          continue;
        }
        if (front.tiles.length === 0) {
          const rebuilt = rebuildFrontierFromOwned(front.kind);
          if (rebuilt.length === 0) continue;
          front.tiles = rebuilt;
        }
        const i = Math.floor(rng() * front.tiles.length);
        const cur = front.tiles[i]!;
        front.tiles[i] = front.tiles[front.tiles.length - 1]!;
        front.tiles.pop();

        const open: number[] = [];
        for (const nb of sphere.neighbors[cur] ?? []) {
          if (nb < n && assignment[nb] == null) open.push(nb);
        }
        sortOpenNeighbors(front.kind, open);
        for (const nb of open) {
          if ((counts.get(front.kind) ?? 0) >= want) break;
          if (claim(nb, front.kind)) {
            front.tiles.push(nb);
            progress = true;
          }
        }
        if ((counts.get(front.kind) ?? 0) < want) {
          for (const nb of sphere.neighbors[cur] ?? []) {
            if (nb < n && assignment[nb] == null) {
              front.tiles.push(cur);
              break;
            }
          }
        }
      }
      for (const kind of kinds) {
        if ((counts.get(kind) ?? 0) >= (targets.get(kind) ?? 0)) continue;
        let front = frontiers.find((f) => f.kind === kind);
        if (front && front.tiles.length > 0) continue;
        const rebuilt = rebuildFrontierFromOwned(kind);
        if (rebuilt.length > 0) {
          if (!front) frontiers.push({ kind, tiles: rebuilt });
          else front.tiles = rebuilt;
          progress = true;
          continue;
        }
        const existingOwned: number[] = [];
        for (let i = 0; i < n; i++) {
          if (assignment[i] === kind) existingOwned.push(i);
        }
        const seed = pickSpreadSeed(kind, existingOwned);
        if (seed == null) continue;
        if (!claim(seed, kind)) continue;
        progress = true;
        if (!front) frontiers.push({ kind, tiles: [seed] });
        else front.tiles.push(seed);
      }
    }
  };

  // 1) Poles  2) Water (so coasts exist)  3) Greenland on coasts  4) Rest
  plantKind("ice");
  plantKind("tundra");
  growKinds(new Set(["ice", "tundra"]));

  plantKind("ocean");
  plantKind("swamp");
  growKinds(new Set(["ocean", "swamp"]));

  plantKind("jungle");
  plantKind("forest");
  plantKind("agri");
  growKinds(new Set(["jungle", "forest", "agri"]));

  // Desert as a few equatorial pockets before other land fills the belt.
  plantKind("desert");
  growKinds(new Set(["desert"]));

  for (const [kind] of kindsBySize) {
    if (
      isPolarKind(kind) ||
      isWaterKind(kind) ||
      isGreenlandKind(kind) ||
      isDesertPocketKind(kind)
    ) {
      continue;
    }
    plantKind(kind);
  }

  // Round-robin expand all frontiers until quotas are met or frontiers die.
  let progress = true;
  let stallRounds = 0;
  while (progress && stallRounds < n * 4) {
    progress = false;
    stallRounds += 1;
    shuffleInPlace(frontiers, rng);
    for (const front of frontiers) {
      const want = targets.get(front.kind) ?? 0;
      if ((counts.get(front.kind) ?? 0) >= want) {
        front.tiles.length = 0;
        continue;
      }
      if (front.tiles.length === 0) continue;

      const i = Math.floor(rng() * front.tiles.length);
      const cur = front.tiles[i]!;
      front.tiles[i] = front.tiles[front.tiles.length - 1]!;
      front.tiles.pop();

      const open: number[] = [];
      for (const nb of sphere.neighbors[cur] ?? []) {
        if (nb < n && assignment[nb] == null) open.push(nb);
      }
      sortOpenNeighbors(front.kind, open);
      for (const nb of open) {
        if ((counts.get(front.kind) ?? 0) >= want) break;
        if (claim(nb, front.kind)) {
          front.tiles.push(nb);
          progress = true;
        }
      }
      if ((counts.get(front.kind) ?? 0) < want) {
        let hasOpen = false;
        for (const nb of sphere.neighbors[cur] ?? []) {
          if (nb < n && assignment[nb] == null) {
            hasOpen = true;
            break;
          }
        }
        if (hasOpen) front.tiles.push(cur);
      }
    }

    // Re-seed policy by share.
    for (const [kind, want] of kindsBySize) {
      if ((counts.get(kind) ?? 0) >= want) continue;
      let front = frontiers.find((f) => f.kind === kind);
      const highShare = shareOf(kind) >= HIGH_SHARE_THRESHOLD;
      const desertPocket = isDesertPocketKind(kind);

      if (front && front.tiles.length > 0) continue;

      // Prefer growing existing bodies (esp. desert pockets) over scattering.
      if (highShare || desertPocket) {
        const rebuilt = rebuildFrontierFromOwned(kind);
        if (rebuilt.length > 0) {
          if (!front) {
            front = { kind, tiles: rebuilt };
            frontiers.push(front);
          } else {
            front.tiles = rebuilt;
          }
          progress = true;
          continue;
        }
      }

      const existingOwned: number[] = [];
      for (let i = 0; i < n; i++) {
        if (assignment[i] === kind) existingOwned.push(i);
      }
      // Cap desert pocket count — don't keep planting distant singles.
      if (
        desertPocket &&
        existingOwned.length > 0 &&
        existingOwned.length >= desertPocketSeedCount(want)
      ) {
        continue;
      }
      const seed = pickSpreadSeed(kind, existingOwned);
      if (seed == null) continue;
      if (!claim(seed, kind)) continue;
      progress = true;
      if (!front) {
        frontiers.push({ kind, tiles: [seed] });
      } else {
        front.tiles.push(seed);
      }
    }
  }

  const fallbackKind =
    kindsBySize[0]?.[0] ?? entries[entries.length - 1]!.kind;

  const underQuotaKinds = (): TerrainKind[] => {
    const list: TerrainKind[] = [];
    for (const [kind, want] of kindsBySize) {
      if ((counts.get(kind) ?? 0) < want) list.push(kind);
    }
    return list;
  };

  // Leftovers: for high-share under-quota kinds, prefer tiles adjacent to them.
  const leftovers: number[] = [];
  for (let i = 0; i < n; i++) {
    if (assignment[i] == null) leftovers.push(i);
  }
  shuffleInPlace(leftovers, rng);

  // Polar leftovers: assign under-quota ice/tundra to highest-|Y| free tiles first.
  const polarNeedy = (): TerrainKind[] =>
    underQuotaKinds().filter(isPolarKind);
  const equatorNeedy = (): TerrainKind[] =>
    underQuotaKinds().filter(
      (k) => isEquatorialKind(k) || isDesertPocketKind(k),
    );
  const greenlandNeedy = (): TerrainKind[] =>
    underQuotaKinds().filter(isGreenlandKind);
  leftovers.sort((a, b) => {
    const ya = Math.abs(sphere.tiles[a]!.center.y);
    const yb = Math.abs(sphere.tiles[b]!.center.y);
    return yb - ya;
  });

  for (const tile of leftovers) {
    if (assignment[tile] != null) continue;
    const needy = underQuotaKinds();
    let chosen: TerrainKind | null = null;

    const polar = polarNeedy();
    const equatorial = equatorNeedy();
    const green = greenlandNeedy();
    const tileLat = Math.abs(sphere.tiles[tile]!.center.y);
    const nextToWater = (sphere.neighbors[tile] ?? []).some((nb) => {
      const k = nb < n ? assignment[nb] : null;
      return k != null && isWaterKind(k);
    });
    if (polar.length > 0) {
      // Prefer polar kind that already borders this tile.
      for (const kind of polar) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      // Only dump under-quota ice/tundra onto clearly polar free tiles.
      if (!chosen && tileLat >= 0.45) {
        chosen = polar.includes("ice") ? "ice" : polar[0]!;
      }
    }

    if (!chosen && green.length > 0 && nextToWater) {
      for (const kind of ["jungle", "forest", "agri"] as const) {
        if (!green.includes(kind)) continue;
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) {
        chosen = green.includes("jungle")
          ? "jungle"
          : green.includes("forest")
            ? "forest"
            : green[0]!;
      }
    }

    if (!chosen && equatorial.length > 0) {
      for (const kind of equatorial) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      // Dump under-quota jungle/forest/desert onto clearly equatorial free tiles
      // (prefer expanding desert only when adjacent; else jungle first).
      if (!chosen && tileLat <= 0.35) {
        if (equatorial.includes("desert")) {
          const nextToDesert = (sphere.neighbors[tile] ?? []).some(
            (nb) => nb < n && assignment[nb] === "desert",
          );
          if (nextToDesert) chosen = "desert";
        }
        if (!chosen) {
          chosen = equatorial.includes("jungle")
            ? "jungle"
            : equatorial.find((k) => k !== "desert") ?? equatorial[0]!;
        }
      }
    }

    const highNeedy = needy.filter(
      (k) =>
        shareOf(k) >= HIGH_SHARE_THRESHOLD &&
        !isPolarKind(k) &&
        !isEquatorialKind(k) &&
        !isGreenlandKind(k),
    );
    if (!chosen && highNeedy.length > 0) {
      for (const kind of highNeedy) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) chosen = highNeedy[0]!;
    }

    if (!chosen && needy.length > 0) {
      for (const kind of needy) {
        for (const nb of sphere.neighbors[tile] ?? []) {
          if (nb < n && assignment[nb] === kind) {
            chosen = kind;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) chosen = needy[0]!;
    }

    if (!chosen) chosen = fallbackKind;
    if (reserved.has(tile) && isSettlementForbiddenTerrain(chosen)) {
      chosen = pickSettlementKind(tile);
    }
    assignment[tile] = chosen;
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
  }

  // Final safety: settlements never keep ocean / lava / chem spill.
  for (const tile of reserved) {
    const k = assignment[tile];
    if (!k || isSettlementForbiddenTerrain(k)) {
      const safe = pickSettlementKind(tile);
      if (k && counts.has(k)) {
        counts.set(k, Math.max(0, (counts.get(k) ?? 1) - 1));
      }
      assignment[tile] = safe;
      counts.set(safe, (counts.get(safe) ?? 0) + 1);
    }
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    let kind = assignment[i] ?? fallbackKind;
    if (reserved.has(i) && isSettlementForbiddenTerrain(kind)) {
      kind = pickSettlementKind(i);
    }
    out[String(i)] = kind;
  }
  return out;
}

/** Paint every tile with a single kind (settlements stay on safe land). */
export function fillAllTileTerrain(
  kind: TerrainKind,
  tileCount = strategicTileCount(),
  settlement?: TerrainGenSettlementOpts,
): Record<string, string> {
  const reserved = new Set<number>();
  for (const t of settlement?.reservedTiles ?? []) reserved.add(t);
  const cityHubs = new Set<number>();
  for (const t of settlement?.cityHubTiles ?? []) cityHubs.add(t);
  const out: Record<string, string> = {};
  for (let i = 0; i < tileCount; i++) {
    if (reserved.has(i) && isSettlementForbiddenTerrain(kind)) {
      out[String(i)] = SETTLEMENT_LAND_FALLBACK;
    } else {
      out[String(i)] = kind;
    }
  }
  // Prefer urban label on hubs when we had to substitute.
  for (const hub of cityHubs) {
    if (
      hub >= 0 &&
      hub < tileCount &&
      reserved.has(hub) &&
      isSettlementForbiddenTerrain(kind)
    ) {
      out[String(hub)] = "urban";
    }
  }
  return out;
}
