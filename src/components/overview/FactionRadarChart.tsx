import { useMemo } from "react";
import type { FactionPowerRow, PowerAxisId } from "../../lib/strategicOverview";
import {
  POWER_AXIS_LABELS,
  POWER_AXIS_ORDER,
} from "../../lib/strategicOverview";

type FactionRadarChartProps = {
  factions: FactionPowerRow[];
};

/** Chart lives in unit space; outer pad keeps axis labels inside the viewBox. */
const PAD = 0.2;
const CX = 0.5;
const CY = 0.5;
const RADIUS = 0.34;

function polar(axisIndex: number, value01: number, total: number) {
  const angle = -Math.PI / 2 + (axisIndex / total) * Math.PI * 2;
  const r = RADIUS * value01;
  return {
    x: CX + Math.cos(angle) * r,
    y: CY + Math.sin(angle) * r,
    angle,
  };
}

function ringPoints(level: number, total: number): string {
  return Array.from({ length: total }, (_, i) => {
    const p = polar(i, level, total);
    return `${p.x},${p.y}`;
  }).join(" ");
}

function labelAnchor(angle: number): {
  textAnchor: "start" | "middle" | "end";
  dx: number;
  dy: number;
} {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let textAnchor: "start" | "middle" | "end" = "middle";
  if (cos > 0.35) textAnchor = "start";
  else if (cos < -0.35) textAnchor = "end";
  return {
    textAnchor,
    dx: cos * 0.02,
    dy: sin * 0.02 + (Math.abs(cos) < 0.35 ? (sin < 0 ? -0.01 : 0.02) : 0),
  };
}

/**
 * Comparative spider chart — each faction is a filled polygon on 0–100 axes.
 */
export function FactionRadarChart({ factions }: FactionRadarChartProps) {
  const axes = POWER_AXIS_ORDER;
  const n = axes.length;

  const polygons = useMemo(() => {
    return factions.map((f) => {
      const pts = axes.map((axis, i) => {
        const v = (f.scores[axis as PowerAxisId] ?? 0) / 100;
        return polar(i, Math.max(0.02, v), n);
      });
      return {
        id: f.factionId,
        color: f.color,
        name: f.name,
        points: pts.map((p) => `${p.x},${p.y}`).join(" "),
      };
    });
  }, [factions, axes, n]);

  const labelPos = axes.map((axis, i) => {
    const p = polar(i, 1.22, n);
    const anchor = labelAnchor(p.angle);
    return { axis, ...p, ...anchor };
  });

  return (
    <div className="w-full flex flex-col items-center gap-4 overflow-visible">
      <svg
        viewBox={`${-PAD} ${-PAD} ${1 + PAD * 2} ${1 + PAD * 2}`}
        className="w-full max-w-[28rem] aspect-square overflow-visible"
        role="img"
        aria-label="Faction power matrix radar chart"
      >
        {[0.25, 0.5, 0.75, 1].map((level) => (
          <polygon
            key={level}
            points={ringPoints(level, n)}
            fill="none"
            stroke="rgba(120, 140, 160, 0.28)"
            strokeWidth={0.004}
          />
        ))}
        {axes.map((_, i) => {
          const tip = polar(i, 1, n);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={tip.x}
              y2={tip.y}
              stroke="rgba(120, 140, 160, 0.35)"
              strokeWidth={0.003}
            />
          );
        })}
        {polygons.map((poly) => (
          <polygon
            key={poly.id}
            points={poly.points}
            fill={poly.color}
            fillOpacity={0.18}
            stroke={poly.color}
            strokeWidth={0.008}
            strokeLinejoin="round"
          />
        ))}
        {labelPos.map(({ axis, x, y, textAnchor, dx, dy }) => (
          <text
            key={axis}
            x={x + dx}
            y={y + dy}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fill="#9eb0c0"
            fontSize="0.048"
            fontFamily="var(--font-display, sans-serif)"
            style={{ letterSpacing: "0.06em" }}
          >
            {POWER_AXIS_LABELS[axis].toUpperCase()}
          </text>
        ))}
      </svg>

      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-2">
        {factions.map((f) => (
          <li key={f.factionId} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
              style={{ background: f.color }}
            />
            <span className="text-star truncate max-w-[10rem]">{f.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
