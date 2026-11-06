import type { Campaign, Faction } from "../types/campaign";
import {
  countOwnedManufactorums,
  getBuildingPoints,
  incomeForFaction,
} from "./buildingPoints";
import { armyStrength, totalBattleCasualties } from "./battleResolve";
import { bannerFactionId, rootFactions } from "./federation";
import { fleetPower, shipRole } from "./fleetPower";
import { getSystemOwnership } from "./territory";

/** Asset / owner counts toward this federation banner (or the faction itself). */
function underBanner(
  factions: Faction[],
  ownerId: string | undefined | null,
  bannerId: string,
): boolean {
  return bannerFactionId(factions, ownerId) === bannerId;
}

export type PowerAxisId =
  | "military"
  | "territory"
  | "supply"
  | "growth"
  | "morale"
  | "momentum";

export const POWER_AXIS_ORDER: PowerAxisId[] = [
  "military",
  "territory",
  "supply",
  "growth",
  "morale",
  "momentum",
];

export const POWER_AXIS_LABELS: Record<PowerAxisId, string> = {
  military: "Military",
  territory: "Territory",
  supply: "Supply",
  growth: "Growth",
  morale: "Morale",
  momentum: "Momentum",
};

export const POWER_AXIS_SHORT: Record<PowerAxisId, string> = {
  military: "Mil",
  territory: "Ter",
  supply: "Sup",
  growth: "Gro",
  morale: "Mor",
  momentum: "Mom",
};

export type FactionPowerScores = Record<PowerAxisId, number>;

export type FactionPowerRow = {
  factionId: string;
  name: string;
  color: string;
  /** Secondary line (leader name when set). */
  subtitle: string;
  scores: FactionPowerScores;
  raw: FactionPowerScores;
};

export type StrategicOverviewStats = {
  battlesLogged: number;
  worldsTracked: number;
  kia: number;
};

export type StrategicOverview = {
  stats: StrategicOverviewStats;
  factions: FactionPowerRow[];
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map raw values so the faction leading each axis hits ~100. */
function normalizeAxis(rawByFaction: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of rawByFaction.values()) max = Math.max(max, v);
  const out = new Map<string, number>();
  if (max <= 0) {
    for (const id of rawByFaction.keys()) out.set(id, 0);
    return out;
  }
  for (const [id, v] of rawByFaction) {
    out.set(id, clampScore((v / max) * 100));
  }
  return out;
}

function battleText(campaign: Campaign): string[] {
  const texts: string[] = [];
  for (const p of campaign.planets) {
    for (const b of p.battles ?? []) {
      texts.push(`${b.summary} ${b.outcome}`.toLowerCase());
    }
  }
  return texts;
}

function countKeywordHits(texts: string[], patterns: RegExp[]): number {
  let n = 0;
  for (const t of texts) {
    if (patterns.some((re) => re.test(t))) n += 1;
  }
  return n;
}

/**
 * Military: fleet power + surface detachments + forts/ports.
 * Subfaction assets roll up to their federation banner.
 */
function rawMilitary(campaign: Campaign, bannerId: string): number {
  const factions = campaign.factions;
  let score = 0;
  for (const fleet of campaign.fleets ?? []) {
    if (!underBanner(factions, fleet.factionId, bannerId)) continue;
    score += fleetPower(fleet) * 0.35;
  }
  for (const planet of campaign.planets) {
    for (const army of planet.armies ?? []) {
      if (underBanner(factions, army.factionId, bannerId)) {
        score += 28 * (armyStrength(army) / 100);
      }
    }
    for (const st of planet.structures ?? []) {
      if (!underBanner(factions, st.controllingFactionId, bannerId)) continue;
      if (st.kind === "trench_line") score += 18;
      if (st.kind === "outpost") score += 10;
      if (st.kind === "space_port") score += 12;
    }
  }
  return score;
}

/**
 * Territory: systems wholly owned, planets held, districts/cities, open hex claims.
 */
