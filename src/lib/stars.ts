import type { StarClass } from "../types/campaign";
import { STAR_CLASS_LABELS, STAR_CLASS_ORDER } from "../types/campaign";

export type StarAppearance = {
  /** Core / mid glow color for the star body. */
  color: string;
  /** Hot highlight in the radial gradient. */
  highlight: string;
  /** Outer corona / rim (esp. black holes). */
  corona: string;
  /** Galaxy-map diameter in px. */
  galaxySize: number;
  /** System-view diameter in px. */
  systemSize: number;
  shortLabel: string;
};

const APPEARANCE: Record<StarClass, StarAppearance> = {
  O: {
    color: "#6b8cff",
    highlight: "#e8eeff",
    corona: "#4c6fff",
    galaxySize: 22,
    systemSize: 56,
    shortLabel: "O",
  },
  B: {
    color: "#8eabff",
    highlight: "#f0f4ff",
    corona: "#6b8cff",
    galaxySize: 20,
    systemSize: 52,
    shortLabel: "B",
  },
  A: {
    color: "#f0f2ff",
    highlight: "#ffffff",
    corona: "#c8d0ff",
    galaxySize: 18,
    systemSize: 50,
    shortLabel: "A",
  },
  F: {
    color: "#ffe9c4",
    highlight: "#fff8ec",
    corona: "#ffd89a",
    galaxySize: 18,
    systemSize: 48,
    shortLabel: "F",
  },
  G: {
    color: "#f5c542",
    highlight: "#fff4c8",
    corona: "#e8a317",
    galaxySize: 18,
    systemSize: 48,
    shortLabel: "G",
  },
  K: {
    color: "#f59e0b",
    highlight: "#ffd8a0",
    corona: "#d97706",
    galaxySize: 17,
    systemSize: 46,
    shortLabel: "K",
  },
  M: {
    color: "#ef4444",
    highlight: "#fecaca",
    corona: "#b91c1c",
    galaxySize: 14,
    systemSize: 40,
    shortLabel: "M",
  },
  white_dwarf: {
    color: "#e8f0ff",
    highlight: "#ffffff",
    corona: "#a8c4ff",
    galaxySize: 11,
    systemSize: 30,
    shortLabel: "WD",
  },
  neutron: {
    color: "#c4b5fd",
    highlight: "#f5f3ff",
    corona: "#8b5cf6",
    galaxySize: 12,
    systemSize: 34,
    shortLabel: "N",
  },
  pulsar: {
    color: "#22d3ee",
    highlight: "#ecfeff",
    corona: "#0891b2",
    galaxySize: 12,
    systemSize: 34,
    shortLabel: "P",
  },
  black_hole: {
    color: "#0a0a12",
    highlight: "#1a1520",
    corona: "#f97316",
    galaxySize: 16,
    systemSize: 44,
    shortLabel: "BH",
  },
};

/** Relative weights for procedural / random picks (M & K common, exotics rare). */
const WEIGHTS: Record<StarClass, number> = {
  O: 2,
  B: 4,
  A: 8,
  F: 12,
  G: 18,
  K: 20,
  M: 28,
  white_dwarf: 8,
  neutron: 2,
  pulsar: 2,
  black_hole: 2,
};

export function isStarClass(value: unknown): value is StarClass {
  return (
    typeof value === "string" &&
    (STAR_CLASS_ORDER as string[]).includes(value)
  );
}

export function normalizeStarClass(value: unknown): StarClass {
  return isStarClass(value) ? value : "G";
}

export function starAppearance(starClass: StarClass | undefined): StarAppearance {
  return APPEARANCE[normalizeStarClass(starClass)];
}

export function pickRandomStarClass(rng: () => number = Math.random): StarClass {
  let total = 0;
  for (const c of STAR_CLASS_ORDER) total += WEIGHTS[c];
  let roll = rng() * total;
  for (const c of STAR_CLASS_ORDER) {
    roll -= WEIGHTS[c];
    if (roll <= 0) return c;
  }
  return "G";
}

/** Core stars preferred inside a power megastructure (Dyson / black hole bomb). */
const DYSON_CORE_WEIGHTS: Partial<Record<StarClass, number>> = {
  O: 8,
  B: 10,
  A: 8,
  F: 10,
  G: 14,
  K: 10,
  M: 6,
  white_dwarf: 6,
  neutron: 8,
  pulsar: 8,
  black_hole: 18,
};

export function pickDysonCoreStarClass(
  rng: () => number = Math.random,
): StarClass {
  const entries = Object.entries(DYSON_CORE_WEIGHTS) as [StarClass, number][];
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [c, w] of entries) {
    roll -= w;
    if (roll <= 0) return c;
  }
  return "G";
}

/** True when the megastructure is a Press–Teukolsky black hole bomb. */
export function isBlackHoleBomb(system: {
  starClass?: StarClass;
  dysonSphere?: boolean;
}): boolean {
  return (
    Boolean(system.dysonSphere) &&
    normalizeStarClass(system.starClass) === "black_hole"
  );
}

/** Short map badge: BHB (bomb) or DS (Dyson). */
export function megastructureShortLabel(system: {
  starClass?: StarClass;
  dysonSphere?: boolean;
}): string | null {
  if (!system.dysonSphere) return null;
  return isBlackHoleBomb(system) ? "BHB" : "DS";
}

/** Display label for a system star, including power megastructure when present. */
export function starSystemLabel(system: {
  starClass?: StarClass;
  dysonSphere?: boolean;
}): string {
  const core = STAR_CLASS_LABELS[normalizeStarClass(system.starClass)];
  if (!system.dysonSphere) return core;
  if (isBlackHoleBomb(system)) return `Black Hole Bomb · ${core}`;
  return `Dyson Sphere · ${core}`;
}

/** UI name for the warp-power megastructure around this core. */
export function megastructureName(system: {
  starClass?: StarClass;
  dysonSphere?: boolean;
}): string {
  if (normalizeStarClass(system.starClass) === "black_hole") {
    return "Black Hole Bomb";
  }
  return "Dyson Sphere";
}

export function starBodyGradient(starClass: StarClass | undefined): string {
  const a = starAppearance(starClass);
  if (normalizeStarClass(starClass) === "black_hole") {
    return `radial-gradient(circle at 50% 50%, ${a.highlight} 0%, ${a.color} 42%, ${a.corona} 58%, ${a.color} 72%, #000 100%)`;
  }
  return `radial-gradient(circle at 35% 35%, ${a.highlight}, ${a.color} 55%, ${a.corona})`;
}

export function starGlowShadow(
  starClass: StarClass | undefined,
  selected = false,
): string {
  const a = starAppearance(starClass);
  const cls = normalizeStarClass(starClass);
  if (cls === "black_hole") {
    return selected
      ? `0 0 18px ${a.corona}aa, 0 0 4px ${a.corona}`
      : `0 0 12px ${a.corona}77, 0 0 3px ${a.corona}`;
  }
  return selected
    ? `0 0 24px ${a.color}88, 0 0 4px ${a.color}`
    : `0 0 14px ${a.color}88, 0 0 4px ${a.color}`;
}
