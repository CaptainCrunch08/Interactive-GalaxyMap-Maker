import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Campaign, Faction, StarSystem } from "../../types/campaign";
import { campaignMapSize } from "../../types/campaign";
import {
  buildCompetitiveTerritories,
  type FactionInfluence,
  type InfluenceSegment,
  type InfluenceSource,
} from "../../lib/metaball";
import { getCampaignHyperlanes } from "../../lib/hyperlanes";
import { perfTime } from "../../lib/perfDebug";
import {
  isSystemDragging,
  subscribeSystemDrag,
} from "../../lib/systemDrag";
import {
  CLAIM_RADIUS,
  getSystemOwnership,
  territoryLayoutSignature,
} from "../../lib/territory";

interface FactionTerritoryLayerProps {
  campaign: Campaign;
}

/** Default blob size toward empty space / friendlies. */
const BASE_CLAIM_RADIUS = CLAIM_RADIUS * 1.25;
/**
 * Reach toward rivals / void as a fraction of separation.
 * Under 0.5 leaves a slim crease (Stellaris-like) and gives blur room
 * to round the contact instead of a hard flat midline.
 */
const MEET_FRACTION = 0.43;

function stripePatternId(a: string, b: string, uid: string) {
  return `stripe-${uid}-${a.slice(0, 8)}-${b.slice(0, 8)}`;
}

