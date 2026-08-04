import type { PlanetClassification } from "../types/campaign";
import { normalizePlanetClassification } from "./planetClass";
import {
  getPlanetVisualModel,
  rngFromSeed,
  type PlanetVisualModelId,
} from "./planetModels";

type Rgb = [number, number, number];

function clamp(n: number, a = 0, b = 255): number {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    clamp(Math.round(lerp(a[0], b[0], t))),
    clamp(Math.round(lerp(a[1], b[1], t))),
    clamp(Math.round(lerp(a[2], b[2], t))),
  ];
}

function mul(c: Rgb, s: number): Rgb {
  return [clamp(c[0] * s), clamp(c[1] * s), clamp(c[2] * s)];
}

/** Integer hash â†’ 0..1 (seamless when sampled on a lattice). */
function hash3(x: number, y: number, z: number, seed: number): number {
  let n =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(z | 0, 1442695041) +
    seed;
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise3(
  x: number,
  y: number,
  z: number,
  seed: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(x0, y0, z0, seed);
  const n100 = hash3(x0 + 1, y0, z0, seed);
  const n010 = hash3(x0, y0 + 1, z0, seed);
  const n110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const n001 = hash3(x0, y0, z0 + 1, seed);
  const n101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const n011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);

  const x00 = lerp(n000, n100, sx);
  const x10 = lerp(n010, n110, sx);
  const x01 = lerp(n001, n101, sx);
  const x11 = lerp(n011, n111, sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

/** Seamless fractal noise on the unit sphere (no UV wrap seam). */
function fbm3(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves = 5,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum +=
      amp *
      smoothNoise3(x * freq, y * freq, z * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
}

type Palette = {
  ocean: Rgb;
  oceanDeep: Rgb;
  coast: Rgb;
  landLow: Rgb;
  landMid: Rgb;
  landHigh: Rgb;
  forest: Rgb;
  rock: Rgb;
  ice: Rgb;
  cloud: Rgb;
  accent: Rgb;
  barren: Rgb;
};

const BASE_PALETTES: Record<PlanetClassification, Palette> = {
  ice: {
    ocean: [100, 145, 180],
    oceanDeep: [55, 95, 140],
    coast: [150, 185, 205],
    landLow: [185, 205, 220],
    landMid: [210, 225, 235],
    landHigh: [235, 245, 252],
    forest: [160, 180, 175],
    rock: [140, 155, 170],
    ice: [240, 248, 255],
    cloud: [220, 230, 240],
    accent: [160, 190, 220],
    barren: [150, 165, 180],
  },
  tundra: {
    ocean: [60, 100, 135],
    oceanDeep: [35, 60, 95],
    coast: [110, 130, 120],
    landLow: [120, 135, 115],
    landMid: [145, 150, 130],
    landHigh: [185, 195, 190],
    forest: [70, 100, 75],
    rock: [125, 120, 110],
    ice: [215, 225, 235],
    cloud: [200, 210, 220],
    accent: [95, 115, 85],
    barren: [115, 110, 95],
  },
  water: {
    ocean: [28, 95, 165],
    oceanDeep: [8, 40, 95],
    coast: [40, 140, 150],
    landLow: [55, 130, 70],
    landMid: [70, 145, 75],
    landHigh: [120, 150, 90],
    forest: [30, 100, 45],
    rock: [130, 120, 95],
    ice: [205, 225, 245],
    cloud: [235, 240, 250],
    accent: [45, 170, 190],
    barren: [155, 145, 115],
  },
  islands: {
    ocean: [20, 105, 160],
    oceanDeep: [6, 42, 95],
    coast: [50, 160, 140],
    landLow: [50, 150, 80],
    landMid: [70, 155, 70],
    landHigh: [115, 165, 85],
    forest: [25, 110, 50],
    rock: [160, 145, 100],
    ice: [215, 230, 245],
    cloud: [240, 245, 252],
    accent: [210, 185, 95],
    barren: [170, 155, 110],
  },
  jungle: {
    ocean: [18, 65, 115],
    oceanDeep: [6, 30, 65],
    coast: [35, 110, 80],
    landLow: [30, 95, 40],
    landMid: [40, 115, 45],
    landHigh: [75, 130, 55],
    forest: [18, 75, 28],
    rock: [85, 75, 50],
    ice: [200, 220, 235],
    cloud: [215, 235, 215],
    accent: [70, 140, 35],
    barren: [90, 80, 50],
  },
  earthlike: {
    ocean: [22, 78, 150],
    oceanDeep: [6, 32, 85],
    coast: [45, 145, 125],
    landLow: [55, 125, 55],
    landMid: [75, 140, 60],
    landHigh: [140, 145, 85],
    forest: [28, 95, 40],
    rock: [120, 105, 80],
    ice: [235, 245, 252],
    cloud: [245, 248, 255],
    accent: [165, 130, 70],
    barren: [145, 125, 90],
  },
  super_earth: {
    ocean: [18, 68, 135],
    oceanDeep: [5, 28, 75],
    coast: [40, 130, 110],
    landLow: [50, 115, 55],
    landMid: [70, 130, 58],
    landHigh: [120, 130, 75],
    forest: [25, 90, 38],
    rock: [100, 85, 65],
    ice: [225, 238, 248],
    cloud: [235, 242, 250],
    accent: [95, 75, 55],
    barren: [110, 95, 70],
  },
  desert: {
    ocean: [45, 90, 125],
    oceanDeep: [22, 55, 90],
    coast: [180, 160, 110],
    landLow: [210, 175, 105],
    landMid: [225, 190, 120],
    landHigh: [240, 215, 150],
    forest: [140, 130, 70],
    rock: [160, 120, 75],
    ice: [220, 230, 240],
    cloud: [245, 235, 215],
    accent: [190, 110, 55],
    barren: [175, 145, 95],
  },
  arid: {
    ocean: [50, 95, 130],
    oceanDeep: [25, 55, 90],
    coast: [165, 140, 95],
    landLow: [185, 145, 85],
    landMid: [205, 165, 100],
    landHigh: [220, 185, 120],
    forest: [110, 120, 60],
    rock: [145, 115, 80],
    ice: [210, 220, 230],
    cloud: [235, 228, 210],
    accent: [150, 95, 55],
    barren: [155, 125, 85],
  },
  savannah: {
    ocean: [32, 88, 140],
    oceanDeep: [14, 48, 90],
    coast: [140, 145, 80],
    landLow: [170, 155, 65],
    landMid: [150, 145, 55],
    landHigh: [125, 140, 55],
    forest: [70, 115, 45],
    rock: [130, 110, 70],
    ice: [215, 225, 235],
    cloud: [238, 238, 230],
    accent: [95, 115, 40],
    barren: [155, 135, 75],
  },
  swamp: {
    ocean: [40, 75, 65],
    oceanDeep: [20, 42, 42],
    coast: [55, 90, 55],
    landLow: [55, 80, 42],
    landMid: [65, 95, 48],
    landHigh: [80, 105, 55],
    forest: [40, 70, 35],
    rock: [75, 70, 50],
    ice: [190, 200, 200],
    cloud: [185, 205, 185],
    accent: [95, 115, 55],
    barren: [80, 70, 45],
  },
  volcanic: {
    ocean: [30, 40, 55],
    oceanDeep: [12, 18, 28],
    coast: [55, 45, 40],
    landLow: [65, 42, 38],
    landMid: [85, 50, 42],
    landHigh: [110, 65, 48],
    forest: [45, 55, 35],
    rock: [50, 40, 38],
    ice: [180, 190, 200],
    cloud: [85, 70, 70],
    accent: [255, 95, 35],
    barren: [48, 38, 38],
  },
  magma: {
    ocean: [18, 12, 12],
    oceanDeep: [8, 4, 4],
    coast: [50, 25, 18],
    landLow: [55, 28, 18],
    landMid: [75, 35, 22],
    landHigh: [95, 45, 28],
    forest: [40, 25, 15],
    rock: [35, 22, 18],
    ice: [160, 160, 170],
    cloud: [65, 40, 30],
    accent: [255, 150, 45],
    barren: [40, 22, 18],
  },
  toxic: {
    ocean: [48, 95, 32],
    oceanDeep: [22, 50, 14],
    coast: [70, 120, 45],
    landLow: [85, 125, 40],
    landMid: [110, 145, 48],
    landHigh: [145, 165, 55],
    forest: [60, 100, 30],
    rock: [75, 85, 40],
    ice: [180, 200, 160],
    cloud: [165, 210, 85],
    accent: [210, 255, 70],
    barren: [70, 80, 35],
  },
  barren: {
    ocean: [70, 74, 80],
    oceanDeep: [42, 46, 52],
    coast: [100, 95, 90],
    landLow: [125, 115, 105],
    landMid: [145, 135, 120],
    landHigh: [175, 165, 150],
    forest: [100, 105, 85],
    rock: [105, 100, 95],
    ice: [200, 205, 210],
    cloud: [165, 165, 170],
    accent: [100, 90, 80],
    barren: [115, 108, 98],
  },
  gas_giant: {
    ocean: [195, 155, 75],
    oceanDeep: [130, 95, 45],
    coast: [210, 175, 95],
    landLow: [215, 175, 95],
    landMid: [230, 195, 120],
    landHigh: [245, 220, 155],
    forest: [180, 120, 60],
    rock: [160, 110, 60],
    ice: [230, 230, 240],
    cloud: [255, 235, 190],
    accent: [185, 75, 40],
    barren: [160, 120, 70],
  },
  tidally_locked: {
    ocean: [22, 48, 95],
    oceanDeep: [6, 18, 45],
    coast: [60, 75, 100],
    landLow: [70, 78, 100],
    landMid: [95, 90, 95],
    landHigh: [130, 115, 100],
    forest: [45, 70, 55],
    rock: [55, 50, 60],
    ice: [200, 210, 230],
    cloud: [185, 195, 215],
    accent: [255, 185, 85],
    barren: [48, 42, 55],
  },
};

function shiftPalette(p: Palette, hueShift: number): Palette {
  const shift = (c: Rgb): Rgb => [
    clamp(c[0] + hueShift * 16),
    clamp(c[1] + hueShift * 7),
    clamp(c[2] - hueShift * 11),
  ];
  return {
    ocean: shift(p.ocean),
    oceanDeep: shift(p.oceanDeep),
    coast: shift(p.coast),
    landLow: shift(p.landLow),
    landMid: shift(p.landMid),
    landHigh: shift(p.landHigh),
    forest: shift(p.forest),
    rock: shift(p.rock),
    ice: shift(p.ice),
    cloud: shift(p.cloud),
    accent: shift(p.accent),
    barren: shift(p.barren),
  };
}

function landThreshold(
  classification: PlanetClassification,
  variant: number,
): number {
  const base: Record<PlanetClassification, number> = {
    ice: 0.52,
    tundra: 0.48,
    water: 0.7,
    islands: 0.66,
    jungle: 0.42,
    earthlike: 0.5,
    super_earth: 0.46,
    desert: 0.38,
    arid: 0.4,
    savannah: 0.44,
    swamp: 0.45,
    volcanic: 0.35,
    magma: 0.3,
    toxic: 0.42,
    barren: 0.28,
    gas_giant: 1,
    tidally_locked: 0.48,
  };
  return base[classification] + (variant - 1.5) * 0.035;
}

/** Fast first paint; upgraded after mount. */
export const PLANET_TEX_PREVIEW = 256;
/** Final albedo size â€” enough for ~380â€“760px display. */
export const PLANET_TEX_FULL = 512;
/** Clouds are soft; lower res is fine. */
export const PLANET_TEX_CLOUDS = 384;

type TexKind = "albedo" | "clouds";

const texCache = new Map<string, HTMLCanvasElement>();
const inflight = new Map<string, Promise<HTMLCanvasElement>>();

function cacheKey(
  kind: TexKind,
  classification: PlanetClassification,
  visualModelId: string,
  size: number,
): string {
  return `${kind}:${classification}:${visualModelId}:${size}`;
}

/**
 * Paint an equirectangular planet albedo (seamless via 3D sphere noise).
 */
export function paintPlanetTexture(
  canvas: HTMLCanvasElement,
  classification: PlanetClassification,
  visualModelId: PlanetVisualModelId,
  size = PLANET_TEX_FULL,
): HTMLCanvasElement {
  const cls = normalizePlanetClassification(classification);
  const model = getPlanetVisualModel(visualModelId);
  const variant = model?.variant ?? 0;
  const rng = rngFromSeed(visualModelId);
  const seed = Math.floor(rng() * 1e9);
  const hueShift = (variant - 1.5) * 0.35 + (rng() - 0.5) * 0.2;
  const pal = shiftPalette(BASE_PALETTES[cls], hueShift);
  const threshold = landThreshold(cls, variant);
  const landScale = 1.85 + variant * 0.28 + rng() * 0.35;
  const detailScale = 5.5 + variant * 1.1;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const isGas = cls === "gas_giant";
  const isMagma = cls === "magma" || cls === "volcanic";
  const isToxic = cls === "toxic";
  const isTidal = cls === "tidally_locked";
  const wet =
    cls === "water" ||
    cls === "islands" ||
    cls === "earthlike" ||
    cls === "super_earth" ||
    cls === "jungle" ||
    cls === "swamp";
  // Fewer octaves on small previews â€” looks nearly identical when upscaled.
  const detailBoost = size >= 480 ? 1 : 0;

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const lat = (v - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const pole = Math.abs(sinLat);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const lon = u * Math.PI * 2;
      const nx = cosLat * Math.cos(lon);
      const ny = sinLat;
      const nz = cosLat * Math.sin(lon);

      let rgb: Rgb;

      if (isGas) {
        const warp = fbm3(nx * 2.2, ny * 3.5, nz * 2.2, seed, 3 + detailBoost);
        const band =
          Math.sin(lat * (9 + variant * 2) + warp * 3.2) * 0.5 + 0.5;
        const storm = fbm3(nx * 5, ny * 3, nz * 5, seed + 9, 3 + detailBoost);
        rgb = mix(pal.oceanDeep, pal.landHigh, band);
        rgb = mix(
          rgb,
          pal.landMid,
          fbm3(nx * 1.5, ny * 8, nz * 1.5, seed + 2, 2) * 0.35,
        );
        if (storm > 0.68) rgb = mix(rgb, pal.accent, (storm - 0.68) * 2.4);
        if (storm > 0.8) rgb = mix(rgb, pal.cloud, (storm - 0.8) * 3.5);
        const shade =
          0.78 + 0.28 * fbm3(nx * 2, ny * 2, nz * 2, seed + 3, 2);
        rgb = mul(rgb, shade);
      } else {
        const n1 = fbm3(
          nx * landScale,
          ny * landScale,
          nz * landScale,
          seed,
          4 + detailBoost,
        );
        const n2 = fbm3(
          nx * detailScale,
          ny * detailScale,
          nz * detailScale,
          seed + 17,
          3 + detailBoost,
        );
        const elev = n1 * 0.72 + n2 * 0.28;
        const landMask = smoothstep(threshold - 0.045, threshold + 0.05, elev);
        const moisture = fbm3(nx * 3.2, ny * 3.2, nz * 3.2, seed + 41, 3);
        const micro = fbm3(nx * 14, ny * 14, nz * 14, seed + 77, 2);

        const depth = smoothstep(threshold, threshold - 0.35, elev);
        let water = mix(pal.ocean, pal.oceanDeep, depth);
        water = mix(
          water,
          pal.coast,
          smoothstep(threshold - 0.08, threshold, elev) * 0.55,
        );
        if (wet) {
          const sparkle = micro * 0.08;
          water = [
            clamp(water[0] + sparkle * 40),
            clamp(water[1] + sparkle * 50),
            clamp(water[2] + sparkle * 30),
          ];
        }

        const h = smoothstep(threshold, 0.92, elev);
        let land = mix(pal.landLow, pal.landMid, smoothstep(0, 0.45, h));
        land = mix(land, pal.landHigh, smoothstep(0.45, 1, h));
        if (wet || cls === "savannah" || cls === "tundra") {
          const forestAmt =
            smoothstep(0.35, 0.7, moisture) *
            (1 - smoothstep(0.55, 0.9, h)) *
            (cls === "jungle" ? 0.85 : 0.55);
          land = mix(land, pal.forest, forestAmt);
        }
        if (cls === "desert" || cls === "arid") {
          land = mix(land, pal.accent, micro * 0.35);
          land = mix(land, pal.rock, smoothstep(0.6, 1, h) * 0.4);
        } else {
          land = mix(land, pal.rock, smoothstep(0.7, 1, h) * 0.55);
          land = mix(land, pal.accent, (1 - moisture) * 0.12 * (1 - h));
        }
        const grain = 0.88 + micro * 0.22;
        land = mul(land, grain);
        const shade =
          0.82 +
          0.28 * fbm3(nx * 4.5 + 1.1, ny * 4.5, nz * 4.5 - 0.7, seed + 120, 2);
        land = mul(land, shade);

        if (cls === "barren" || cls === "volcanic") {
          const crater = fbm3(nx * 14, ny * 14, nz * 14, seed + 55, 3);
          if (crater > 0.74) land = mix(land, pal.barren, (crater - 0.74) * 3);
        }

        rgb = mix(water, land, landMask);

        if (isMagma) {
          const cracks = fbm3(
            nx * 11,
            ny * 11,
            nz * 11,
            seed + 88,
            3 + detailBoost,
          );
          const glow = smoothstep(0.58, 0.88, cracks);
          rgb = mix(rgb, pal.accent, glow * 0.85);
          rgb = mix(rgb, [255, 230, 140], smoothstep(0.78, 0.95, cracks) * 0.7);
        }

        if (isToxic) {
          const haze = fbm3(nx * 4, ny * 4, nz * 4, seed + 99, 3);
          rgb = mix(rgb, pal.accent, haze * 0.32);
        }

        const iceAmt =
          cls === "ice"
            ? 0.5 + pole * 0.55
            : cls === "tundra"
              ? Math.max(0, pole * 1.35 - 0.32)
              : wet || cls === "super_earth"
                ? Math.max(0, pole * 1.65 - 0.82)
                : 0;
        if (iceAmt > 0) {
          const iceNoise = fbm3(nx * 7, ny * 7, nz * 7, seed + 200, 2);
          rgb = mix(
            rgb,
            pal.ice,
            Math.min(1, iceAmt) * (0.75 + iceNoise * 0.25),
          );
        }

        if (isTidal) {
          const day = Math.cos(lon - Math.PI * 0.5) * 0.5 + 0.5;
          if (day > 0.55) rgb = mix(rgb, pal.accent, (day - 0.55) * 0.55);
          else if (day < 0.38) rgb = mix(rgb, [6, 8, 22], (0.38 - day) * 1.6);
        }
      }

      const i = (y * size + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Soft cloud overlay â€” 3D noise so no vertical wrap seam. */
export function paintCloudTexture(
  canvas: HTMLCanvasElement,
  classification: PlanetClassification,
  visualModelId: PlanetVisualModelId,
  size = PLANET_TEX_CLOUDS,
): HTMLCanvasElement {
  const cls = normalizePlanetClassification(classification);
  const model = getPlanetVisualModel(visualModelId);
  const variant = model?.variant ?? 0;
  const rng = rngFromSeed(`${visualModelId}:clouds`);
  const seed = Math.floor(rng() * 1e9);
  const density =
    cls === "gas_giant"
      ? 0.5
      : cls === "desert" || cls === "arid" || cls === "barren" || cls === "magma"
        ? 0.16
        : cls === "water" || cls === "jungle" || cls === "earthlike"
          ? 0.4 + variant * 0.03
          : 0.3;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const scale = 2.8 + variant * 0.35;
  const octaves = size >= 320 ? 4 : 3;

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const lat = (v - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const lon = u * Math.PI * 2;
      const nx = cosLat * Math.cos(lon);
      const ny = sinLat;
      const nz = cosLat * Math.sin(lon);
      const n = fbm3(nx * scale, ny * (scale * 1.15), nz * scale, seed, octaves);
      const wispy = fbm3(
        nx * scale * 2.2,
        ny * scale * 0.6,
        nz * scale * 2.2,
        seed + 5,
        2,
      );
      const combined = n * 0.7 + wispy * 0.3;
      const a =
        combined > 1 - density
          ? Math.min(200, ((combined - (1 - density)) / density) * 185)
          : 0;
      const i = (y * size + x) * 4;
      data[i] = 248;
      data[i + 1] = 250;
      data[i + 2] = 255;
      data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function buildCachedTexture(
  kind: TexKind,
  classification: PlanetClassification,
  visualModelId: string,
  size: number,
): HTMLCanvasElement {
  const key = cacheKey(kind, classification, visualModelId, size);
  const hit = texCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  if (kind === "albedo") {
    paintPlanetTexture(canvas, classification, visualModelId, size);
  } else {
    paintCloudTexture(canvas, classification, visualModelId, size);
  }
  texCache.set(key, canvas);
  if (texCache.size > 48) {
    const first = texCache.keys().next().value;
    if (first) texCache.delete(first);
  }
  return canvas;
}

/** Sync cached canvas (generates if missing). Shared â€” do not mutate. */
export function getPlanetAlbedoCanvas(
  classification: PlanetClassification,
  visualModelId: string,
  size: number,
): HTMLCanvasElement {
  return buildCachedTexture("albedo", classification, visualModelId, size);
}

export function getPlanetCloudCanvas(
  classification: PlanetClassification,
  visualModelId: string,
  size: number,
): HTMLCanvasElement {
  return buildCachedTexture("clouds", classification, visualModelId, size);
}

/**
 * Kick off texture generation in the background (e.g. on planet click).
 * Safe to call repeatedly; shares in-flight work.
 */
export function prefetchPlanetTextures(
  classification: PlanetClassification,
  visualModelId: string,
): void {
  const cls = normalizePlanetClassification(classification);
  const jobs: Array<[TexKind, number]> = [
    ["albedo", PLANET_TEX_PREVIEW],
    ["albedo", PLANET_TEX_FULL],
    ["clouds", PLANET_TEX_CLOUDS],
  ];
  for (const [kind, size] of jobs) {
    const key = cacheKey(kind, cls, visualModelId, size);
    if (texCache.has(key) || inflight.has(key)) continue;
    const promise = new Promise<HTMLCanvasElement>((resolve) => {
      const run = () => {
        const canvas = buildCachedTexture(kind, cls, visualModelId, size);
        inflight.delete(key);
        resolve(canvas);
      };
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 400 });
      } else {
        setTimeout(run, 0);
      }
    });
    inflight.set(key, promise);
  }
}

export function atmosphereColor(
  classification: PlanetClassification,
): string {
  switch (normalizePlanetClassification(classification)) {
    case "ice":
    case "tundra":
      return "#a8c8e8";
    case "water":
    case "islands":
      return "#4a9ad8";
    case "jungle":
    case "earthlike":
    case "super_earth":
      return "#6ab0e0";
    case "desert":
    case "arid":
    case "savannah":
      return "#e0c080";
    case "swamp":
      return "#6a8860";
    case "volcanic":
    case "magma":
      return "#e07040";
    case "toxic":
      return "#a0e040";
    case "gas_giant":
      return "#e8c070";
    case "tidally_locked":
      return "#8090c0";
    default:
      return "#9aa4b0";
  }
}
