import type { ArmySymbol, Faction, Fleet } from "../types/campaign";

/** Fleet emblem: explicit pick, else faction primary. */
export function resolveFleetSymbolId(
  fleet: Fleet,
  faction: Faction | undefined,
): string | undefined {
  return fleet.symbolId ?? faction?.defaultSymbolId;
}

export function resolveFleetSymbolUrl(
  fleet: Fleet,
  faction: Faction | undefined,
  symbols: ArmySymbol[] | undefined,
): string | undefined {
  const id = resolveFleetSymbolId(fleet, faction);
  if (!id) return undefined;
  return symbols?.find((s) => s.id === id)?.imageDataUrl;
}
