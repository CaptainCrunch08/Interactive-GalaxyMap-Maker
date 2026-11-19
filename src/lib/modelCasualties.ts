import type {
  BattleCasualtyBreakdown,
  BattleEntry,
  BattleSideParticipant,
  Campaign,
  Faction,
  ModelCategoryId,
  ModelCategoryCasualty,
} from "../types/campaign";
import { ensureCampaignBattleLog } from "./battleLog";
import { sideParticipants } from "./battleSides";

export const MODEL_CATEGORY_IDS: readonly ModelCategoryId[] = [
  "swarm",
  "troops",
  "elites",
  "beasts",
  "monsters_vehicles",
  "titans",
] as const;

export const DEFAULT_MODEL_CATEGORY: Record<
  ModelCategoryId,
  { label: string; multiplier: number }
> = {
  swarm: { label: "Swarm", multiplier: 1000 },
  troops: { label: "Troops", multiplier: 100 },
  elites: { label: "Elites", multiplier: 1 },
  beasts: { label: "Beasts", multiplier: 1 },
  monsters_vehicles: { label: "Monsters / Vehicles", multiplier: 1 },
  titans: { label: "Titans", multiplier: 1 },
};

export function isModelCategoryId(value: string): value is ModelCategoryId {
  return (MODEL_CATEGORY_IDS as readonly string[]).includes(value);
}

/** Resolved display name + lore multiplier for a faction (defaults when unset). */
export function resolveModelCategory(
  faction: Pick<Faction, "modelCategories"> | null | undefined,
  id: ModelCategoryId,
): { label: string; multiplier: number } {
  const defaults = DEFAULT_MODEL_CATEGORY[id];
  const override = faction?.modelCategories?.[id];
  const label = override?.label?.trim() || defaults.label;
  const raw =
    override?.multiplier != null && Number.isFinite(override.multiplier)
      ? Math.round(override.multiplier)
      : defaults.multiplier;
  const multiplier = Math.max(0, raw);
  return { label, multiplier };
}

export function loreFromModels(models: number, multiplier: number): number {
  const m = Math.max(0, Math.round(models));
  const mult = Math.max(0, Math.round(multiplier));
  return m * mult;
}

export function emptyModelCountRecord(): Record<ModelCategoryId, number> {
  return {
    swarm: 0,
    troops: 0,
    elites: 0,
    beasts: 0,
    monsters_vehicles: 0,
    titans: 0,
  };
}

/** Build a persisted breakdown from tabletop model counts + faction config. */
export function buildCasualtyBreakdown(
  models: Partial<Record<ModelCategoryId, number>> | undefined,
  faction: Pick<Faction, "modelCategories"> | null | undefined,
): BattleCasualtyBreakdown | undefined {
  if (!models) return undefined;
  const out: BattleCasualtyBreakdown = {};
  let any = false;
  for (const id of MODEL_CATEGORY_IDS) {
    const raw = models[id];
    if (raw == null || !Number.isFinite(raw)) continue;
    const count = Math.max(0, Math.round(raw));
    if (count <= 0) continue;
    const { label, multiplier } = resolveModelCategory(faction, id);
    out[id] = {
      models: count,
      lore: loreFromModels(count, multiplier),
      label,
      multiplier,
    };
    any = true;
  }
  return any ? out : undefined;
}

export function totalLoreFromBreakdown(
  breakdown: BattleCasualtyBreakdown | undefined | null,
): number {
  if (!breakdown) return 0;
  let n = 0;
  for (const id of MODEL_CATEGORY_IDS) {
    const row = breakdown[id];
    if (!row) continue;
    n += Math.max(0, Math.round(row.lore ?? 0));
  }
  return n;
}

/** Prefer category lore totals; fall back to legacy scalar casualties. */
export function sideLoreCasualties(
  breakdown: BattleCasualtyBreakdown | undefined | null,
  legacyTotal: number | undefined | null,
): number {
  if (breakdown && Object.keys(breakdown).length > 0) {
    return totalLoreFromBreakdown(breakdown);
  }
  return Math.max(0, Math.round(legacyTotal ?? 0));
}

