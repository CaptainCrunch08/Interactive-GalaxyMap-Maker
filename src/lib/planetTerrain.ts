import type { PlanetClassification, PlanetType } from "../types/campaign";
import { normalizePlanetClassification } from "./planetClass";
import { hexNoise, type HexCoord } from "./hex";

export type TerrainKind =
  | "wasteland"
  | "crater"
  | "urban"
  | "hive"
  | "forge"
  | "agri"
  | "forest"
  | "ocean"
  | "toxic"
  | "ash"
  | "shrine"
  | "ruins"
  | "ice"
  | "cloud"
  | "desert"
  | "swamp"
  | "lava";

export type TerrainCell = {
  q: number;
  r: number;
  kind: TerrainKind;
  /** 0–1 elevation / intensity for shading. */
  height: number;
  fill: string;
  stroke: string;
  glow?: string;
  /** Soft cloud / smog overlay opacity for this cell. */
  haze: number;
};

type Palette = {
  low: string;
  mid: string;
  high: string;
  accent: string;
  water: string;
  haze: string;
};

/** Climate-driven color bases (primary terrain driver). */
const CLASS_PALETTES: Record<PlanetClassification, Palette> = {
  ice: {
    low: "#1a2838",
    mid: "#3a5068",
    high: "#a8c8e0",
    accent: "#d0e8f8",
    water: "#1a3048",
    haze: "rgba(200,220,240,0.2)",
  },
  tundra: {
    low: "#1a2428",
    mid: "#3a4850",
    high: "#6a7880",
    accent: "#9ab0a8",
    water: "#1a3038",
    haze: "rgba(180,200,210,0.14)",
  },
  water: {
    low: "#0a2038",
    mid: "#1a4870",
    high: "#3a78a8",
    accent: "#70b8d8",
    water: "#0c2848",
    haze: "rgba(120,180,220,0.18)",
  },
  islands: {
    low: "#0e2830",
    mid: "#2a6850",
    high: "#58a878",
    accent: "#c8d878",
    water: "#0a3050",
    haze: "rgba(140,200,200,0.16)",
  },
  jungle: {
    low: "#0c2014",
    mid: "#1e4a28",
    high: "#3a7840",
    accent: "#68a848",
    water: "#143838",
    haze: "rgba(100,160,100,0.18)",
  },
  earthlike: {
    low: "#14241a",
    mid: "#2a5838",
    high: "#5a8a48",
    accent: "#90b860",
    water: "#143848",
    haze: "rgba(160,190,180,0.14)",
  },
  super_earth: {
    low: "#102018",
    mid: "#285838",
    high: "#4a9050",
    accent: "#88c070",
    water: "#123848",
    haze: "rgba(140,180,160,0.14)",
  },
  desert: {
    low: "#2a2010",
    mid: "#8a6830",
    high: "#c8a858",
    accent: "#e0c070",
    water: "#203038",
    haze: "rgba(220,190,120,0.16)",
  },
  arid: {
    low: "#241810",
    mid: "#785838",
    high: "#b08850",
    accent: "#d0a868",
    water: "#1c2830",
    haze: "rgba(200,170,120,0.14)",
  },
  savannah: {
    low: "#242014",
    mid: "#6a6830",
    high: "#a89840",
    accent: "#c8b850",
    water: "#1a3040",
    haze: "rgba(200,190,130,0.14)",
  },
  swamp: {
    low: "#141c14",
    mid: "#3a4830",
    high: "#5a6840",
    accent: "#788850",
    water: "#1a3028",
    haze: "rgba(120,150,100,0.2)",
  },
  volcanic: {
    low: "#1a1010",
    mid: "#4a2820",
    high: "#7a4030",
    accent: "#c85830",
    water: "#201818",
    haze: "rgba(180,80,50,0.16)",
  },
  magma: {
    low: "#180808",
    mid: "#501810",
    high: "#882818",
    accent: "#e04020",
    water: "#201010",
    haze: "rgba(220,60,30,0.18)",
  },
  toxic: {
    low: "#141c10",
    mid: "#3a5020",
    high: "#5a7830",
    accent: "#a0d040",
    water: "#1a2818",
    haze: "rgba(140,200,60,0.16)",
  },
  barren: {
    low: "#181818",
    mid: "#3a3834",
    high: "#5a5650",
    accent: "#8a8478",
    water: "#141820",
    haze: "rgba(160,150,140,0.1)",
  },
  gas_giant: {
    low: "#2a2010",
    mid: "#8a6838",
    high: "#c8a060",
    accent: "#e8c878",
    water: "#403020",
    haze: "rgba(220,180,120,0.22)",
  },
  tidally_locked: {
    low: "#0c1018",
    mid: "#2a3048",
    high: "#687088",
    accent: "#a0a8c0",
    water: "#101828",
    haze: "rgba(140,150,180,0.16)",
  },
};