function rawTerritory(campaign: Campaign, bannerId: string): number {
  const factions = campaign.factions;
  let score = 0;
  for (const system of campaign.systems) {
    const own = getSystemOwnership(campaign, system.id);
    if (own.status === "owned" && own.factions[0]?.id === bannerId) {
      score += 40;
    } else if (
      own.status === "contested" &&
      own.factions.some((f) => f.id === bannerId)
    ) {
      score += 12;
    }
  }
  for (const planet of campaign.planets) {
    if (planet.type === "asteroid_belt") continue;
    if (underBanner(factions, planet.controllingFactionId, bannerId)) {
      score += 22;
    }
    for (const city of planet.cities ?? []) {
      let ownedDistricts = 0;
      for (const d of city.districts) {
        if (underBanner(factions, d.controllingFactionId, bannerId)) {
          ownedDistricts += 1;
        }
      }
      if (ownedDistricts > 0) score += 6 + ownedDistricts * 3;
    }
    let ownedIndependent = 0;
    for (const d of planet.independentDistricts ?? []) {
      if (underBanner(factions, d.controllingFactionId, bannerId)) {
        ownedIndependent += 1;
      }
    }
    if (ownedIndependent > 0) score += ownedIndependent * 3;
    for (const [tile, owner] of Object.entries(planet.tileClaims ?? {})) {
      if (underBanner(factions, owner, bannerId)) score += 0.35;
      void tile;
    }
  }
  return score;
}

/**
 * Supply: banked BP + manufactorum income capacity + ports/mines/relays.
 * BP / income are summed across every member of the federation.
 */
function rawSupply(campaign: Campaign, bannerId: string): number {
  const factions = campaign.factions;
  const members = factions.filter(
    (f) => bannerFactionId(factions, f.id) === bannerId,
  );
  let score = 0;
  let bp = 0;
  let income = 0;
  for (const planet of campaign.planets) {
    for (const m of members) {
      bp += getBuildingPoints(planet, m.id);
      income += incomeForFaction(planet, m.id);
      score += countOwnedManufactorums(planet, m.id) * 14;
    }
    for (const st of planet.structures ?? []) {
      if (!underBanner(factions, st.controllingFactionId, bannerId)) continue;
      if (st.kind === "space_port") score += 8;
      if (st.kind === "ore_mine") score += 6;
      if (st.kind === "supply_network" || st.kind === "relay") score += 5;
    }
    if (underBanner(factions, planet.controllingFactionId, bannerId)) {
      if (planet.type === "agri") score += 16;
      if (planet.type === "forge") score += 14;
      if (planet.type === "hive") score += 10;
      if (planet.type === "fortress") score += 18;
      if (planet.type === "homeworld") score += 14;
      if (planet.type === "trade") score += 12;
      if (planet.type === "feudal") score += 8;
      if (planet.type === "mining") score += 12;
      if (planet.type === "archaeological") score += 8;
      if (planet.type === "abandoned_colony") score += 6;
    }
  }
  score += Math.min(80, bp / 40) + income * 2.5;
  return score;
}

/**
 * Growth: agri/forge ownership, manufactorum count, spare district slots, transports.
 */
function rawGrowth(campaign: Campaign, bannerId: string): number {
  const factions = campaign.factions;
  const members = factions.filter(
    (f) => bannerFactionId(factions, f.id) === bannerId,
  );
  let score = 0;
  for (const planet of campaign.planets) {
    if (underBanner(factions, planet.controllingFactionId, bannerId)) {
      if (planet.type === "agri") score += 28;
      if (planet.type === "forge") score += 22;
      if (planet.type === "hive") score += 12;
      if (planet.type === "homeworld") score += 16;
      if (planet.type === "trade") score += 18;
      if (planet.type === "feudal") score += 14;
      if (planet.type === "fortress") score += 6;
      if (planet.type === "mining") score += 18;
      if (planet.type === "archaeological") score += 10;
      if (planet.type === "abandoned_colony") score += 8;
      if (planet.type === "custom") score += 8;
    }
    for (const m of members) {
      score += countOwnedManufactorums(planet, m.id) * 11;
    }
    for (const city of planet.cities ?? []) {
      const owned = city.districts.filter((d) =>
        underBanner(factions, d.controllingFactionId, bannerId),
      ).length;
      if (owned === 0) continue;
      const room = Math.max(0, 6 - city.districts.length);
      score += room * 4;
    }
  }
  for (const fleet of campaign.fleets ?? []) {
    if (!underBanner(factions, fleet.factionId, bannerId)) continue;
    for (const ship of fleet.ships ?? []) {
      if (shipRole(ship) === "transport") score += 8;
    }
  }
  return score;
}