export function battleTotalLoreCasualties(
  entry: Pick<
    BattleEntry,
    | "attackerFactionId"
    | "defenderFactionId"
    | "attackerParticipants"
    | "defenderParticipants"
    | "attackerCasualtyBreakdown"
    | "defenderCasualtyBreakdown"
    | "attackerCasualties"
    | "defenderCasualties"
  >,
): number {
  const atk = sideParticipants(entry, "attacker");
  const def = sideParticipants(entry, "defender");
  if (atk.length > 0 || def.length > 0) {
    let n = 0;
    for (const p of atk) {
      n += sideLoreCasualties(p.casualtyBreakdown, p.casualties);
    }
    for (const p of def) {
      n += sideLoreCasualties(p.casualtyBreakdown, p.casualties);
    }
    return n;
  }
  return (
    sideLoreCasualties(
      entry.attackerCasualtyBreakdown,
      entry.attackerCasualties,
    ) +
    sideLoreCasualties(
      entry.defenderCasualtyBreakdown,
      entry.defenderCasualties,
    )
  );
}

export function formatLoreCount(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v.toLocaleString("en-US");
}

/** Draft string map for controlled model-count inputs. */
export type ModelCountDraft = Record<ModelCategoryId, string>;

export function emptyModelCountDraft(): ModelCountDraft {
  return {
    swarm: "",
    troops: "",
    elites: "",
    beasts: "",
    monsters_vehicles: "",
    titans: "",
  };
}

export function draftFromBreakdown(
  breakdown: BattleCasualtyBreakdown | undefined | null,
): ModelCountDraft {
  const draft = emptyModelCountDraft();
  if (!breakdown) return draft;
  for (const id of MODEL_CATEGORY_IDS) {
    const row = breakdown[id];
    if (row && row.models > 0) draft[id] = String(row.models);
  }
  return draft;
}

export function parseModelCountDraft(
  draft: ModelCountDraft,
): Partial<Record<ModelCategoryId, number>> {
  const out: Partial<Record<ModelCategoryId, number>> = {};
  for (const id of MODEL_CATEGORY_IDS) {
    const raw = draft[id]?.trim() ?? "";
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out[id] = Math.max(0, Math.round(n));
  }
  return out;
}

/** Build a side participant from model-count draft + faction config. */
export function buildSideParticipant(
  factionId: string,
  models: ModelCountDraft | Partial<Record<ModelCategoryId, number>> | undefined,
  faction: Pick<Faction, "modelCategories"> | null | undefined,
): BattleSideParticipant {
  const parsed =
    models && typeof Object.values(models as object)[0] === "string"
      ? parseModelCountDraft(models as ModelCountDraft)
      : (models as Partial<Record<ModelCategoryId, number>> | undefined);
  const breakdown = buildCasualtyBreakdown(parsed, faction);
  const lore = totalLoreFromBreakdown(breakdown);
  return {
    factionId,
    casualtyBreakdown: breakdown,
    casualties: lore > 0 ? lore : undefined,
  };
}

export function categoryRowsForDisplay(
  breakdown: BattleCasualtyBreakdown | undefined | null,
  faction?: Pick<Faction, "modelCategories"> | null,
): { id: ModelCategoryId; label: string; models: number; lore: number }[] {
  const rows: {
    id: ModelCategoryId;
    label: string;
    models: number;
    lore: number;
  }[] = [];
  if (!breakdown) return rows;
  for (const id of MODEL_CATEGORY_IDS) {
    const row = breakdown[id];
    if (!row || row.models <= 0) continue;
    const resolved = resolveModelCategory(faction, id);
    rows.push({
      id,
      label: row.label?.trim() || resolved.label,
      models: row.models,
      lore: row.lore,
    });
  }
  return rows;
}

export type FactionCasualtyTotals = {
  factionId: string;
  byCategory: Record<ModelCategoryId, number>;
  /** Lore from older battles that only stored a scalar total. */
  uncategorized: number;
  total: number;
};

