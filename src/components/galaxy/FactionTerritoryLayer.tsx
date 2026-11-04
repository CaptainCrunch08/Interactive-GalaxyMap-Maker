import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Campaign } from "../../types/campaign";
import {
  campaignMapSize,
  campaignTerritoryMode,
} from "../../types/campaign";
import type { TerritoryBorder, TerritoryFill } from "../../lib/metaball";
import { perfTime } from "../../lib/perfDebug";
import {
  isSystemDragging,
  subscribeSystemDrag,
} from "../../lib/systemDrag";
import { territoryLayoutSignature } from "../../lib/territory";
import { buildSoiTerritories } from "../../lib/soiTerritory";
import { buildVoronoiTerritories } from "../../lib/voronoiTerritory";

interface FactionTerritoryLayerProps {
  campaign: Campaign;
}

function stripePatternId(a: string, b: string, uid: string) {
  return `stripe-${uid}-${a.slice(0, 8)}-${b.slice(0, 8)}`;
}

function clipId(regionId: string, uid: string) {
  return `clip-${uid}-${regionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
}

type TerritoryRegions = {
  fills: TerritoryFill[];
  borders: TerritoryBorder[];
};

function computeRegions(campaign: Campaign): TerritoryRegions {
  const mode = campaignTerritoryMode(campaign);
  if (
    mode === "voronoi" ||
    mode === "voronoi_soft" ||
    mode === "voronoi_shaky"
  ) {
    return perfTime("buildVoronoiTerritories", () =>
      buildVoronoiTerritories(campaign, {
        soft: mode === "voronoi_soft",
        shaky: mode === "voronoi_shaky",
      }),
    );
  }
  return perfTime("buildSoiTerritories", () => buildSoiTerritories(campaign));
}

/**
 * Territory overlays:
 * - soi (default): circular spheres of influence meeting at midpoints
 * - voronoi / soft / shaky: star-driven sector tiles
 * Deferred while a star is being dragged (rebuild on pointer-up).
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
