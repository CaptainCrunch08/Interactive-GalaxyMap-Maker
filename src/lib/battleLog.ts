import type {
  BattleEntry,
  Campaign,
  CampaignBattleLogEntry,
  BattleTheater,
} from "../types/campaign";
import { formatBattleDate } from "./battleResolve";

/** Build a planetary chronicle row from a planet battle entry. */
export function planetaryLogEntry(
  battle: BattleEntry,
  planet: { id: string; name: string; systemId: string },
  systemName?: string,
): CampaignBattleLogEntry {
  return {
    ...battle,
    theater: "planetary",
    planetId: planet.id,
    systemId: planet.systemId,
    locationLabel: systemName
      ? `${planet.name} · ${systemName}`
      : planet.name,
  };
}

/** Empty space/planetary stub for manual chronicle entries. */
export function emptyBattleLogEntry(
  theater: BattleTheater,
  opts?: {
    planetId?: string;
    systemId?: string;
    locationLabel?: string;
  },
): CampaignBattleLogEntry {
  return {
    id: crypto.randomUUID(),
    date: formatBattleDate(),
    summary: "",
    outcome: "",
    theater,
    planetId: opts?.planetId,
    systemId: opts?.systemId,
    locationLabel: opts?.locationLabel?.trim() || "Unknown location",
  };
}

/**
 * Ensure every planet battle appears in the campaign chronicle.
 * Keeps existing log rows (incl. space) and fills gaps from planet logs.
 */
export function ensureCampaignBattleLog(
  campaign: Campaign,
): CampaignBattleLogEntry[] {
  const systemsById = new Map(
    (campaign.systems ?? []).map((s) => [s.id, s] as const),
  );
  const existing = [...(campaign.battleLog ?? [])];
  const byId = new Map(existing.map((e) => [e.id, e] as const));

  for (const planet of campaign.planets ?? []) {
    const systemName = systemsById.get(planet.systemId)?.name;
    for (const battle of planet.battles ?? []) {
      const prior = byId.get(battle.id);
      if (prior) {
        // Keep chronicle fields; refresh shared battle fields from planet copy.
        // Prefer log `name` / favorite — planet.battles never stores chronicle title.
        const merged: CampaignBattleLogEntry = {
          ...prior,
          ...battle,
          theater: prior.theater ?? "planetary",
          planetId: prior.planetId ?? planet.id,
          systemId: prior.systemId ?? planet.systemId,
          name: prior.name?.trim() || undefined,
          favorite: prior.favorite || battle.favorite || undefined,
          characterOutcomes:
            prior.characterOutcomes ?? battle.characterOutcomes,
          locationLabel:
            prior.locationLabel?.trim() ||
            (systemName
              ? `${planet.name} · ${systemName}`
              : planet.name),
          attackerFleetId: prior.attackerFleetId,
          defenderFleetId: prior.defenderFleetId,
        };
        byId.set(battle.id, merged);
        continue;
      }
      const entry = planetaryLogEntry(battle, planet, systemName);
      byId.set(entry.id, entry);
    }
  }

  return [...byId.values()].sort(compareBattleLogNewestFirst);
}

export function compareBattleLogNewestFirst(
  a: CampaignBattleLogEntry,
  b: CampaignBattleLogEntry,
): number {
  const da = a.date?.trim() ?? "";
  const db = b.date?.trim() ?? "";
  if (da !== db) return db.localeCompare(da);
  return b.id.localeCompare(a.id);
}

/** Strip chronicle-only fields for the planet.battles copy. */
export function battleEntryFromLog(
  entry: CampaignBattleLogEntry,
): BattleEntry {
  return {
    id: entry.id,
    date: entry.date,
    summary: entry.summary,
    outcome: entry.outcome,
    attackerFactionId: entry.attackerFactionId,
    defenderFactionId: entry.defenderFactionId,
    attackerArmyId: entry.attackerArmyId,
    defenderArmyId: entry.defenderArmyId,
    attackerSupportArmyIds: entry.attackerSupportArmyIds,
    defenderSupportArmyIds: entry.defenderSupportArmyIds,
    attackerVp: entry.attackerVp,
    defenderVp: entry.defenderVp,
    attackerCasualties: entry.attackerCasualties,
    defenderCasualties: entry.defenderCasualties,
    attackerStrengthLostPct: entry.attackerStrengthLostPct,
    defenderStrengthLostPct: entry.defenderStrengthLostPct,
    victoryKind: entry.victoryKind,
    victorFactionId: entry.victorFactionId,
    favorite: entry.favorite,
    characterOutcomes: entry.characterOutcomes,
    killedCharacterIds: entry.killedCharacterIds,
  };
}

/** Upsert a row into the campaign battle log (by id). */
export function upsertBattleLog(
  log: CampaignBattleLogEntry[] | undefined,
  entry: CampaignBattleLogEntry,
): CampaignBattleLogEntry[] {
  const list = [...(log ?? [])];
  const i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  return list.sort(compareBattleLogNewestFirst);
}

export function patchBattleLog(
  log: CampaignBattleLogEntry[] | undefined,
  battleId: string,
  patch: Partial<CampaignBattleLogEntry>,
): CampaignBattleLogEntry[] {
  return (log ?? []).map((e) =>
    e.id === battleId ? { ...e, ...patch } : e,
  );
}

export function removeBattleLog(
  log: CampaignBattleLogEntry[] | undefined,
  battleId: string,
): CampaignBattleLogEntry[] {
  return (log ?? []).filter((e) => e.id !== battleId);
}
