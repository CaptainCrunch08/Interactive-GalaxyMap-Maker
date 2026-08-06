import type { PlanetClassification, PlanetType } from "../types/campaign";
import { normalizePlanetClassification } from "./planetClass";
import { hexNoise, type HexCoord } from "./hex";

export type TerrainKind =
  | "wasteland"
  | "crater"
  | "urban"
  | "agri"
  | "forest"
  | "ocean"
  | "toxic"
  | "ice"
  | "desert"
  | "swamp"
  | "lava"
  | "tundra"
  | "savanna"
  | "jungle";

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
    low: "#121816",
    mid: "#4a5e54",
    high: "#7a9088",
    accent: "#a06a42",
    water: "#0d1117",
    haze: "rgba(90,100,78,0.2)",
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
    low: "#080c18",
    mid: "#6a4830",
    high: "#d0a060",
    accent: "#e86828",
    water: "#102038",
    haze: "rgba(200,140,70,0.2)",
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

/**
 * Fixed fill colors per terrain kind — same on every world so a forest hex
 * always reads as forest, an ocean hex as ocean, etc.
 */
const TERRAIN_KIND_BASE: Record<
  TerrainKind,
  { fill: string; stroke: string; glow?: string }
> = {
  ocean: {
    fill: "#1a5a88",
    stroke: "rgba(100,170,210,0.3)",
  },
  forest: {
    fill: "#1f5530",
    stroke: "rgba(80,150,95,0.32)",
  },
  jungle: {
    fill: "#145028",
    stroke: "rgba(60,160,90,0.35)",
    glow: "rgba(40,120,60,0.1)",
  },
  agri: {
    fill: "#5a9038",
    stroke: "rgba(150,190,90,0.3)",
  },
  savanna: {
    fill: "#a89040",
    stroke: "rgba(200,180,90,0.3)",
  },
  desert: {
    fill: "#c9a35a",
    stroke: "rgba(210,180,110,0.3)",
  },
  wasteland: {
    fill: "#6a6560",
    stroke: "rgba(150,148,145,0.25)",
  },
  tundra: {
    fill: "#7a8a88",
    stroke: "rgba(160,180,185,0.3)",
  },
  ice: {
    fill: "#c8dcec",
    stroke: "rgba(190,220,240,0.35)",
  },
  swamp: {
    fill: "#3a5030",
    stroke: "rgba(100,140,80,0.3)",
  },
  crater: {
    fill: "#4a4038",
    stroke: "rgba(120,100,85,0.35)",
  },
  lava: {
    fill: "#c03018",
    stroke: "rgba(255,90,40,0.45)",
    glow: "rgba(255,70,25,0.28)",
  },
  toxic: {
    fill: "#3a4a42",
    stroke: "rgba(160,106,66,0.32)",
    glow: "rgba(80,90,70,0.12)",
  },
  urban: {
    fill: "#5a6068",
    stroke: "rgba(170,180,190,0.32)",
  },
};

/** Classifications that need continent-scale land/sea masks. */
function usesContinentalScale(cls: PlanetClassification): boolean {
  return (
    cls === "earthlike" ||
    cls === "super_earth" ||
    cls === "water" ||
    cls === "islands" ||
    cls === "jungle" ||
    cls === "tidally_locked"
  );
}

