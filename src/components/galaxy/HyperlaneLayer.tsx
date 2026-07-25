import { useMemo } from "react";
import type { StarSystem } from "../../types/campaign";
import { buildHyperlanes, hyperlaneEndpoints } from "../../lib/hyperlanes";

interface HyperlaneLayerProps {
  systems: StarSystem[];
  mapSize: number;
}

/**
 * Stellaris-style hyperlanes — thin cyan links between nearby systems.
 */
export function HyperlaneLayer({ systems, mapSize }: HyperlaneLayerProps) {
  const lanes = useMemo(() => buildHyperlanes(systems), [systems]);

  if (lanes.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={mapSize}
      height={mapSize}
      viewBox={`0 0 ${mapSize} ${mapSize}`}
      aria-hidden
      style={{ width: mapSize, height: mapSize, overflow: "visible" }}
    >
      {lanes.map((lane) => {
        const ends = hyperlaneEndpoints(lane, systems);
        if (!ends) return null;
        return (
          <g key={lane.id}>
            <line
              x1={ends.x1}
              y1={ends.y1}
              x2={ends.x2}
              y2={ends.y2}
              stroke="rgba(79, 210, 255, 0.18)"
              strokeWidth={6}
              strokeLinecap="round"
            />
            <line
              x1={ends.x1}
              y1={ends.y1}
              x2={ends.x2}
              y2={ends.y2}
              stroke="rgba(120, 220, 255, 0.55)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}
