import type { Campaign, Planet, PlanetType } from "../types/campaign";
import { PLANET_TYPE_LABELS } from "../types/campaign";
import { armyStrength } from "./battleResolve";
import { getFactionById } from "./territory";

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

/** Factions with any surface stake on this world. */
function presentFactionIds(planet: Planet): Set<string> {
  const ids = new Set<string>();
  if (planet.controllingFactionId) ids.add(planet.controllingFactionId);
  for (const army of planet.armies ?? []) ids.add(army.factionId);
  for (const city of planet.cities ?? []) {
    for (const d of city.districts) {
      if (d.controllingFactionId) ids.add(d.controllingFactionId);
    }
  }
  for (const st of planet.structures ?? []) {
    if (st.controllingFactionId) ids.add(st.controllingFactionId);
  }
  for (const owner of Object.values(planet.tileClaims ?? {})) {
    if (owner) ids.add(owner);
  }
  return ids;
}

/**
 * World strength: garrisons, fortifications, industry, settlements;
 * ruins and devastation pull the score down.
 *
 * Scoring (clamped 0–100):
 * - Base 18 (+ type bonus: hive 22, forge 20, death 16, shrine 12, agri 10, …)
 * - Each detachment: +14 × (army STR% / 100)
 * - Structures: fortress/trench +16, kill zone/outpost +9, space port +11,
 *   manufactorum/reactor/mine +8, ruins −12, other +4
 * - Cities +6 each; districts +4; fortress/bastion district +5; ruins district −4
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
    custom: 8,
  };
  score += typeBonus[planet.type] ?? 0;

  for (const army of planet.armies ?? []) {
    score += 14 * (armyStrength(army) / 100);
  }

  for (const st of planet.structures ?? []) {
    if (st.kind === "fortress_bastion" || st.kind === "trench_line") score += 16;
    else if (st.kind === "kill_zone" || st.kind === "outpost") score += 9;
    else if (st.kind === "space_port") score += 11;
    else if (
      st.kind === "manufactorum_complex" ||
      st.kind === "reactor" ||
      st.kind === "ore_mine"
    ) {
      score += 8;
    } else if (st.kind === "ruins_site") score -= 12;
    else score += 4;
  }

  for (const city of planet.cities ?? []) {
    score += 6;
    score += city.districts.length * 4;
    for (const d of city.districts) {
      if (d.kind === "fortress" || d.kind === "bastion") score += 5;
      if (d.kind === "ruins") score -= 4;
    }
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
  controlLabel: string,
  systemName: string,
): string {
  const type = PLANET_TYPE_LABELS[planet.type] ?? "World";
  if (controlLabel === "Contested") {
    return `Multiple powers contest ${planet.name}. Front lines shift across this ${type.toLowerCase()} as reinforcements pour in.`;
  }
  if (planet.controllingFactionId) {
    const n = (planet.armies ?? []).length;
    const garrison =
      n > 0
        ? `${n} detachment${n === 1 ? "" : "s"} hold the surface.`
        : "Garrison strength is thin.";
    return `${controlLabel} maintains this ${type.toLowerCase()} in the ${systemName}. ${garrison}`;
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
  const system = campaign.systems.find((s) => s.id === planet.systemId);
  const systemName = system?.name ?? "Unknown System";
  const present = presentFactionIds(planet);
  const owner = getFactionById(campaign, planet.controllingFactionId);

  let controlKind: PlanetControlKind;
  let controlLabel: string;
  let accent: string;

  if (present.size >= 2) {
    controlKind = "contested";
    controlLabel = "Contested";
    accent = NEUTRAL;
  } else if (owner) {
    controlKind = "faction";
    controlLabel = owner.name;
    accent = owner.color;
  } else if (present.size === 1) {
    const onlyId = [...present][0]!;
    const f = getFactionById(campaign, onlyId);
    controlKind = f ? "faction" : "unclaimed";
    controlLabel = f?.name ?? "Unclaimed";
    accent = f?.color ?? NEUTRAL;
  } else {
    controlKind = "unclaimed";
    controlLabel = "Unclaimed";
    accent = NEUTRAL;
  }

  const notes = planet.notes?.trim();
  const description = truncate(
    notes && notes.length > 0
      ? notes
      : defaultDescription(planet, controlLabel, systemName),
  );

  return {
    planetId: planet.id,
    name: planet.name,
    systemName,
    systemId: planet.systemId,
    classification: PLANET_TYPE_LABELS[planet.type] ?? planet.type,
    planetType: planet.type,
    description,
    strength: computePlanetStrength(planet),
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
