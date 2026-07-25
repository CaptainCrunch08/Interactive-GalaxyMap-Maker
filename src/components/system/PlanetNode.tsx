import type { Faction, Planet } from "../../types/campaign";
import { PLANET_TYPE_LABELS } from "../../types/campaign";

interface PlanetNodeProps {
  planet: Planet;
  x: number;
  y: number;
  faction?: Faction;
  selected: boolean;
  mapScale: number;
  onNavigate: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  hive: "#9ca3af",
  forge: "#f59e0b",
  agri: "#4ade80",
  death: "#ef4444",
  shrine: "#a78bfa",
  custom: "#6b7280",
};

export function PlanetNode({
  planet,
  x,
  y,
  faction,
  selected,
  mapScale,
  onNavigate,
}: PlanetNodeProps) {
  const base = TYPE_COLORS[planet.type] ?? "#6b7280";
  const ring = faction?.color ?? base;
  const showLabel = mapScale >= 0.55 || selected;

  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 bg-transparent border-0 p-0 cursor-pointer group"
      style={{ left: x, top: y }}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate();
      }}
      title={`${planet.name} — ${PLANET_TYPE_LABELS[planet.type]}`}
    >
      <span
        className="block w-3.5 h-3.5 rounded-full border transition-transform group-hover:scale-125"
        style={{
          background: `radial-gradient(circle at 30% 30%, #fff8, ${base})`,
          borderColor: ring,
          boxShadow: selected
            ? `0 0 10px ${ring}, 0 0 18px ${ring}88`
            : `0 0 6px ${ring}55`,
        }}
      />
      {showLabel && (
        <>
          <span className="text-[10px] leading-tight text-text whitespace-nowrap drop-shadow-[0_1px_2px_#000]">
            {planet.name}
          </span>
          <span className="text-[9px] leading-tight text-muted whitespace-nowrap">
            {PLANET_TYPE_LABELS[planet.type]}
          </span>
        </>
      )}
    </button>
  );
}
