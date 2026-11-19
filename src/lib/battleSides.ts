import type {
  BattleCasualtyBreakdown,
  BattleEntry,
  BattleSideParticipant,
} from "../types/campaign";

/** Unique faction ids from armies, primary first, supports in order. */
export function uniqueFactionIdsFromArmies(
  primary: { factionId: string },
  supports: { factionId: string }[] = [],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const a of [primary, ...supports]) {
    if (!a.factionId || seen.has(a.factionId)) continue;
    seen.add(a.factionId);
    ids.push(a.factionId);
  }
  return ids;
}

function loreFromBreakdown(
  breakdown: BattleCasualtyBreakdown | undefined | null,
): number {
  if (!breakdown) return 0;
  let n = 0;
  for (const row of Object.values(breakdown)) {
    if (!row) continue;
    n += Math.max(0, Math.round(row.lore ?? 0));
  }
  return n;
}

export function participantLore(p: BattleSideParticipant): number {
  if (p.casualtyBreakdown && Object.keys(p.casualtyBreakdown).length > 0) {
    return loreFromBreakdown(p.casualtyBreakdown);
  }
  return Math.max(0, Math.round(p.casualties ?? 0));
}

export function totalLoreFromParticipants(
  participants: BattleSideParticipant[] | undefined | null,
): number {
  if (!participants?.length) return 0;
  return participants.reduce((sum, p) => sum + participantLore(p), 0);
}

/**
 * Resolve the attacking (or defending) roster for a battle.
 * Prefers `*Participants`; falls back to legacy single faction + breakdown.
 */
export function sideParticipants(
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
  side: "attacker" | "defender",
): BattleSideParticipant[] {
  const multi =
    side === "attacker"
      ? entry.attackerParticipants
      : entry.defenderParticipants;
  if (multi && multi.length > 0) {
    return multi.map((p) => ({
      factionId: p.factionId,
      casualtyBreakdown: p.casualtyBreakdown,
      casualties: p.casualties,
    }));
  }
  const factionId =
    side === "attacker" ? entry.attackerFactionId : entry.defenderFactionId;
  if (!factionId) return [];
  const breakdown =
    side === "attacker"
      ? entry.attackerCasualtyBreakdown
      : entry.defenderCasualtyBreakdown;
  const casualties =
    side === "attacker" ? entry.attackerCasualties : entry.defenderCasualties;
  return [
    {
      factionId,
      casualtyBreakdown: breakdown,
      casualties,
    },
  ];
}

export function sideFactionIds(
  entry: Parameters<typeof sideParticipants>[0],
  side: "attacker" | "defender",
): string[] {
  return sideParticipants(entry, side).map((p) => p.factionId);
}

type VictorFields = Parameters<typeof sideParticipants>[0] & {
  victoryKind?: BattleEntry["victoryKind"];
  victorFactionId?: string | null;
  victorFactionIds?: string[] | null;
};

/**
 * All factions that share credit for the win (entire winning side).
 * Falls back from a single `victorFactionId` to that faction's whole side.
 */
export function victorFactionIdsForEntry(entry: VictorFields): string[] {
  if (entry.victoryKind === "draw") return [];
  if (entry.victorFactionIds && entry.victorFactionIds.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of entry.victorFactionIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    if (out.length > 0) return out;
  }
  const vid = entry.victorFactionId ?? undefined;
  if (!vid) return [];
  const atk = sideFactionIds(entry, "attacker");
  if (atk.includes(vid)) return atk;
  const def = sideFactionIds(entry, "defender");
  if (def.includes(vid)) return def;
  return [vid];
}

/** Which battle side holds the victory, if any. */
export function victorSideForEntry(
  entry: VictorFields,
): "attacker" | "defender" | null {
  if (entry.victoryKind === "draw") return null;
  const ids = victorFactionIdsForEntry(entry);
  if (ids.length === 0) return null;
  const atk = new Set(sideFactionIds(entry, "attacker"));
  const def = new Set(sideFactionIds(entry, "defender"));
  const atkHits = ids.filter((id) => atk.has(id)).length;
  const defHits = ids.filter((id) => def.has(id)).length;
  if (atkHits === 0 && defHits === 0) return null;
  return atkHits >= defHits ? "attacker" : "defender";
}

/** Persist both primary id and full winning-side roster. */
export function victorFieldsForSide(
  entry: Parameters<typeof sideParticipants>[0],
  side: "attacker" | "defender" | null,
): { victorFactionId: string | null; victorFactionIds: string[] | undefined } {
  if (!side) {
    return { victorFactionId: null, victorFactionIds: undefined };
  }
  const ids = sideFactionIds(entry, side);
  return {
    victorFactionId: ids[0] ?? null,
    victorFactionIds: ids.length > 0 ? ids : undefined,
  };
}

/**
 * Sync legacy single-id / side-total fields from a participant list.
 * Primary faction = first participant; side totals = sum of lore.
 */
export function legacyFieldsFromParticipants(
  attackers: BattleSideParticipant[],
  defenders: BattleSideParticipant[],
): Pick<
  BattleEntry,
  | "attackerFactionId"
  | "defenderFactionId"
  | "attackerCasualties"
  | "defenderCasualties"
  | "attackerCasualtyBreakdown"
  | "defenderCasualtyBreakdown"
  | "attackerParticipants"
  | "defenderParticipants"
> {
  const atkTotal = totalLoreFromParticipants(attackers);
  const defTotal = totalLoreFromParticipants(defenders);
  return {
    attackerParticipants: attackers.length > 0 ? attackers : undefined,
    defenderParticipants: defenders.length > 0 ? defenders : undefined,
    attackerFactionId: attackers[0]?.factionId,
    defenderFactionId: defenders[0]?.factionId,
    attackerCasualties: atkTotal > 0 ? atkTotal : undefined,
    defenderCasualties: defTotal > 0 ? defTotal : undefined,
    attackerCasualtyBreakdown: attackers[0]?.casualtyBreakdown,
    defenderCasualtyBreakdown: defenders[0]?.casualtyBreakdown,
  };
}

export function mergeParticipantsPreservingCasualties(
  factionIds: string[],
  previous: BattleSideParticipant[] | undefined,
): BattleSideParticipant[] {
  const prevById = new Map((previous ?? []).map((p) => [p.factionId, p]));
  return factionIds.map((factionId) => {
    const prev = prevById.get(factionId);
    return prev
      ? {
          factionId,
          casualtyBreakdown: prev.casualtyBreakdown,
          casualties: prev.casualties,
        }
      : { factionId };
  });
}

export function formatParticipantsCasualtiesLine(
  participants: BattleSideParticipant[],
  factionName: (id: string) => string,
): string {
  if (participants.length === 0) return "";
  return participants
    .map((p) => {
      const name = factionName(p.factionId);
      const lore = participantLore(p);
      const parts: string[] = [];
      if (p.casualtyBreakdown) {
        for (const [key, row] of Object.entries(p.casualtyBreakdown)) {
          if (!row || row.models <= 0) continue;
          const label = row.label?.trim() || key;
          parts.push(`${label} ${row.lore.toLocaleString("en-US")}`);
        }
      }
      if (parts.length > 0) return `${name}: ${parts.join(", ")}`;
      if (lore > 0) return `${name}: ${lore.toLocaleString("en-US")} lore`;
      return name;
    })
    .join("; ");
}