function clipId(regionId: string, uid: string) {
  return `clip-${uid}-${regionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
}

function contestedKey(factions: Faction[]) {
  return [...factions.map((f) => f.id)].sort().join("|");
}

type TerritoryRegions = ReturnType<typeof buildCompetitiveTerritories>;

type ClaimRef = {
  system: StarSystem;
  entryId: string;
};

/**
 * Smooth capsule between two same-claim systems so merges stay organic
 * (no beaded waist from stacked point kernels).
 */
function corridorSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radiusA: number,
  radiusB: number,
): InfluenceSegment | null {
  const dist = Math.hypot(bx - ax, by - ay);
  if (dist < 1) return null;

  // Already overlapping enough to merge at threshold ~0.4.
  const mergeDist = (radiusA + radiusB) * 0.75;
  if (dist <= mergeDist) return null;

  return {
    x1: ax,
    y1: ay,
    x2: bx,
    y2: by,
    // Slightly under the point radii so the waist reads as a soft link.
    radius: Math.min(radiusA, radiusB) * 0.85,
  };
}

function claimEntryIdForOwnership(
  ownership: ReturnType<typeof getSystemOwnership>,
): string | null {
  if (ownership.status === "owned") return ownership.factions[0]!.id;
  if (ownership.status === "contested") {
    return `contested:${contestedKey(ownership.factions)}`;
  }
  return null;
}

function claimEntryForOwnership(
  ownership: ReturnType<typeof getSystemOwnership>,
  byFaction: Map<string, FactionInfluence>,
  byContested: Map<string, FactionInfluence>,
): FactionInfluence | null {
  if (ownership.status === "owned") {
    return byFaction.get(ownership.factions[0]!.id) ?? null;
  }
  if (ownership.status === "contested") {
    return (
      byContested.get(`contested:${contestedKey(ownership.factions)}`) ?? null
    );
  }
  return null;
}

function emptyEntry(
  partial: Omit<FactionInfluence, "sources" | "segments">,
): FactionInfluence {
  return { ...partial, sources: [], segments: [] };
}

/**
 * Grow toward the nearest claimed rival (loosened meet fraction), but never
 * past the meet line toward an unclaimed star — otherwise BASE reach paints
 * over void systems (claimed border cutting through unowned neighbors).
 */
function claimRadiusForSystem(
  system: StarSystem,
  entryId: string,
  claims: ClaimRef[],
): number {
  let nearestClaimedRival = Infinity;
  let nearestUnclaimed = Infinity;
  for (const other of claims) {
    if (other.system.id === system.id) continue;
    if (other.entryId === entryId) continue;
    const dist = Math.hypot(
      other.system.x - system.x,
      other.system.y - system.y,
    );
    if (other.entryId.startsWith("unowned:")) {
      nearestUnclaimed = Math.min(nearestUnclaimed, dist);
    } else {
      nearestClaimedRival = Math.min(nearestClaimedRival, dist);
    }
  }

  let radius = BASE_CLAIM_RADIUS;
  if (Number.isFinite(nearestClaimedRival)) {
    radius = Math.max(radius, nearestClaimedRival * MEET_FRACTION);
  }
  // Cap open flanks at the void meet so unclaimed stars stay outside the blob.
  if (Number.isFinite(nearestUnclaimed)) {
    radius = Math.min(radius, nearestUnclaimed * MEET_FRACTION);
  }
  return radius;
}

/**
 * Void kernel radius — reserve space around unclaimed stars without erasing
 * nearby claims. Must NOT floor at BASE: a close unclaimed star with a full
 * BASE void would out-compete and delete the claimed sphere.
 */
function voidRadiusForSystem(system: StarSystem, claims: ClaimRef[]): number {
  let nearestClaimed = Infinity;
  for (const other of claims) {
    if (other.system.id === system.id) continue;
    if (other.entryId.startsWith("unowned:")) continue;
    const dist = Math.hypot(
      other.system.x - system.x,
      other.system.y - system.y,
    );
    nearestClaimed = Math.min(nearestClaimed, dist);
  }
  if (!Number.isFinite(nearestClaimed)) return BASE_CLAIM_RADIUS;
  // At most BASE, and never past the meet-fraction of the gap to a claim.
  return Math.min(BASE_CLAIM_RADIUS, nearestClaimed * MEET_FRACTION);
}

function computeRegions(campaign: Campaign): TerritoryRegions {
  const byFaction = new Map<string, FactionInfluence>();
  const byContested = new Map<string, FactionInfluence>();
  const systemById = new Map(campaign.systems.map((s) => [s.id, s]));

  const allClaims: ClaimRef[] = campaign.systems.map((system) => ({
    system,
    entryId:
      claimEntryIdForOwnership(getSystemOwnership(campaign, system.id)) ??
      `unowned:${system.id}`,
  }));

  const radiusBySystemId = new Map<string, number>();
  for (const claim of allClaims) {
    if (claim.entryId.startsWith("unowned:")) continue;
    radiusBySystemId.set(
      claim.system.id,
      claimRadiusForSystem(claim.system, claim.entryId, allClaims),
    );
  }

  const neutralSources: InfluenceSource[] = [];
  for (const claim of allClaims) {
    if (!claim.entryId.startsWith("unowned:")) continue;
    neutralSources.push({
      x: claim.system.x,
      y: claim.system.y,
      radius: voidRadiusForSystem(claim.system, allClaims),
    });
  }

  for (const system of campaign.systems) {
    const ownership = getSystemOwnership(campaign, system.id);
    if (ownership.status === "unowned") continue;
    const radius = radiusBySystemId.get(system.id) ?? BASE_CLAIM_RADIUS;
    const source: InfluenceSource = {
      x: system.x,
      y: system.y,
      radius,
    };

    if (ownership.status === "owned") {
      const faction = ownership.factions[0]!;
      const entry =
        byFaction.get(faction.id) ??
        emptyEntry({
          id: faction.id,
          color: faction.color,
          kind: "owned",
        });
      entry.sources.push(source);
      byFaction.set(faction.id, entry);
    } else {
      const a = ownership.factions[0]!;
      const b = ownership.factions[1] ?? a;
      const key = contestedKey(ownership.factions);
      const id = `contested:${key}`;
      const entry =
        byContested.get(id) ??
        emptyEntry({
          id,
          color: a.color,
          kind: "contested",
          // One-faction contested (unowned worlds remain) stripes with muted void.
          stripeColors: [
            a.color,
            ownership.factions.length > 1 ? b.color : "#3a4550",
          ],
        });
      entry.sources.push(source);
      byContested.set(id, entry);
    }
  }

  const bridgedPairs = new Set<string>();
  const pairKey = (a: string, b: string) =>
    a < b ? `${a}|${b}` : `${b}|${a}`;

  const tryBridge = (
    sysA: StarSystem,
    sysB: StarSystem,
    entry: FactionInfluence,
  ) => {
    const key = pairKey(sysA.id, sysB.id);
    if (bridgedPairs.has(key)) return;
    const rA = radiusBySystemId.get(sysA.id) ?? BASE_CLAIM_RADIUS;
    const rB = radiusBySystemId.get(sysB.id) ?? BASE_CLAIM_RADIUS;
    const segment = corridorSegment(sysA.x, sysA.y, sysB.x, sysB.y, rA, rB);
    if (!segment) return;
    bridgedPairs.add(key);
    entry.segments = entry.segments ?? [];
    entry.segments.push(segment);
  };

  // Hyperlane bridges: same-claim systems on a lane always try to merge.
  for (const lane of getCampaignHyperlanes(campaign)) {
    const sysA = systemById.get(lane.a);
    const sysB = systemById.get(lane.b);
    if (!sysA || !sysB) continue;

    const ownA = getSystemOwnership(campaign, sysA.id);
    const ownB = getSystemOwnership(campaign, sysB.id);
    if (ownA.status === "unowned" || ownB.status === "unowned") continue;

    const entryA = claimEntryForOwnership(ownA, byFaction, byContested);
    const entryB = claimEntryForOwnership(ownB, byFaction, byContested);
    if (!entryA || !entryB || entryA.id !== entryB.id) continue;

    tryBridge(sysA, sysB, entryA);
  }

  // Friendly near-miss (no hyperlane required): close same-claim systems merge.
  const claimedByEntry = new Map<string, StarSystem[]>();
  for (const system of campaign.systems) {
    const ownership = getSystemOwnership(campaign, system.id);
    const entry = claimEntryForOwnership(ownership, byFaction, byContested);
    if (!entry) continue;
    const list = claimedByEntry.get(entry.id) ?? [];
    list.push(system);
    claimedByEntry.set(entry.id, list);
  }
  for (const [entryId, systems] of claimedByEntry) {
    const entry =
      byFaction.get(entryId) ?? byContested.get(entryId) ?? null;
    if (!entry) continue;
    for (let i = 0; i < systems.length; i++) {
      const sysA = systems[i]!;
      const rA = radiusBySystemId.get(sysA.id) ?? BASE_CLAIM_RADIUS;
      for (let j = i + 1; j < systems.length; j++) {
        const sysB = systems[j]!;
        const rB = radiusBySystemId.get(sysB.id) ?? BASE_CLAIM_RADIUS;
        const dist = Math.hypot(sysA.x - sysB.x, sysA.y - sysB.y);
        if (dist > (rA + rB) * 1.15) continue;
        tryBridge(sysA, sysB, entry);
      }
    }
  }

  const claims = [...byFaction.values(), ...byContested.values()];
  return perfTime("buildCompetitiveTerritories", () =>
    buildCompetitiveTerritories(claims, {
      cellSize: 12,
      threshold: 0.4,
      blurPasses: 7,
      neutralSources,
    }),
  );
}

/**
 * Stellaris-style territories:
 * - owned + contested claims compete via soft influence fields
 * - dual faction-colored borders clipped to each fill
 * - deferred while a star is being dragged (rebuild on pointer-up)
 */
export function FactionTerritoryLayer({ campaign }: FactionTerritoryLayerProps) {
  const uid = useId().replace(/:/g, "");
  const [dragging, setDragging] = useState(() => isSystemDragging());
  const lastRegionsRef = useRef<TerritoryRegions | null>(null);
  const lastSigRef = useRef<string>("");

  useEffect(() => subscribeSystemDrag(() => setDragging(isSystemDragging())), []);

  const layoutSig = territoryLayoutSignature(campaign);

  const regions = useMemo(() => {
    if (dragging && lastRegionsRef.current) {
      return lastRegionsRef.current;
    }
    if (lastRegionsRef.current && layoutSig === lastSigRef.current) {
      return lastRegionsRef.current;
    }
    const next = computeRegions(campaign);
    lastRegionsRef.current = next;
    lastSigRef.current = layoutSig;
    return next;
    // campaign is read inside computeRegions; layoutSig covers relevant fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature gates rebuilds
  }, [layoutSig, dragging, campaign]);

  if (regions.fills.length === 0) return null;

  const stripeKeys = new Map<string, [string, string]>();

  for (const fill of regions.fills) {
    if (fill.kind === "contested" && fill.stripeColors) {
      stripeKeys.set(
        stripePatternId(fill.stripeColors[0], fill.stripeColors[1], uid),
        fill.stripeColors,
      );
    }
  }

  const fillById = new Map(regions.fills.map((f) => [f.id, f]));
  const mapSize = campaignMapSize(campaign);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={mapSize}
      height={mapSize}
      viewBox={`0 0 ${mapSize} ${mapSize}`}
      aria-hidden
      style={{ width: mapSize, height: mapSize, overflow: "visible" }}
    >
      <defs>
        {regions.fills.map((fill) => (
          <clipPath key={clipId(fill.id, uid)} id={clipId(fill.id, uid)}>
            <path d={fill.path} />
          </clipPath>
        ))}

        {Array.from(stripeKeys.entries()).map(([id, [a, b]]) => (
          <pattern
            key={id}
            id={id}
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <rect width="28" height="28" fill={a} opacity="0.2" />
            <rect width="14" height="28" fill={b} opacity="0.55" />
            <rect x="14" width="14" height="28" fill={a} opacity="0.55" />
          </pattern>
        ))}
      </defs>

      {regions.fills.map((fill) => {
        if (fill.kind === "contested" && fill.stripeColors) {
          return (
            <path
              key={`fill-${fill.id}`}
              d={fill.path}
              fill={`url(#${stripePatternId(fill.stripeColors[0], fill.stripeColors[1], uid)})`}
              opacity={0.95}
            />
          );
        }
        return (
          <path
            key={`fill-${fill.id}`}
            d={fill.path}
            fill={fill.color}
            opacity={0.2}
          />
        );
      })}

      {regions.borders.map((border) => {
        const fill = fillById.get(border.id);
        if (!fill) return null;

        if (border.kind === "contested" && border.stripeColors) {
          const [a, b] = border.stripeColors;
          return (
            <g
              key={`border-${border.id}`}
              clipPath={`url(#${clipId(border.id, uid)})`}
            >
              <path
                d={border.path}
                fill="none"
                stroke={a}
                strokeWidth={14}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.95}
              />
              <path
                d={border.path}
                fill="none"
                stroke={b}
                strokeWidth={7}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.85}
              />
            </g>
          );
        }

        return (
          <g
            key={`border-${border.id}`}
            clipPath={`url(#${clipId(border.id, uid)})`}
          >
            <path
              d={border.path}
              fill="none"
              stroke={border.color}
              strokeWidth={14}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.95}
            />
          </g>
        );
      })}
    </svg>
  );
}
