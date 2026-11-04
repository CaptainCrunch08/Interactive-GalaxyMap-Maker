import { useMemo } from "react";
import type { Campaign, StarSystem } from "../../types/campaign";
import {
  getCampaignHyperlanes,
  hyperlaneEndpoints,
} from "../../lib/hyperlanes";
import { warpLaneSystemPairs } from "../../lib/warpGates";

interface HyperlaneLayerProps {
  systems: StarSystem[];
  mapSize: number;
  /** Full campaign — uses persisted lanes when present. */
  campaign?: Campaign;
  /** Current galaxy zoom — thickens warp lanes when zoomed out. */
  mapScale?: number;
  /** When true, lanes can be clicked (editor connect mode). */
  interactive?: boolean;
  selectedLaneId?: string | null;
  onLaneClick?: (laneId: string) => void;
}

/**
 * Stellaris-style hyperlanes — thin cyan links between nearby systems.
 * Linked warp gates draw as brighter gold dashed lanes that stay readable
 * when zoomed out.
 */
export function HyperlaneLayer({
  systems,
  mapSize,
  campaign,
  mapScale = 1,
  interactive = false,
  selectedLaneId,
  onLaneClick,
}: HyperlaneLayerProps) {
  const lanes = useMemo(() => {
    if (campaign) return getCampaignHyperlanes(campaign);
    return getCampaignHyperlanes({
      version: 1,
      name: "",
      factions: [],
      symbols: [],
      systems,
      planets: [],
      fleets: [],
      characters: [],
    });
  }, [campaign, systems]);

  const warpLanes = useMemo(() => {
    if (!campaign) return [];
    return warpLaneSystemPairs(campaign);
  }, [campaign]);

  if (lanes.length === 0 && warpLanes.length === 0) return null;

  const scale = Math.max(0.05, mapScale);
  // World-space stroke so screen thickness stays ~constant when zooming out.
  const warpCore = Math.min(18, Math.max(3.5, 4.5 / scale));
  const warpGlow = warpCore * 2.4;
  const dashOn = Math.min(48, Math.max(10, 14 / scale));
  const dashOff = Math.min(36, Math.max(8, 10 / scale));

  return (
    <svg
      className={`absolute left-0 top-0 ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
      width={mapSize}
      height={mapSize}
      viewBox={`0 0 ${mapSize} ${mapSize}`}
      aria-hidden={!interactive}
      style={{ width: mapSize, height: mapSize, overflow: "visible" }}
    >
      {warpLanes.map((lane) => {
        const a = systems.find((s) => s.id === lane.a);
        const b = systems.find((s) => s.id === lane.b);
        if (!a || !b) return null;
        return (
          <g key={`${lane.gateA}-${lane.gateB}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(232, 197, 71, 0.28)"
              strokeWidth={warpGlow}
              strokeLinecap="round"
              className="pointer-events-none"
            />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(255, 220, 120, 0.92)"
              strokeWidth={warpCore}
              strokeLinecap="round"
              strokeDasharray={`${dashOn} ${dashOff}`}
              className="pointer-events-none"
            />
          </g>
        );
      })}
      {lanes.map((lane) => {
        const ends = hyperlaneEndpoints(lane, systems);
        if (!ends) return null;
        const selected = selectedLaneId === lane.id;
        return (
          <g key={lane.id}>
            <line
              x1={ends.x1}
              y1={ends.y1}
              x2={ends.x2}
              y2={ends.y2}
              stroke={
                selected
                  ? "rgba(255, 180, 80, 0.35)"
                  : "rgba(79, 210, 255, 0.18)"
              }
              strokeWidth={interactive ? 14 : 6}
              strokeLinecap="round"
              className={interactive ? "cursor-pointer" : undefined}
              onClick={
                interactive && onLaneClick
                  ? (e) => {
                      e.stopPropagation();
                      onLaneClick(lane.id);
                    }
                  : undefined
              }
            />
            <line
              x1={ends.x1}
              y1={ends.y1}
              x2={ends.x2}
              y2={ends.y2}
              stroke={
                selected
                  ? "rgba(255, 200, 100, 0.95)"
                  : "rgba(120, 220, 255, 0.55)"
              }
              strokeWidth={selected ? 3 : 2}
              strokeLinecap="round"
              className="pointer-events-none"
            />
          </g>
        );
      })}
    </svg>
  );
}