/**
 * Morale: shrine/hive presence, home systems, penalties for ruins & contested heat.
 */
function rawMorale(campaign: Campaign, bannerId: string): number {
  const factions = campaign.factions;
  let score = 40; // baseline cohesion
  for (const planet of campaign.planets) {
    if (underBanner(factions, planet.controllingFactionId, bannerId)) {
      if (planet.type === "shrine") score += 24;
      if (planet.type === "hive") score += 10;
      if (planet.type === "trade") score += 8;
      if (planet.type === "death") score -= 6;
      score += 8;
    }
    for (const st of planet.structures ?? []) {
      if (!underBanner(factions, st.controllingFactionId, bannerId)) continue;
      if (st.kind === "ruins_site") score -= 14;
    }
    for (const army of planet.armies ?? []) {
      if (underBanner(factions, army.factionId, bannerId)) score += 2;
    }
  }
  for (const system of campaign.systems) {
    const own = getSystemOwnership(campaign, system.id);
    if (own.status === "contested" && own.factions.some((f) => f.id === bannerId)) {
      score -= 8;
    }
    if (own.status === "owned" && own.factions[0]?.id === bannerId) {
      score += 5;
    }
  }
  const texts = battleText(campaign);
  for (const t of texts) {
    if (
      !t.includes(bannerId) &&
      !mentionsBannerNames(campaign, bannerId, t)
    ) {
      continue;
    }
    if (/\b(victory|victorious|triumph|held|repelled)\b/.test(t)) score += 6;
    if (/\b(defeat|routed|crushed|annihilated|lost|fallen)\b/.test(t)) score -= 8;
  }
  return Math.max(0, score);
}

/** Banner or any of its subfaction names appear in battle text. */
function mentionsBannerNames(
  campaign: Campaign,
  bannerId: string,
  text: string,
): boolean {
  for (const f of campaign.factions) {
    if (bannerFactionId(campaign.factions, f.id) !== bannerId) continue;
    if (text.includes(f.name.toLowerCase())) return true;
  }
  return false;
}

/**
 * Momentum: forward fleets, armies on contested/foreign worlds, recent battle wins,
 * transport/escort activity proxies.
 */
function rawMomentum(campaign: Campaign, bannerId: string): number {
  const factions = campaign.factions;
  let score = 0;
  const homePlanetIds = new Set(
    campaign.planets
      .filter((p) =>
        underBanner(factions, p.controllingFactionId, bannerId),
      )
      .map((p) => p.id),
  );
  const homeSystemIds = new Set(
    campaign.planets
      .filter((p) =>
        underBanner(factions, p.controllingFactionId, bannerId),
      )
      .map((p) => p.systemId),
  );

  for (const fleet of campaign.fleets ?? []) {
    if (!underBanner(factions, fleet.factionId, bannerId)) continue;
    const sys = fleet.location.systemId;
    const shipWeight = fleetPower(fleet);
    if (!homeSystemIds.has(sys)) score += 18 + shipWeight * 0.08;
    else score += 4 + shipWeight * 0.03;
  }

  for (const planet of campaign.planets) {
    const own = getSystemOwnership(campaign, planet.systemId);
    const contested =
      own.status === "contested" &&
      own.factions.some((f) => f.id === bannerId);
    const foreign =
      planet.controllingFactionId &&
      !underBanner(factions, planet.controllingFactionId, bannerId);
    for (const army of planet.armies ?? []) {
      if (!underBanner(factions, army.factionId, bannerId)) continue;
      if (contested || foreign) score += 16;
      else if (homePlanetIds.has(planet.id)) score += 3;
      else score += 8;
    }
  }

  const texts = battleText(campaign);
  for (const t of texts) {
    if (!mentionsBannerNames(campaign, bannerId, t)) continue;
    if (/\b(victory|victorious|triumph|advance|breakthrough)\b/.test(t)) {
      score += 14;
    }
    if (/\b(defeat|retreat|routed|stalemate)\b/.test(t)) score -= 6;
  }

  const play = campaign.play;
  if (
    play?.active &&
    underBanner(factions, play.activeFactionId, bannerId)
  ) {
    score += 10;
  }
  if (play?.round) score += Math.min(20, play.round * 2);

  return Math.max(0, score);
}

