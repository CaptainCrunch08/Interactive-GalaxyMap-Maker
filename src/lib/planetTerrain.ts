import type { PlanetType } from "../types/campaign";
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
  | "cloud";

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

const PALETTES: Record<PlanetType, Palette> = {
  hive: {
    low: "#1a1e24",
    mid: "#2c343c",
    high: "#4a5560",
    accent: "#c4a574",
    water: "#1a2830",
    haze: "rgba(180,190,200,0.18)",
  },
  forge: {
    low: "#1a1410",
    mid: "#3a2a1c",
    high: "#5a4030",
    accent: "#e07830",
    water: "#1c1814",
    haze: "rgba(220,140,60,0.14)",
  },
  agri: {
    low: "#1a2a18",
    mid: "#2f4a28",
    high: "#5a7a3a",
    accent: "#c8d878",
    water: "#1a3a48",
    haze: "rgba(200,220,180,0.16)",
  },
  death: {
    low: "#1a1010",
    mid: "#3a2020",
    high: "#5a3830",
    accent: "#a04030",
    water: "#201818",
    haze: "rgba(160,80,60,0.12)",
  },
  shrine: {
    low: "#16141e",
    mid: "#2a2438",
    high: "#4a4060",
    accent: "#d4c090",
    water: "#1a2030",
    haze: "rgba(200,190,230,0.16)",
  },
  custom: {
    low: "#121820",
    mid: "#243040",
    high: "#3a5060",
    accent: "#70b0c8",
    water: "#142838",
    haze: "rgba(140,180,200,0.14)",
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

function classify(
  type: PlanetType,
  elev: number,
  moist: number,
  urban: number,
  detail: number,
): TerrainKind {
  switch (type) {
    case "hive":
      if (elev < 0.28) return "ocean";
      if (urban > 0.72 || (urban > 0.55 && elev > 0.45)) return "hive";
      if (urban > 0.48) return "urban";
      if (detail > 0.78 && elev > 0.55) return "ruins";
      if (elev < 0.38) return "wasteland";
      return "ash";
    case "forge":
      if (elev < 0.22) return "toxic";
      if (urban > 0.62 || detail > 0.7) return "forge";
      if (elev > 0.7 && detail > 0.45) return "ash";
      if (moist < 0.35) return "wasteland";
      return "crater";
    case "agri":
      if (elev < 0.3) return "ocean";
      if (moist > 0.55 && elev < 0.65) return "agri";
      if (moist > 0.7) return "forest";
      if (elev > 0.75) return "wasteland";
      return "agri";
    case "death":
      if (elev < 0.25) return "toxic";
      if (detail > 0.75) return "crater";
      if (urban > 0.8) return "ruins";
      if (moist < 0.4) return "ash";
      return "wasteland";
    case "shrine":
      if (elev < 0.26) return "ocean";
      if (urban > 0.68 || detail > 0.72) return "shrine";
      if (elev > 0.7) return "ice";
      if (moist > 0.6) return "forest";
      return "ruins";
    default:
      if (elev < 0.32) return "ocean";
      if (urban > 0.7) return "urban";
      if (moist > 0.65) return "forest";
      if (detail > 0.8) return "crater";
      return "wasteland";
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

/**
 * Procedural terrain for a planet hex disk, stable per planet id + type.
 */
export function generatePlanetTerrain(
  cells: HexCoord[],
  planetId: string,
  type: PlanetType,
): TerrainCell[] {
  const seed = seedFromId(planetId);
  const palette = PALETTES[type];

  return cells.map(({ q, r }) => {
    const elev = fbm(q * 0.35, r * 0.35, seed);
    const moist = fbm(q * 0.28 + 40, r * 0.28 - 12, seed + 3);
    const urban = fbm(q * 0.45 - 8, r * 0.45 + 5, seed + 9);
    const detail = hexNoise(q + seed, r - seed);
    const kind = classify(type, elev, moist, urban, detail);
    const { fill, stroke, glow } = colorFor(kind, palette, elev);
    const haze =
      type === "forge" || type === "hive"
        ? 0.08 + moist * 0.22
        : type === "agri"
          ? 0.05 + moist * 0.15
          : 0.04 + moist * 0.12;

    return {
      q,
      r,
      kind,
      height: elev,
      fill,
      stroke,
      glow,
      haze,
    };
  });
}

export function terrainLegend(type: PlanetType): { kind: TerrainKind; label: string }[] {
  switch (type) {
    case "hive":
      return [
        { kind: "hive", label: "Hive stacks" },
        { kind: "urban", label: "Sprawl" },
        { kind: "wasteland", label: "Ash wastes" },
        { kind: "ocean", label: "Chem seas" },
      ];
    case "forge":
      return [
        { kind: "forge", label: "Manufactorum" },
        { kind: "ash", label: "Slag fields" },
        { kind: "toxic", label: "Refinery seas" },
        { kind: "crater", label: "Impact scars" },
      ];
    case "agri":
      return [
        { kind: "agri", label: "Agri belts" },
        { kind: "forest", label: "Sylvan tracts" },
        { kind: "ocean", label: "Reservoirs" },
        { kind: "wasteland", label: "Barren ridges" },
      ];
    case "death":
      return [
        { kind: "wasteland", label: "Deadlands" },
        { kind: "crater", label: "Kill zones" },
        { kind: "toxic", label: "Contaminated" },
        { kind: "ash", label: "Burned plains" },
      ];
    case "shrine":
      return [
        { kind: "shrine", label: "Reliquary" },
        { kind: "ruins", label: "Pilgrim ruins" },
        { kind: "ice", label: "High peaks" },
        { kind: "forest", label: "Sacred groves" },
      ];
    default:
      return [
        { kind: "wasteland", label: "Surface" },
        { kind: "urban", label: "Settlements" },
        { kind: "ocean", label: "Seas" },
        { kind: "forest", label: "Wilds" },
      ];
  }
}

export function legendSwatch(kind: TerrainKind, type: PlanetType): string {
  const palette = PALETTES[type];
  return colorFor(kind, palette, 0.55).fill;
}

/**
 * Sample procedural terrain at a unit-sphere direction (for 3D hex tiles).
 * Stable per planet id; biome mix driven by world class (planet type).
 */
export function sampleTerrainAtDirection(
  x: number,
  y: number,
  z: number,
  planetId: string,
  type: PlanetType,
): { kind: TerrainKind; fill: string; height: number } {
  const seed = seedFromId(planetId);
  const palette = PALETTES[type];
  // Multi-axis noise so continents wrap cleanly around the sphere
  const n1 = fbm(x * 2.8, y * 2.8, seed);
  const n2 = fbm(y * 2.6 + 11, z * 2.6, seed + 3);
  const n3 = fbm(z * 2.4 - 7, x * 2.4, seed + 9);
  const elev = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;
  const moist = fbm(x * 1.9 + 4, z * 1.9 - 2, seed + 5);
  const urban = fbm(x * 3.4, y * 3.4, seed + 12);
  const detail = hash2(x * 17 + seed, z * 17 - seed, seed + 21);
  const kind = classify(type, elev, moist, urban, detail);
  const { fill } = colorFor(kind, palette, elev);
  return { kind, fill, height: elev };
}

/** Mid-tone fill used for the opaque planet core under the hex crust. */
export function coreColorForType(type: PlanetType): string {
  return PALETTES[type].low;
}
