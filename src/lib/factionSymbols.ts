import type { Faction } from "../types/campaign";

/** All symbol ids owned by a faction (includes primary). */
export function factionSymbolIds(faction: Faction): string[] {
  const ids = [
    ...(faction.symbolIds ?? []),
    ...(faction.defaultSymbolId ? [faction.defaultSymbolId] : []),
  ];
  return [...new Set(ids.filter(Boolean))];
}

/** Normalize symbolIds + ensure primary is valid / defaults to first. */
export function normalizeFactionSymbols(faction: Faction): Faction {
  const symbolIds = factionSymbolIds(faction);
  let defaultSymbolId = faction.defaultSymbolId;
  if (defaultSymbolId && !symbolIds.includes(defaultSymbolId)) {
    defaultSymbolId = undefined;
  }
  if (!defaultSymbolId && symbolIds.length > 0) {
    defaultSymbolId = symbolIds[0];
  }
  return {
    ...faction,
    symbolIds,
    defaultSymbolId,
  };
}

/** Each symbol may belong to at most one faction (keeps first claimant). */
export function enforceUniqueSymbolOwnership(
  factions: Faction[],
): Faction[] {
  const claimed = new Set<string>();
  return factions.map((raw) => {
    const f = normalizeFactionSymbols(raw);
    const kept: string[] = [];
    for (const id of f.symbolIds ?? []) {
      if (claimed.has(id)) continue;
      claimed.add(id);
      kept.push(id);
    }
    let defaultSymbolId = f.defaultSymbolId;
    if (defaultSymbolId && !kept.includes(defaultSymbolId)) {
      defaultSymbolId = kept[0];
    }
    return {
      ...f,
      symbolIds: kept,
      defaultSymbolId,
    };
  });
}

/** Map symbolId → owning faction id. */
export function symbolOwnerMap(
  factions: Faction[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of enforceUniqueSymbolOwnership(factions)) {
    for (const id of f.symbolIds ?? []) {
      map.set(id, f.id);
    }
  }
  return map;
}

/**
 * Assign a symbol to a faction (removes it from any other faction).
 * Optionally make it the primary faction emblem.
 */
export function withSymbolAssigned(
  factions: Faction[],
  factionId: string,
  symbolId: string,
  asPrimary = false,
): Faction[] {
  return enforceUniqueSymbolOwnership(
    factions.map((f) => {
      if (f.id === factionId) {
        const symbolIds = [
          ...new Set([...factionSymbolIds(f), symbolId]),
        ];
        return normalizeFactionSymbols({
          ...f,
          symbolIds,
          defaultSymbolId: asPrimary
            ? symbolId
            : f.defaultSymbolId ?? symbolId,
        });
      }
      const symbolIds = factionSymbolIds(f).filter((id) => id !== symbolId);
      const defaultSymbolId =
        f.defaultSymbolId === symbolId
          ? symbolIds[0]
          : f.defaultSymbolId;
      return normalizeFactionSymbols({
        ...f,
        symbolIds,
        defaultSymbolId,
      });
    }),
  );
}

/** Remove a symbol from a faction's roster (does not delete the library entry). */
export function withSymbolUnassigned(
  factions: Faction[],
  factionId: string,
  symbolId: string,
): Faction[] {
  return factions.map((f) => {
    if (f.id !== factionId) return f;
    const symbolIds = factionSymbolIds(f).filter((id) => id !== symbolId);
    const defaultSymbolId =
      f.defaultSymbolId === symbolId ? symbolIds[0] : f.defaultSymbolId;
    return normalizeFactionSymbols({
      ...f,
      symbolIds,
      defaultSymbolId,
    });
  });
}

export function withPrimarySymbol(
  factions: Faction[],
  factionId: string,
  symbolId: string | undefined,
): Faction[] {
  return factions.map((f) => {
    if (f.id !== factionId) return f;
    const ids = factionSymbolIds(f);
    if (symbolId && !ids.includes(symbolId)) {
      return normalizeFactionSymbols({
        ...f,
        symbolIds: [...ids, symbolId],
        defaultSymbolId: symbolId,
      });
    }
    return normalizeFactionSymbols({
      ...f,
      defaultSymbolId: symbolId,
    });
  });
}