/** Primary biome from climate classification. */
function classifyClimate(
  classification: PlanetClassification,
  elev: number,
  moist: number,
  detail: number,
  dayFac = 0.5,
): TerrainKind {
  switch (classification) {
    case "ice":
      if (elev < 0.22) return "ocean";
      if (detail > 0.82) return "crater";
      return "ice";
    case "tundra":
      if (elev < 0.28) return "ocean";
      if (elev > 0.72) return "ice";
      if (moist > 0.55) return "swamp";
      return "tundra";
    case "water":
      // Ocean world with scattered island chains
      if (elev < 0.62) return "ocean";
      if (elev < 0.72) return moist > 0.45 ? "forest" : "agri";
      if (elev > 0.88) return "wasteland";
      return moist > 0.5 ? "forest" : "agri";
    case "islands":
      if (elev < 0.52) return "ocean";
      if (elev < 0.58) return moist > 0.5 ? "swamp" : "agri";
      if (moist > 0.55) return "jungle";
      if (elev > 0.82) return "wasteland";
      return "agri";
    case "jungle":
      if (elev < 0.32) return "ocean";
      if (elev < 0.4) return "swamp";
      if (moist > 0.25) return "jungle";
      if (detail > 0.8) return "swamp";
      return "jungle";
    case "earthlike":
    case "super_earth":
      // Earth-like: large oceans + continental interiors
      if (elev < 0.46) return "ocean";
      if (elev < 0.52) {
        // Shelves / coasts
        if (moist > 0.6) return "swamp";
        return "agri";
      }
      if (elev > 0.86) return moist < 0.4 ? "tundra" : "ice";
      if (elev > 0.78) return "tundra";
      if (moist < 0.28 && elev > 0.55) return "desert";
      if (moist > 0.72 && elev < 0.72) return "jungle";
      if (moist > 0.58) return "forest";
      if (moist > 0.4) return "savanna";
      return "wasteland";
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
      if (moist > 0.7) return "forest";
      if (moist > 0.55) return "agri";
      return "savanna";
    case "swamp":
      if (elev < 0.35) return "ocean";
      if (moist > 0.4) return "swamp";
      if (detail > 0.75) return "toxic";
      return "jungle";
    case "volcanic":
      if (elev < 0.22) return "lava";
      if (detail > 0.7) return "wasteland";
      if (elev > 0.7) return "crater";
      return "wasteland";
    case "magma":
      if (elev < 0.4 || detail > 0.55) return "lava";
      if (detail > 0.35) return "wasteland";
      return "crater";
    case "toxic":
      if (elev < 0.32) return "toxic";
      if (detail > 0.68) return "urban";
      if (detail > 0.52) return "wasteland";
      if (moist > 0.55) return "swamp";
      return "wasteland";
    case "barren":
      if (elev < 0.2) return "crater";
      if (detail > 0.72) return "crater";
      if (elev > 0.75) return "wasteland";
      return "wasteland";
    case "gas_giant":
      if (detail > 0.65) return "wasteland";
      if (elev > 0.55) return "toxic";
      return "wasteland";
    case "tidally_locked":
      // Scorched day hemisphere vs frozen night, thin twilight belt.
      if (dayFac > 0.6) {
        if (elev < 0.2 && detail > 0.5) return "lava";
        if (detail > 0.68) return "wasteland";
        return "desert";
      }
      if (dayFac < 0.4) {
        if (detail > 0.85) return "crater";
        return "ice";
      }
      if (elev < 0.38) return "ocean";
      if (moist > 0.52) return "jungle";
      if (moist > 0.35) return "savanna";
      return "wasteland";
    default:
      if (elev < 0.42) return "ocean";
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
      if (urban > 0.72 || (urban > 0.55 && elev > 0.42)) return "urban";
      if (urban > 0.48) return "urban";
      if (detail > 0.82 && elev > 0.5) return "wasteland";
      return climate;
    case "forge":
      if (urban > 0.58 || detail > 0.68) return "urban";
      if (elev > 0.72 && detail > 0.4) return "wasteland";
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
        if (detail > 0.75) return "savanna";
      }
      return climate;
    case "death":
      if (detail > 0.78) return "crater";
      if (urban > 0.82) return "wasteland";
      if (climate === "forest" || climate === "agri" || climate === "jungle") {
        return "wasteland";
      }
      return climate;
    case "shrine":
      if (urban > 0.65 || detail > 0.74) return "urban";
      if (detail > 0.6 && climate !== "ocean") return "wasteland";
      return climate;
    case "feudal":
      if (urban > 0.7) return "urban";
      if (detail > 0.78 && climate !== "ocean") return "wasteland";
      if (
        climate === "agri" ||
        climate === "forest" ||
        climate === "savanna"
      ) {
        return climate;
      }
      return climate;
    case "fortress":
      if (urban > 0.55 || detail > 0.65) return "urban";
      if (detail > 0.72) return "crater";
      if (climate === "forest" || climate === "agri" || climate === "jungle") {
        return "wasteland";
      }
      return climate;
    case "homeworld":
      if (urban > 0.68) return "urban";
      if (urban > 0.5 && elev > 0.4) return "urban";
      if (detail > 0.8) return "forest";
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
  height: number,
): { fill: string; stroke: string; glow?: string } {
  const base = TERRAIN_KIND_BASE[kind] ?? TERRAIN_KIND_BASE.wasteland;
  // Mild elevation shading only — hue stays locked to the terrain kind.
  const shadeAmt =
    kind === "ocean"
      ? height * 0.35 - 0.12
      : kind === "ice" || kind === "tundra"
        ? height * 0.2 - 0.05
        : height * 0.28 - 0.1;
  return {
    fill: shade(base.fill, shadeAmt),
    stroke: base.stroke,
    glow: base.glow,
  };
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
  classification?: PlanetClassification,
): { elev: number; moist: number; urban: number; detail: number } {
  const cls = classification
    ? normalizePlanetClassification(classification)
    : "earthlike";
  let elev: number;
  if (usesContinentalScale(cls)) {
    // Low-frequency landmasses + lighter high-frequency relief
    const continent =
      fbm(q * 0.11, r * 0.11, seed) * 0.55 +
      fbm(q * 0.18 + 9, r * 0.18 - 5, seed + 2) * 0.45;
    const relief = fbm(q * 0.4, r * 0.4, seed + 7);
    elev = continent * 0.78 + relief * 0.22;
    // Water worlds: bias elevation downward so seas dominate
    if (cls === "water") elev = elev * 0.72 + 0.08;
    // Island worlds: slightly more ocean
    if (cls === "islands") elev = elev * 0.88 + 0.04;
  } else {
    elev = fbm(q * 0.35, r * 0.35, seed);
  }
  return {
    elev,
    moist: fbm(q * 0.22 + 40, r * 0.22 - 12, seed + 3),
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
  dayFac = 0.5,
): TerrainKind {
  const climate = classifyClimate(
    classification,
    elev,
    moist,
    detail,
    dayFac,
  );
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

  return cells.map(({ q, r }) => {
    const { elev, moist, urban, detail } = sampleFields(q, r, seed, cls);
    const dayFac =
      cls === "tidally_locked"
        ? Math.max(0, Math.min(1, 0.5 + Math.tanh(q * 0.14) * 0.5))
        : 0.5;
    const kind = resolveKind(cls, type, elev, moist, urban, detail, dayFac);
    const { fill, stroke, glow } = colorFor(kind, elev);
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
      { kind: "tundra", label: "Tundra" },
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
      { kind: "jungle", label: "Isle jungles" },
      { kind: "agri", label: "Shore belts" },
      { kind: "wasteland", label: "Ridges" },
    ],
    jungle: [
      { kind: "jungle", label: "Canopy" },
      { kind: "swamp", label: "Wetlands" },
      { kind: "ocean", label: "Rivers / lakes" },
      { kind: "wasteland", label: "Clearings" },
    ],
    earthlike: [
      { kind: "ocean", label: "Oceans" },
      { kind: "agri", label: "Plains" },
      { kind: "forest", label: "Woodlands" },
      { kind: "savanna", label: "Savanna" },
      { kind: "jungle", label: "Rainforest" },
      { kind: "tundra", label: "Highlands" },
    ],
    super_earth: [
      { kind: "ocean", label: "Oceans" },
      { kind: "agri", label: "Vast plains" },
      { kind: "jungle", label: "Deep forests" },
      { kind: "tundra", label: "Massifs" },
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
      { kind: "savanna", label: "Steppe" },
      { kind: "ocean", label: "Dry seas" },
    ],
    savannah: [
      { kind: "savanna", label: "Grass plains" },
      { kind: "agri", label: "Pasture" },
      { kind: "forest", label: "Gallery woods" },
      { kind: "ocean", label: "Seasonal lakes" },
    ],
    swamp: [
      { kind: "swamp", label: "Mires" },
      { kind: "jungle", label: "Mangrove" },
      { kind: "ocean", label: "Brackish water" },
      { kind: "toxic", label: "Fens" },
    ],
    volcanic: [
      { kind: "wasteland", label: "Ash fields" },
      { kind: "lava", label: "Lava flows" },
      { kind: "crater", label: "Calderas" },
      { kind: "desert", label: "Scoria" },
    ],
    magma: [
      { kind: "lava", label: "Magma seas" },
      { kind: "wasteland", label: "Cinder plains" },
      { kind: "crater", label: "Rifts" },
      { kind: "desert", label: "Basalt" },
    ],
    toxic: [
      { kind: "toxic", label: "Chem spills" },
      { kind: "urban", label: "Industry belts" },
      { kind: "wasteland", label: "Soot plains" },
      { kind: "swamp", label: "Bleached crust" },
    ],
    barren: [
      { kind: "wasteland", label: "Regolith" },
      { kind: "crater", label: "Craters" },
      { kind: "desert", label: "Dust seas" },
      { kind: "tundra", label: "Cold flats" },
    ],
    gas_giant: [
      { kind: "wasteland", label: "Banded haze" },
      { kind: "toxic", label: "Storm belts" },
      { kind: "desert", label: "Deep layers" },
      { kind: "urban", label: "Float platforms" },
    ],
    tidally_locked: [
      { kind: "desert", label: "Scorched day" },
      { kind: "lava", label: "Bake plains" },
      { kind: "ice", label: "Eternal night" },
      { kind: "ocean", label: "Twilight seas" },
      { kind: "jungle", label: "Terminator belt" },
    ],
  };

  const base = climateLegend[cls];
  const typeExtra: { kind: TerrainKind; label: string }[] = [];
  switch (type) {
    case "hive":
      typeExtra.push({ kind: "urban", label: "Hive sprawl" });
      break;
    case "forge":
      typeExtra.push(
        { kind: "urban", label: "Manufactorum" },
        { kind: "wasteland", label: "Slag fields" },
      );
      break;
    case "agri":
      typeExtra.push(
        { kind: "agri", label: "Agri belts" },
        { kind: "savanna", label: "Pasture" },
      );
      break;
    case "death":
      typeExtra.push(
        { kind: "crater", label: "Kill zones" },
        { kind: "wasteland", label: "Dead ground" },
      );
      break;
    case "shrine":
      typeExtra.push(
        { kind: "urban", label: "Reliquary" },
        { kind: "forest", label: "Sacred groves" },
      );
      break;
    case "feudal":
      typeExtra.push(
        { kind: "agri", label: "Fiefs" },
        { kind: "urban", label: "Keeps" },
      );
      break;
    case "fortress":
      typeExtra.push(
        { kind: "crater", label: "Kill zones" },
        { kind: "urban", label: "Citadels" },
        { kind: "wasteland", label: "Parade grounds" },
      );
      break;
    case "homeworld":
      typeExtra.push(
        { kind: "urban", label: "Seat cities" },
        { kind: "forest", label: "Ancestral woods" },
        { kind: "agri", label: "Heartland" },
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
  _classification?: PlanetClassification,
): string {
  return colorFor(kind, 0.55).fill;
}

export const TERRAIN_KIND_LABELS: Record<TerrainKind, string> = {
  wasteland: "Wasteland",
  crater: "Crater",
  urban: "Urban",
  agri: "Agri",
  forest: "Forest",
  jungle: "Jungle",
  ocean: "Ocean",
  toxic: "Chem spill",
  ice: "Ice",
  desert: "Desert",
  swamp: "Swamp",
  lava: "Lava",
  tundra: "Tundra",
  savanna: "Savanna",
};

export const TERRAIN_KIND_ORDER: TerrainKind[] = [
  "ocean",
  "ice",
  "tundra",
  "swamp",
  "jungle",
  "forest",
  "savanna",
  "agri",
  "desert",
  "wasteland",
  "crater",
  "urban",
  "lava",
  "toxic",
];

/** Map legacy / unknown painted biomes onto the current TerrainKind set. */
const LEGACY_TERRAIN: Record<string, TerrainKind> = {
  hive: "urban",
  forge: "urban",
  ash: "wasteland",
  shrine: "urban",
  ruins: "wasteland",
  cloud: "wasteland",
  savannah: "savanna",
};

export function isTerrainKind(value: unknown): value is TerrainKind {
  return (
    typeof value === "string" &&
    (TERRAIN_KIND_ORDER as string[]).includes(value)
  );
}

export function normalizeTerrainKind(value: unknown): TerrainKind | null {
  if (value == null || value === "") return null;
  if (isTerrainKind(value)) return value;
  if (typeof value === "string" && value in LEGACY_TERRAIN) {
    return LEGACY_TERRAIN[value]!;
  }
  return null;
}

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
  let elev: number;
  if (usesContinentalScale(cls)) {
    // Continent-scale noise on the sphere (low frequency)
    const continent =
      fbm(x * 1.05, y * 1.05, seed) * 0.5 +
      fbm(y * 0.95 + 4, z * 0.95, seed + 2) * 0.3 +
      fbm(z * 1.0 - 3, x * 1.0, seed + 5) * 0.2;
    const relief =
      fbm(x * 3.2, y * 3.2, seed + 8) * 0.55 +
      fbm(y * 2.8 + 11, z * 2.8, seed + 11) * 0.45;
    elev = continent * 0.76 + relief * 0.24;
    if (cls === "water") elev = elev * 0.7 + 0.06;
    if (cls === "islands") elev = elev * 0.86 + 0.05;
  } else {
    const n1 = fbm(x * 2.8, y * 2.8, seed);
    const n2 = fbm(y * 2.6 + 11, z * 2.6, seed + 3);
    const n3 = fbm(z * 2.4 - 7, x * 2.4, seed + 9);
    elev = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;
  }
  const moist = fbm(x * 1.6 + 4, z * 1.6 - 2, seed + 5);
  const urban = fbm(x * 3.4, y * 3.4, seed + 12);
  const detail = hash2(x * 17 + seed, z * 17 - seed, seed + 21);
  // Match globe albedo: +Z scorched day, −Z frozen night.
  const dayFac =
    cls === "tidally_locked"
      ? Math.max(0, Math.min(1, 0.5 + 0.5 * z))
      : 0.5;
  const normalizedOverride = normalizeTerrainKind(overrideKind);
  const kind =
    normalizedOverride ??
    resolveKind(cls, type, elev, moist, urban, detail, dayFac);
  const { fill } = colorFor(kind, elev);
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