function hash2(a: number, b: number, seed: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(q: number, r: number, seed: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    v += amp * hash2(q * freq, r * freq, seed + i * 17);
    amp *= 0.5;
    freq *= 2.1;
  }
  return v;
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 0xff;
  const ag = (pa >> 8) & 0xff;
  const ab = pa & 0xff;
  const br = (pb >> 16) & 0xff;
  const bg = (pb >> 8) & 0xff;
  const bb = pb & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

function shade(base: string, amount: number): string {
  const n = parseInt(base.slice(1), 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const lift = Math.round(amount * 40);
  r = Math.max(0, Math.min(255, r + lift));
  g = Math.max(0, Math.min(255, g + lift));
  b = Math.max(0, Math.min(255, b + lift));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Primary biome from climate classification. */
function classifyClimate(
  classification: PlanetClassification,
  elev: number,
  moist: number,
  detail: number,
): TerrainKind {
  switch (classification) {
    case "ice":
      if (elev < 0.22) return "ocean";
      if (detail > 0.82) return "crater";
      return "ice";
    case "tundra":
      if (elev < 0.26) return "ocean";
      if (elev > 0.72) return "ice";
      if (moist > 0.55) return "swamp";
      return "wasteland";
    case "water":
      if (elev > 0.78) return "wasteland";
      if (elev > 0.62) return moist > 0.5 ? "forest" : "wasteland";
      return "ocean";
    case "islands":
      if (elev < 0.48) return "ocean";
      if (moist > 0.55) return "forest";
      if (elev > 0.75) return "wasteland";
      return "agri";
    case "jungle":
      if (elev < 0.28) return "ocean";
      if (moist > 0.35) return "forest";
      if (detail > 0.8) return "swamp";
      return "forest";
    case "earthlike":
    case "super_earth":
      if (elev < 0.3) return "ocean";
      if (moist > 0.62) return "forest";
      if (moist > 0.45 && elev < 0.7) return "agri";
      if (elev > 0.78) return "wasteland";
      return "agri";
    case "desert":
      if (elev < 0.18) return "ocean";
      if (detail > 0.78) return "crater";
      if (moist > 0.72 && elev < 0.5) return "agri";
      return "desert";
    case "arid":
      if (elev < 0.22) return "ocean";
      if (moist > 0.6) return "agri";
      if (elev > 0.7) return "wasteland";
      return "desert";
    case "savannah":
      if (elev < 0.26) return "ocean";
      if (moist > 0.55) return "agri";
      if (moist > 0.7) return "forest";
      return "desert";
    case "swamp":
      if (elev < 0.35) return "ocean";
      if (moist > 0.4) return "swamp";
      if (detail > 0.75) return "toxic";
      return "forest";
    case "volcanic":
      if (elev < 0.22) return "lava";
      if (detail > 0.7) return "ash";
      if (elev > 0.7) return "crater";
      return "wasteland";
    case "magma":
      if (elev < 0.4 || detail > 0.55) return "lava";
      if (detail > 0.35) return "ash";
      return "crater";
    case "toxic":
      if (elev < 0.35) return "toxic";
      if (moist > 0.5) return "swamp";
      if (detail > 0.75) return "ash";
      return "wasteland";
    case "barren":
      if (elev < 0.2) return "crater";
      if (detail > 0.72) return "crater";
      if (elev > 0.75) return "ash";
      return "wasteland";
    case "gas_giant":
      if (detail > 0.65) return "cloud";
      if (elev > 0.55) return "cloud";
      return "ash";
    case "tidally_locked":
      // Hot side vs cold side approximated by elev noise axes
      if (elev < 0.28) return "ocean";
      if (elev > 0.7) return "ice";
      if (moist < 0.35) return "desert";
      if (moist > 0.65) return "forest";
      return "wasteland";
    default:
      if (elev < 0.32) return "ocean";
      if (moist > 0.65) return "forest";
      return "wasteland";
  }
}

/**
 * Secondary world-type bias: can override climate biome when urban/detail
 * signals are strong, without replacing the climate palette.
 */
function applyTypeBias(
  type: PlanetType,
  climate: TerrainKind,
  elev: number,
  urban: number,
  detail: number,
): TerrainKind {
  switch (type) {
    case "hive":
      if (urban > 0.72 || (urban > 0.55 && elev > 0.42)) return "hive";
      if (urban > 0.48) return "urban";
      if (detail > 0.82 && elev > 0.5) return "ruins";
      return climate;
    case "forge":
      if (urban > 0.58 || detail > 0.68) return "forge";
      if (elev > 0.72 && detail > 0.4) return "ash";
      if (urban > 0.4 && climate === "ocean") return "toxic";
      return climate;
    case "agri":
      if (
        climate !== "ocean" &&
        climate !== "ice" &&
        climate !== "lava" &&
        urban < 0.55
      ) {
        if (detail < 0.55) return "agri";
        if (detail > 0.75) return "forest";
      }
      return climate;
    case "death":
      if (detail > 0.78) return "crater";
      if (urban > 0.82) return "ruins";
      if (climate === "forest" || climate === "agri") return "wasteland";
      return climate;
    case "shrine":
      if (urban > 0.65 || detail > 0.74) return "shrine";
      if (detail > 0.6 && climate !== "ocean") return "ruins";
      return climate;
    case "asteroid_belt":
      if (detail > 0.55) return "crater";
      return "wasteland";
    case "warp_gate":
      if (urban > 0.5) return "urban";
      return "wasteland";
    default:
      if (urban > 0.75) return "urban";
      if (detail > 0.85) return "crater";
      return climate;
  }
}

function colorFor(
  kind: TerrainKind,
  palette: Palette,
  height: number,
): { fill: string; stroke: string; glow?: string } {
  const h = height;
  switch (kind) {
    case "ocean":
      return {
        fill: shade(palette.water, h * 0.4 - 0.15),
        stroke: "rgba(100,160,180,0.25)",
      };
    case "toxic":
      return {
        fill: lerpColor("#1a2810", "#3a5020", h),
        stroke: "rgba(120,180,60,0.28)",
        glow: "rgba(140,200,40,0.12)",
      };
    case "hive":
      return {
        fill: lerpColor(palette.mid, palette.high, 0.4 + h * 0.5),
        stroke: "rgba(200,180,140,0.35)",
        glow: `${palette.accent}33`,
      };
    case "urban":
      return {
        fill: lerpColor(palette.low, palette.mid, 0.5 + h * 0.4),
        stroke: "rgba(160,170,180,0.3)",
      };
    case "forge":
      return {
        fill: lerpColor("#2a1810", palette.accent, 0.15 + h * 0.35),
        stroke: "rgba(230,120,40,0.4)",
        glow: "rgba(255,120,40,0.22)",
      };
    case "agri":
      return {
        fill: lerpColor(palette.mid, palette.accent, 0.2 + h * 0.45),
        stroke: "rgba(140,180,80,0.28)",
      };
    case "forest":
      return {
        fill: lerpColor("#142818", "#2a4830", h),
        stroke: "rgba(80,140,90,0.3)",
      };
    case "ash":
      return {
        fill: lerpColor(palette.low, "#4a4440", h * 0.7),
        stroke: "rgba(120,110,100,0.25)",
      };
    case "crater":
      return {
        fill: lerpColor(palette.low, palette.mid, 0.2 + h * 0.3),
        stroke: "rgba(100,80,70,0.35)",
      };
    case "shrine":
      return {
        fill: lerpColor(palette.mid, palette.accent, 0.25 + h * 0.4),
        stroke: "rgba(220,200,150,0.4)",
        glow: `${palette.accent}28`,
      };
    case "ruins":
      return {
        fill: lerpColor(palette.low, palette.high, 0.35 + h * 0.3),
        stroke: "rgba(160,150,140,0.3)",
      };
    case "ice":
      return {
        fill: lerpColor("#2a3448", "#a8c0d8", 0.3 + h * 0.5),
        stroke: "rgba(180,210,230,0.35)",
      };
    case "cloud":
      return {
        fill: lerpColor(palette.mid, palette.high, 0.4 + h * 0.4),
        stroke: "rgba(220,200,160,0.3)",
        glow: `${palette.accent}22`,
      };
    case "desert":
      return {
        fill: lerpColor(palette.low, palette.accent, 0.25 + h * 0.5),
        stroke: "rgba(200,170,100,0.28)",
      };
    case "swamp":
      return {
        fill: lerpColor("#1a2818", "#3a5030", h),
        stroke: "rgba(90,130,70,0.3)",
      };
    case "lava":
      return {
        fill: lerpColor("#2a0808", palette.accent, 0.35 + h * 0.4),
        stroke: "rgba(255,80,30,0.45)",
        glow: "rgba(255,60,20,0.28)",
      };
    case "wasteland":
    default:
      return {
        fill: lerpColor(palette.low, palette.mid, 0.25 + h * 0.55),
        stroke: "rgba(140,150,160,0.22)",
      };
  }
}

function seedFromId(id: string): number {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(s) % 10000;
}

function paletteFor(
  classification: PlanetClassification | undefined,
): Palette {
  return CLASS_PALETTES[normalizePlanetClassification(classification)];
}

function sampleFields(
  q: number,
  r: number,
  seed: number,
): { elev: number; moist: number; urban: number; detail: number } {
  return {
    elev: fbm(q * 0.35, r * 0.35, seed),
    moist: fbm(q * 0.28 + 40, r * 0.28 - 12, seed + 3),
    urban: fbm(q * 0.45 - 8, r * 0.45 + 5, seed + 9),
    detail: hexNoise(q + seed, r - seed),
  };
}

function resolveKind(
  classification: PlanetClassification,
  type: PlanetType,
  elev: number,
  moist: number,
  urban: number,
  detail: number,
): TerrainKind {
  const climate = classifyClimate(classification, elev, moist, detail);
  return applyTypeBias(type, climate, elev, urban, detail);
}

function typeHazeBoost(type: PlanetType, moist: number): number {
  if (type === "forge" || type === "hive") return 0.08 + moist * 0.22;
  if (type === "agri") return 0.05 + moist * 0.15;
  return 0.04 + moist * 0.12;
}

/**
 * Procedural terrain for a planet hex disk, stable per planet id.
 * Biome from classification; world type adds structure/urban bias.
 */
export function generatePlanetTerrain(
  cells: HexCoord[],
  planetId: string,
  classification: PlanetClassification,
  type: PlanetType,
): TerrainCell[] {
  const seed = seedFromId(planetId);
  const cls = normalizePlanetClassification(classification);
  const palette = paletteFor(cls);

  return cells.map(({ q, r }) => {
    const { elev, moist, urban, detail } = sampleFields(q, r, seed);
    const kind = resolveKind(cls, type, elev, moist, urban, detail);
    const { fill, stroke, glow } = colorFor(kind, palette, elev);
    return {
      q,
      r,
      kind,
      height: elev,
      fill,
      stroke,
      glow,
      haze: typeHazeBoost(type, moist),
    };
  });
}

export function terrainLegend(
  classification: PlanetClassification,
  type: PlanetType,
): { kind: TerrainKind; label: string }[] {
  const cls = normalizePlanetClassification(classification);
  const climateLegend: Record<
    PlanetClassification,
    { kind: TerrainKind; label: string }[]
  > = {
    ice: [
      { kind: "ice", label: "Glaciers" },
      { kind: "ocean", label: "Frozen seas" },
      { kind: "crater", label: "Impact scars" },
      { kind: "wasteland", label: "Permafrost" },
    ],
    tundra: [
      { kind: "wasteland", label: "Tundra" },
      { kind: "ice", label: "Ice shelves" },
      { kind: "swamp", label: "Melt bogs" },
      { kind: "ocean", label: "Cold seas" },
    ],
    water: [
      { kind: "ocean", label: "World ocean" },
      { kind: "wasteland", label: "Atolls" },
      { kind: "forest", label: "Coastal green" },
      { kind: "agri", label: "Archipelago farms" },
    ],
    islands: [
      { kind: "ocean", label: "Seas" },
      { kind: "forest", label: "Isle jungles" },
      { kind: "agri", label: "Shore belts" },
      { kind: "wasteland", label: "Ridges" },
    ],
    jungle: [
      { kind: "forest", label: "Canopy" },
      { kind: "swamp", label: "Wetlands" },
      { kind: "ocean", label: "Rivers / lakes" },
      { kind: "wasteland", label: "Clearings" },
    ],
    earthlike: [
      { kind: "agri", label: "Plains" },
      { kind: "forest", label: "Woodlands" },
      { kind: "ocean", label: "Seas" },
      { kind: "wasteland", label: "Highlands" },
    ],
    super_earth: [
      { kind: "agri", label: "Vast plains" },
      { kind: "forest", label: "Deep forests" },
      { kind: "ocean", label: "Oceans" },
      { kind: "wasteland", label: "Massifs" },
    ],
    desert: [
      { kind: "desert", label: "Dunes" },
      { kind: "wasteland", label: "Rock flats" },
      { kind: "crater", label: "Basins" },
      { kind: "ocean", label: "Salt pans" },
    ],
    arid: [
      { kind: "desert", label: "Scrub" },
      { kind: "agri", label: "Oases" },
      { kind: "wasteland", label: "Badlands" },
      { kind: "ocean", label: "Dry seas" },
    ],
    savannah: [
      { kind: "desert", label: "Grass plains" },
      { kind: "agri", label: "Pasture" },
      { kind: "forest", label: "Gallery woods" },
      { kind: "ocean", label: "Seasonal lakes" },
    ],
    swamp: [
      { kind: "swamp", label: "Mires" },
      { kind: "forest", label: "Mangrove" },
      { kind: "ocean", label: "Brackish water" },
      { kind: "toxic", label: "Fens" },
    ],
    volcanic: [
      { kind: "ash", label: "Ash fields" },
      { kind: "lava", label: "Lava flows" },
      { kind: "crater", label: "Calderas" },
      { kind: "wasteland", label: "Scoria" },
    ],
    magma: [
      { kind: "lava", label: "Magma seas" },
      { kind: "ash", label: "Cinder plains" },
      { kind: "crater", label: "Rifts" },
      { kind: "wasteland", label: "Basalt" },
    ],
    toxic: [
      { kind: "toxic", label: "Chem lakes" },
      { kind: "swamp", label: "Poison mires" },
      { kind: "ash", label: "Dead flats" },
      { kind: "wasteland", label: "Barren crust" },
    ],
    barren: [
      { kind: "wasteland", label: "Regolith" },
      { kind: "crater", label: "Craters" },
      { kind: "ash", label: "Dust seas" },
      { kind: "ruins", label: "Ancient scars" },
    ],
    gas_giant: [
      { kind: "cloud", label: "Banded cloud" },
      { kind: "ash", label: "Storm belts" },
      { kind: "wasteland", label: "Deep haze" },
      { kind: "toxic", label: "Chem storms" },
    ],
    tidally_locked: [
      { kind: "desert", label: "Day side" },
      { kind: "ice", label: "Night ice" },
      { kind: "ocean", label: "Terminator seas" },
      { kind: "forest", label: "Twilight belt" },
    ],
  };

  const base = climateLegend[cls];
  const typeExtra: { kind: TerrainKind; label: string }[] = [];
  switch (type) {
    case "hive":
      typeExtra.push(
        { kind: "hive", label: "Hive stacks" },
        { kind: "urban", label: "Sprawl" },
      );
      break;
    case "forge":
      typeExtra.push(
        { kind: "forge", label: "Manufactorum" },
        { kind: "ash", label: "Slag fields" },
      );
      break;
    case "agri":
      typeExtra.push({ kind: "agri", label: "Agri belts" });
      break;
    case "death":
      typeExtra.push(
        { kind: "crater", label: "Kill zones" },
        { kind: "ruins", label: "Ruins" },
      );
      break;
    case "shrine":
      typeExtra.push(
        { kind: "shrine", label: "Reliquary" },
        { kind: "ruins", label: "Pilgrim ruins" },
      );
      break;
    default:
      break;
  }

  const seen = new Set<TerrainKind>();
  const out: { kind: TerrainKind; label: string }[] = [];
  for (const item of [...typeExtra, ...base]) {
    if (seen.has(item.kind)) continue;
    seen.add(item.kind);
    out.push(item);
    if (out.length >= 5) break;
  }
  return out;
}

export function legendSwatch(
  kind: TerrainKind,
  classification: PlanetClassification,
): string {
  const palette = paletteFor(classification);
  return colorFor(kind, palette, 0.55).fill;
}

export const TERRAIN_KIND_LABELS: Record<TerrainKind, string> = {
  wasteland: "Wasteland",
  crater: "Crater",
  urban: "Urban",
  hive: "Hive",
  forge: "Forge",
  agri: "Agri",
  forest: "Forest",
  ocean: "Ocean",
  toxic: "Toxic",
  ash: "Ash",
  shrine: "Shrine",
  ruins: "Ruins",
  ice: "Ice",
  cloud: "Cloud",
  desert: "Desert",
  swamp: "Swamp",
  lava: "Lava",
};

export const TERRAIN_KIND_ORDER: TerrainKind[] = [
  "wasteland",
  "crater",
  "desert",
  "ocean",
  "ice",
  "forest",
  "swamp",
  "agri",
  "urban",
  "hive",
  "forge",
  "ash",
  "lava",
  "toxic",
  "shrine",
  "ruins",
  "cloud",
];

/** Clear a painted biome override (restore procedural). */
export const TERRAIN_KIND_ERASE = "__erase_terrain__";

/**
 * Sample procedural terrain at a unit-sphere direction (for 3D hex tiles).
 * Stable per planet id; biome mix driven primarily by classification.
 */
export function sampleTerrainAtDirection(
  x: number,
  y: number,
  z: number,
  planetId: string,
  classification: PlanetClassification,
  type: PlanetType,
  overrideKind?: TerrainKind | null,
): { kind: TerrainKind; fill: string; height: number } {
  const seed = seedFromId(planetId);
  const cls = normalizePlanetClassification(classification);
  const palette = paletteFor(cls);
  const n1 = fbm(x * 2.8, y * 2.8, seed);
  const n2 = fbm(y * 2.6 + 11, z * 2.6, seed + 3);
  const n3 = fbm(z * 2.4 - 7, x * 2.4, seed + 9);
  const elev = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;
  const moist = fbm(x * 1.9 + 4, z * 1.9 - 2, seed + 5);
  const urban = fbm(x * 3.4, y * 3.4, seed + 12);
  const detail = hash2(x * 17 + seed, z * 17 - seed, seed + 21);
  const kind =
    overrideKind ?? resolveKind(cls, type, elev, moist, urban, detail);
  const { fill } = colorFor(kind, palette, elev);
  return { kind, fill, height: elev };
}

/** Mid-tone fill used for the opaque planet core under the hex crust. */
export function coreColorForPlanet(
  classification: PlanetClassification,
  _type?: PlanetType,
): string {
  return paletteFor(classification).low;
}

/** @deprecated Use coreColorForPlanet */
export function coreColorForType(type: PlanetType): string {
  void type;
  return CLASS_PALETTES.earthlike.low;
}