function emptyCategoryTotals(): Record<ModelCategoryId, number> {
  return {
    swarm: 0,
    troops: 0,
    elites: 0,
    beasts: 0,
    monsters_vehicles: 0,
    titans: 0,
  };
}

function addBreakdownToTotals(
  totals: Record<ModelCategoryId, number>,
  breakdown: BattleCasualtyBreakdown | undefined,
): number {
  if (!breakdown) return 0;
  let added = 0;
  for (const id of MODEL_CATEGORY_IDS) {
    const lore = Math.max(0, Math.round(breakdown[id]?.lore ?? 0));
    if (lore <= 0) continue;
    totals[id] += lore;
    added += lore;
  }
  return added;
}

/**
 * Sum lore deaths per faction per model category across the campaign battle log
 * (falls back to planet.battles when the log is empty).
 */
export function aggregateFactionLoreCasualties(
  campaign: Campaign,
): FactionCasualtyTotals[] {
  const byFaction = new Map<string, Record<ModelCategoryId, number>>();
  const uncategorized = new Map<string, number>();

  const addSide = (
    factionId: string | undefined,
    breakdown: BattleCasualtyBreakdown | undefined,
    legacy: number | undefined,
  ) => {
    if (!factionId) return;
    if (!byFaction.has(factionId)) {
      byFaction.set(factionId, emptyCategoryTotals());
    }
    const totals = byFaction.get(factionId)!;
    if (breakdown && Object.keys(breakdown).length > 0) {
      addBreakdownToTotals(totals, breakdown);
      return;
    }
    const n = Math.max(0, Math.round(legacy ?? 0));
    if (n > 0) uncategorized.set(factionId, (uncategorized.get(factionId) ?? 0) + n);
  };

  const ingest = (b: BattleEntry) => {
    for (const p of sideParticipants(b, "attacker")) {
      addSide(p.factionId, p.casualtyBreakdown, p.casualties);
    }
    for (const p of sideParticipants(b, "defender")) {
      addSide(p.factionId, p.casualtyBreakdown, p.casualties);
    }
  };

  const log = ensureCampaignBattleLog(campaign);
  if (log.length > 0) {
    for (const b of log) ingest(b);
  } else {
    for (const p of campaign.planets ?? []) {
      for (const b of p.battles ?? []) ingest(b);
    }
  }

  const rows: FactionCasualtyTotals[] = [];
  for (const [factionId, byCategory] of byFaction) {
    const unc = uncategorized.get(factionId) ?? 0;
    const categorized = MODEL_CATEGORY_IDS.reduce(
      (sum, id) => sum + byCategory[id],
      0,
    );
    const total = categorized + unc;
    if (total <= 0) continue;
    rows.push({ factionId, byCategory, uncategorized: unc, total });
  }
  // Factions that only have legacy uncategorized totals.
  for (const [factionId, unc] of uncategorized) {
    if (byFaction.has(factionId)) continue;
    if (unc <= 0) continue;
    rows.push({
      factionId,
      byCategory: emptyCategoryTotals(),
      uncategorized: unc,
      total: unc,
    });
  }
  return rows;
}

export function summarizeBreakdownLine(
  breakdown: BattleCasualtyBreakdown | undefined,
  faction?: Pick<Faction, "modelCategories"> | null,
): string {
  const rows = categoryRowsForDisplay(breakdown, faction);
  if (rows.length === 0) return "";
  return rows
    .map((r) => `${r.label} ${formatLoreCount(r.lore)}`)
    .join(", ");
}

/** Recompute lore fields when multipliers change mid-edit (keeps model counts). */
export function refreshBreakdownLore(
  breakdown: BattleCasualtyBreakdown | undefined,
  faction: Pick<Faction, "modelCategories"> | null | undefined,
): BattleCasualtyBreakdown | undefined {
  if (!breakdown) return undefined;
  const models: Partial<Record<ModelCategoryId, number>> = {};
  for (const id of MODEL_CATEGORY_IDS) {
    const row = breakdown[id];
    if (row && row.models > 0) models[id] = row.models;
  }
  return buildCasualtyBreakdown(models, faction);
}

export type { ModelCategoryCasualty };
