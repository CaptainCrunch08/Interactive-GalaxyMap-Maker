import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Campaign, Faction } from "../../types/campaign";
import { campaignMapSize } from "../../types/campaign";
import {
  buildCompetitiveTerritories,
  type FactionInfluence,
  type InfluenceSource,
} from "../../lib/metaball";
import { perfTime } from "../../lib/perfDebug";
import {
  isSystemDragging,
  subscribeSystemDrag,
} from "../../lib/systemDrag";
import {
  CLAIM_RADIUS,
  getSystemOwnership,
} from "../../lib/territory";

interface FactionTerritoryLayerProps {
  campaign: Campaign;
}

function stripePatternId(a: string, b: string, uid: string) {
  return `stripe-${uid}-${a.slice(0, 8)}-${b.slice(0, 8)}`;
}

function glowFilterId(color: string, uid: string) {
  return `glow-${uid}-${color.replace("#", "")}`;
}

function clipId(regionId: string, uid: string) {
  return `clip-${uid}-${regionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
}

function contestedKey(factions: Faction[]) {
  return [...factions.map((f) => f.id)].sort().join("|");
}

type TerritoryRegions = ReturnType<typeof buildCompetitiveTerritories>;

function computeRegions(campaign: Campaign): TerritoryRegions {
  const claims: FactionInfluence[] = [];
  const byFaction = new Map<string, FactionInfluence>();
  const byContested = new Map<string, FactionInfluence>();

  for (const system of campaign.systems) {
    const ownership = getSystemOwnership(campaign, system.id);
    if (ownership.status === "unowned") continue;
    const source: InfluenceSource = {
      x: system.x,
      y: system.y,
      radius: CLAIM_RADIUS,
    };

    if (ownership.status === "owned") {
      const faction = ownership.factions[0];
      const entry = byFaction.get(faction.id) ?? {
        id: faction.id,
        color: faction.color,
        sources: [],
        kind: "owned" as const,
      };
      entry.sources.push(source);
      byFaction.set(faction.id, entry);
    } else {
      const a = ownership.factions[0]!;
      const b = ownership.factions[1]!;
      const key = contestedKey(ownership.factions);
      const id = `contested:${key}`;
      const entry = byContested.get(id) ?? {
        id,
        color: a.color,
        sources: [],
        kind: "contested" as const,
        stripeColors: [a.color, b.color] as [string, string],
      };
      entry.sources.push(source);
      byContested.set(id, entry);
    }
  }

  claims.push(...byFaction.values(), ...byContested.values());
  return perfTime("buildCompetitiveTerritories", () =>
    buildCompetitiveTerritories(claims, {
      cellSize: 16,
      threshold: 0.4,
    }),
  );
}

/**
 * Stellaris-style territories:
 * - owned + contested claims all compete in one influence field (no overlap)
 * - borders clipped to each region's fill so neighbors meet flush
 * - deferred while a star is being dragged (rebuild on pointer-up)
 */
export function FactionTerritoryLayer({ campaign }: FactionTerritoryLayerProps) {
  const uid = useId().replace(/:/g, "");
  const [dragging, setDragging] = useState(() => isSystemDragging());
  const lastRegionsRef = useRef<TerritoryRegions | null>(null);

  useEffect(() => subscribeSystemDrag(() => setDragging(isSystemDragging())), []);

  const regions = useMemo(() => {
    if (dragging && lastRegionsRef.current) {
      return lastRegionsRef.current;
    }
    const next = computeRegions(campaign);
    lastRegionsRef.current = next;
    return next;
  }, [campaign, dragging]);

  if (regions.fills.length === 0) return null;

  const glowColors = new Set<string>();
  const stripeKeys = new Map<string, [string, string]>();

  for (const fill of regions.fills) {
    if (fill.kind === "owned") {
      glowColors.add(fill.color);
    } else if (fill.stripeColors) {
      glowColors.add(fill.stripeColors[0]);
      glowColors.add(fill.stripeColors[1]);
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
        {Array.from(glowColors).map((color) => (
          <filter
            key={color}
            id={glowFilterId(color, uid)}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}

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
                strokeWidth={18}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.95}
                filter={`url(#${glowFilterId(a, uid)})`}
              />
              <path
                d={border.path}
                fill="none"
                stroke={b}
                strokeWidth={10}
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
              strokeWidth={18}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.95}
              filter={`url(#${glowFilterId(border.color, uid)})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
