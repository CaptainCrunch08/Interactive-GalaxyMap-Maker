import type { Campaign, Planet, PlanetType } from "../types/campaign";
import { planetTypeDisplayLabel } from "../types/campaign";
import { armyStrength } from "./battleResolve";
import {
  getPlanetOwnership,
  planetOwnershipLabel,
  withLivePlanetOwner,
} from "./territory";

export type PlanetControlKind = "faction" | "contested" | "unclaimed";

export type PlanetOverviewCard = {
  planetId: string;
  name: string;
  systemName: string;
  systemId: string;
  /** Footer classification (Hive World, Forge World, …). */
  classification: string;
  planetType: PlanetType;
  description: string;
  /** 0–100 defensive / strategic strength of the world itself. */
  strength: number;
  controlKind: PlanetControlKind;
  /** Faction name, "Contested", or "Unclaimed". */
  controlLabel: string;
  /** Accent for border / faction badge (faction color or neutral). */
  accent: string;
};

const NEUTRAL = "#8a96a4";

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * World strength: garrisons, fortifications, industry, settlements;
 * ruins and devastation pull the score down.
 *
 * Scoring (clamped 0–100):
 * - Base 18 (+ type bonus: hive 22, forge 20, death 16, shrine 12, agri 10, …)
 * - Each detachment: +14 × (army STR% / 100)
 * - Structures: trench +16, outpost +9, space port +11, ore mine +8,
 *   ruins −12, other +4
 * - Cities +6 each; districts +4; bastion district +5; ruins district −4
 * - Tile claims: up to +12 (0.25 each)
 * - Building points: up to +15 (BP / 50)
 * - Each logged battle: −2
 * - Asteroid belts: flat 5
 */
export function computePlanetStrength(planet: Planet): number {
  if (planet.type === "asteroid_belt") return 5;
  if (planet.type === "warp_gate") {
    let score = 45;
    for (const army of planet.armies ?? []) {
      score += 14 * (armyStrength(army) / 100);
    }
    for (const st of planet.structures ?? []) {
      if (st.kind === "relay_crown") score += 20;
      else score += 6;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  let score = 18;
  const typeBonus: Partial<Record<PlanetType, number>> = {
    hive: 22,
    forge: 20,
    shrine: 12,
    agri: 10,
    death: 16,
    feudal: 12,
    fortress: 24,
    homeworld: 20,
    trade: 16,
    mining: 14,
    archaeological: 12,
    abandoned_colony: 10,
    custom: 8,
  };
  score += typeBonus[planet.type] ?? 0;

  for (const army of planet.armies ?? []) {
    score += 14 * (armyStrength(army) / 100);
  }

  for (const st of planet.structures ?? []) {
    if (st.kind === "trench_line") score += 16;
    else if (st.kind === "outpost") score += 9;
    else if (st.kind === "space_port") score += 11;
    else if (st.kind === "ore_mine") score += 8;
    else if (st.kind === "ruins_site") score -= 12;
    else score += 4;
  }

  for (const city of planet.cities ?? []) {
    score += 6;
    score += city.districts.length * 4;
    for (const d of city.districts) {
      if (d.kind === "bastion") score += 5;
      if (d.kind === "ruins") score -= 4;
    }
  }
  for (const d of planet.independentDistricts ?? []) {
    score += 4;
    if (d.kind === "bastion") score += 5;
    if (d.kind === "ruins") score -= 4;
  }

  const claims = Object.keys(planet.tileClaims ?? {}).length;
  score += Math.min(12, claims * 0.25);

  let bp = 0;
  for (const v of Object.values(planet.buildingPoints ?? {})) bp += v;
  score += Math.min(15, bp / 50);

  score -= (planet.battles ?? []).length * 2;

  return clamp(score);
}

function defaultDescription(
  planet: Planet,
  ownership: ReturnType<typeof getPlanetOwnership>,
  systemName: string,
): string {
  const type = planetTypeDisplayLabel(planet);
  if (ownership.status === "contested") {
    return `City control is split on ${planet.name}. Front lines shift across this ${type.toLowerCase()} as reinforcements pour in.`;
  }
  if (ownership.status === "owned") {
    const n = (planet.armies ?? []).length;
    const garrison =
      n > 0
        ? `${n} detachment${n === 1 ? "" : "s"} hold the surface.`
        : "Garrison strength is thin.";
    return `${ownership.factions[0].name} maintains this ${type.toLowerCase()} in the ${systemName}. ${garrison}`;
  }
  return `Unclaimed ${type.toLowerCase()} in the ${systemName}. No permanent banner flies here yet.`;
}

function truncate(text: string, max = 160): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function buildPlanetOverviewCard(
  campaign: Campaign,
  planet: Planet,
): PlanetOverviewCard {
  const live = withLivePlanetOwner(planet);
  const system = campaign.systems.find((s) => s.id === live.systemId);
  const systemName = system?.name ?? "Unknown System";
  const ownership = getPlanetOwnership(campaign, live);

  let controlKind: PlanetControlKind;
  let controlLabel: string;
  let accent: string;

  if (ownership.status === "contested") {
    controlKind = "contested";
    controlLabel = planetOwnershipLabel(ownership);
    accent = NEUTRAL;
  } else if (ownership.status === "owned") {
    controlKind = "faction";
    controlLabel = ownership.factions[0].name;
    accent = ownership.factions[0].color;
  } else {
    controlKind = "unclaimed";
    controlLabel = "Unclaimed";
    accent = NEUTRAL;
  }

  const notes = live.notes?.trim();
  const description = truncate(
    notes && notes.length > 0
      ? notes
      : defaultDescription(live, ownership, systemName),
  );

  return {
    planetId: live.id,
    name: live.name,
    systemName,
    systemId: live.systemId,
    classification: planetTypeDisplayLabel(live),
    planetType: live.type,
    description,
    strength: computePlanetStrength(live),
    controlKind,
    controlLabel,
    accent,
  };
}

export function computePlanetsOverview(
  campaign: Campaign,
): PlanetOverviewCard[] {
  const cards = (campaign.planets ?? [])
    .filter((p) => p.type !== "asteroid_belt")
    .map((p) => buildPlanetOverviewCard(campaign, p));

  cards.sort(
    (a, b) => b.strength - a.strength || a.name.localeCompare(b.name),
  );

  return cards;
}
