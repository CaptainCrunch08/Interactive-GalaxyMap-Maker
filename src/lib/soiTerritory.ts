import type { Campaign, Faction } from "../types/campaign";
import { campaignMapSize } from "../types/campaign";
import type { TerritoryBorder, TerritoryFill } from "./metaball";
import { getSystemOwnership } from "./territory";

type ClaimPaint = {
  id: string;
  color: string;
  kind: "owned" | "contested";
  stripeColors?: [string, string];
};

/**
 * Largest circle centered on a star that stays inside its Voronoi cell:
 * radius = half distance to the nearest other star (and the map frame).
 * Circles of mutual nearest neighbors meet at the midpoint — same topology
 * idea as clean sectors, but as circular as possible.
 */
const MEET = 0.5;

function contestedKey(factions: Faction[]): string {
  return [...factions.map((f) => f.id)].sort().join("|");
}

function claimPaintForOwnership(
  ownership: ReturnType<typeof getSystemOwnership>,
): ClaimPaint | null {
  if (ownership.status === "owned") {
    const faction = ownership.factions[0]!;
    return {
      id: faction.id,
      color: faction.color,
      kind: "owned",
    };
  }
  if (ownership.status === "contested") {
    const a = ownership.factions[0]!;
    const b = ownership.factions[1] ?? a;
    return {
      id: `contested:${contestedKey(ownership.factions)}`,
      color: a.color,
      kind: "contested",
      stripeColors: [
        a.color,
        ownership.factions.length > 1 ? b.color : "#3a4550",
      ],
    };
  }
  return null;
}

function circlePath(cx: number, cy: number, r: number): string {
  if (r < 1) return "";
  // Two half-arcs form a full circle (SVG).
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

export function buildSoiTerritories(campaign: Campaign): {
  fills: TerritoryFill[];
  borders: TerritoryBorder[];
} {
  const mapSize = campaignMapSize(campaign);
  const systems = campaign.systems;
  if (systems.length === 0) {
    return { fills: [], borders: [] };
  }

  const fillPaths = new Map<string, string>();
  const borderPaths = new Map<string, string>();
  const paintById = new Map<string, ClaimPaint>();

  for (let i = 0; i < systems.length; i++) {
    const system = systems[i]!;
    const paint = claimPaintForOwnership(
      getSystemOwnership(campaign, system.id),
    );
    if (!paint) continue;

    let nearest = Infinity;
    for (let j = 0; j < systems.length; j++) {
      if (i === j) continue;
      const other = systems[j]!;
      const d = Math.hypot(other.x - system.x, other.y - system.y);
      if (d < nearest) nearest = d;
    }

    // Meet map frame halfway so edge SOIs stay circular against the border.
    const toBorder = Math.min(
      system.x,
      system.y,
      mapSize - system.x,
      mapSize - system.y,
    );

    let r = toBorder;
    if (Number.isFinite(nearest)) {
      r = Math.min(r, nearest * MEET);
    }
    if (r < 2) continue;

    const path = circlePath(system.x, system.y, r);
    if (!path) continue;

    paintById.set(paint.id, paint);
    fillPaths.set(paint.id, `${fillPaths.get(paint.id) ?? ""}${path}`);
    borderPaths.set(paint.id, `${borderPaths.get(paint.id) ?? ""}${path}`);
  }

  const fills: TerritoryFill[] = [];
  for (const [id, path] of fillPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    fills.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  const borders: TerritoryBorder[] = [];
  for (const [id, path] of borderPaths) {
    const paint = paintById.get(id);
    if (!paint || !path) continue;
    borders.push({
      id,
      color: paint.color,
      path,
      kind: paint.kind,
      stripeColors: paint.stripeColors,
    });
  }

  return { fills, borders };
}
