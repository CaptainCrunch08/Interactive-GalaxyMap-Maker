import type { Campaign, Faction, StarSystem } from "../types/campaign";

export type SystemOwnership =
  | { status: "unowned"; factions: [] }
  | { status: "owned"; factions: [Faction] }
  | { status: "contested"; factions: [Faction, Faction, ...Faction[]] };

export function getFactionsControllingSystem(
  campaign: Campaign,
  systemId: string,
): Faction[] {
  const ids = new Set<string>();
  for (const p of campaign.planets) {
    if (p.systemId !== systemId || !p.controllingFactionId) continue;
    ids.add(p.controllingFactionId);
  }
  const system = campaign.systems.find((s) => s.id === systemId);
  if (ids.size === 0 && system?.controllingFactionId) {
    ids.add(system.controllingFactionId);
  }
  return campaign.factions.filter((f) => ids.has(f.id));
}

export function getSystemOwnership(
  campaign: Campaign,
  systemId: string,
): SystemOwnership {
  const factions = getFactionsControllingSystem(campaign, systemId);
  if (factions.length === 0) return { status: "unowned", factions: [] };
  if (factions.length === 1) {
    return { status: "owned", factions: [factions[0]!] };
  }
  return {
    status: "contested",
    factions: factions as [Faction, Faction, ...Faction[]],
  };
}

export function ownershipLabel(ownership: SystemOwnership): string {
  if (ownership.status === "unowned") return "Unclaimed";
  if (ownership.status === "owned") return ownership.factions[0].name;
  return ownership.factions.map((f) => f.name).join(" / ");
}

export function getFactionById(
  campaign: Campaign,
  factionId: string | undefined,
): Faction | undefined {
  if (!factionId) return undefined;
  return campaign.factions.find((f) => f.id === factionId);
}

/** Sync system.controllingFactionId from its planets (single owner or clear if contested/empty). */
export function deriveSystemOwnerId(
  campaign: Campaign,
  systemId: string,
): string | undefined {
  const ids = new Set<string>();
  for (const p of campaign.planets) {
    if (p.systemId !== systemId || !p.controllingFactionId) continue;
    ids.add(p.controllingFactionId);
  }
  if (ids.size === 1) return [...ids][0];
  if (ids.size > 1) return undefined;
  const system = campaign.systems.find((s) => s.id === systemId);
  return system?.controllingFactionId;
}

export function systemOwnerSelectValue(
  system: StarSystem,
  ownership: SystemOwnership,
): string {
  if (ownership.status === "owned") return ownership.factions[0].id;
  if (ownership.status === "contested") return "__contested__";
  return system.controllingFactionId ?? "";
}

/** Fixed sphere of influence for every controlled system (world units). */
export const CLAIM_RADIUS = 320;