export function computeGalacticStats(campaign: Campaign): StrategicOverviewStats {
  const planets = campaign.planets ?? [];
  const worlds = planets.filter((p) => p.type !== "asteroid_belt");
  let battles = 0;
  for (const p of planets) battles += (p.battles ?? []).length;

  const texts = battleText(campaign);
  const recordedKia = totalBattleCasualties(campaign);
  const keywordKia = countKeywordHits(texts, [
    /\bkia\b/,
    /\bcasualt(y|ies)\b/,
    /\bslain\b/,
    /\bfallen\b/,
    /\bmassacre\b/,
    /\bwiped out\b/,
    /\bdead\b/,
    /\bkilled\b/,
  ]);
  // Prefer summed tabletop casualties; fall back to narrative keywords.
  const kia = recordedKia > 0 ? recordedKia : keywordKia;

  return {
    battlesLogged: battles,
    worldsTracked: worlds.length,
    kia,
  };
}

function emptyScores(): FactionPowerScores {
  return {
    military: 0,
    territory: 0,
    supply: 0,
    growth: 0,
    morale: 0,
    momentum: 0,
  };
}

/**
 * Build comparative faction power scores (0–100 per axis) for the Strategic Overview.
 * Only federation banners (root factions) appear; each row is the sum of that
 * banner plus all of its subfactions. Leading banner on each axis hits ~100.
 */
export function computeStrategicOverview(
  campaign: Campaign,
): StrategicOverview {
  const banners = rootFactions(campaign.factions ?? []);
  const stats = computeGalacticStats(campaign);

  const rawMaps: Record<PowerAxisId, Map<string, number>> = {
    military: new Map(),
    territory: new Map(),
    supply: new Map(),
    growth: new Map(),
    morale: new Map(),
    momentum: new Map(),
  };

  for (const f of banners) {
    rawMaps.military.set(f.id, rawMilitary(campaign, f.id));
    rawMaps.territory.set(f.id, rawTerritory(campaign, f.id));
    rawMaps.supply.set(f.id, rawSupply(campaign, f.id));
    rawMaps.growth.set(f.id, rawGrowth(campaign, f.id));
    rawMaps.morale.set(f.id, rawMorale(campaign, f.id));
    rawMaps.momentum.set(f.id, rawMomentum(campaign, f.id));
  }

  const normMaps: Record<PowerAxisId, Map<string, number>> = {
    military: normalizeAxis(rawMaps.military),
    territory: normalizeAxis(rawMaps.territory),
    supply: normalizeAxis(rawMaps.supply),
    growth: normalizeAxis(rawMaps.growth),
    morale: normalizeAxis(rawMaps.morale),
    momentum: normalizeAxis(rawMaps.momentum),
  };

  const rows: FactionPowerRow[] = banners.map((f: Faction) => {
    const raw = emptyScores();
    const scores = emptyScores();
    for (const axis of POWER_AXIS_ORDER) {
      raw[axis] = rawMaps[axis].get(f.id) ?? 0;
      scores[axis] = normMaps[axis].get(f.id) ?? 0;
    }
    return {
      factionId: f.id,
      name: f.name,
      color: f.color,
      subtitle: f.leader?.trim() ?? "",
      scores,
      raw,
    };
  });

  // Strongest overall first
  rows.sort((a, b) => {
    const sum = (r: FactionPowerRow) =>
      POWER_AXIS_ORDER.reduce((n, ax) => n + r.scores[ax], 0);
    return sum(b) - sum(a);
  });

  return { stats, factions: rows };
}
