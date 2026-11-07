import type { Faction } from "../types/campaign";

/**
 * Banner / federation helpers.
 *
 * A faction with no `parentFactionId` is a primary banner (e.g. Imperium).
 * Subfactions point at that banner and keep their own colors for fleets /
 * detachments; territory borders and city paints use the banner color.
 */

/** Walk parent links to the root banner (guards against cycles). */
export function bannerFactionId(
  factions: Faction[],
  factionId: string | undefined | null,
): string | undefined {
  if (!factionId) return undefined;
  const byId = new Map(factions.map((f) => [f.id, f]));
  let cur: string | undefined = factionId;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return cur;
    seen.add(cur);
    const f = byId.get(cur);
    if (!f?.parentFactionId) return cur;
    if (!byId.has(f.parentFactionId)) return cur;
    cur = f.parentFactionId;
  }
  return factionId;
}

export function bannerFaction(
  factions: Faction[],
  factionId: string | undefined | null,
): Faction | undefined {
  const id = bannerFactionId(factions, factionId);
  if (!id) return undefined;
  return factions.find((f) => f.id === id);
}

/** Color used for territory borders, city hubs, and ownership tints. */
export function bannerColor(
  factions: Faction[],
  factionId: string | undefined | null,
  fallback = "#9eb6c8",
): string {
  return bannerFaction(factions, factionId)?.color ?? fallback;
}

/** Color used for fleets / detachments (the faction's own paint). */
export function unitColor(
  factions: Faction[],
  factionId: string | undefined | null,
  fallback = "#4fd2ff",
): string {
  if (!factionId) return fallback;
  return factions.find((f) => f.id === factionId)?.color ?? fallback;
}

export function areFederated(
  factions: Faction[],
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  const ba = bannerFactionId(factions, a);
  const bb = bannerFactionId(factions, b);
  return ba != null && bb != null && ba === bb;
}

/** Top-level banners (no parent). */
export function rootFactions(factions: Faction[]): Faction[] {
  return factions.filter((f) => !f.parentFactionId);
}

export function childFactions(
  factions: Faction[],
  parentId: string,
): Faction[] {
  return factions.filter((f) => f.parentFactionId === parentId);
}

/** Every faction under the same banner as `factionId` (including the root). */
export function federationMemberIds(
  factions: Faction[],
  factionId: string | undefined | null,
): string[] {
  const banner = bannerFactionId(factions, factionId);
  if (!banner) return [];
  return factions
    .filter((f) => bannerFactionId(factions, f.id) === banner)
    .map((f) => f.id);
}

/**
 * Play turn order: only federation heads (roots). Subfactions ids collapse to their
 * banner; duplicates are dropped.
 */
export function federationTurnOrder(
  factions: Faction[],
  preferredOrder?: string[],
): string[] {
  const roots = rootFactions(factions);
  const rootIds = new Set(roots.map((f) => f.id));
  if (preferredOrder && preferredOrder.length > 0) {
    const out: string[] = [];
    for (const raw of preferredOrder) {
      const banner = bannerFactionId(factions, raw) ?? raw;
      if (!rootIds.has(banner)) continue;
      if (out.includes(banner)) continue;
      out.push(banner);
    }
    if (out.length > 0) return out;
  }
  return roots.map((f) => f.id);
}

/**
 * Valid parent candidates for `factionId`: other roots or any faction that
 * is not this one or a descendant (no cycles). Prefer attaching to roots.
 */
export function eligibleParentFactions(
  factions: Faction[],
  factionId: string,
): Faction[] {
  const descendants = new Set<string>([factionId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of factions) {
      if (
        f.parentFactionId &&
        descendants.has(f.parentFactionId) &&
        !descendants.has(f.id)
      ) {
        descendants.add(f.id);
        grew = true;
      }
    }
  }
  return factions.filter((f) => !descendants.has(f.id));
}

/** Collapse a raw faction id to its banner for majority / ownership tallies. */
export function collapseToBannerId(
  factions: Faction[],
  factionId: string | undefined | null,
): string | undefined {
  return bannerFactionId(factions, factionId);
}
