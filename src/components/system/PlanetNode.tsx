import type { Faction, Planet } from "../../types/campaign";
import {
  PLANET_CLASSIFICATION_LABELS,
  PLANET_TYPE_LABELS,
} from "../../types/campaign";
import { classificationColor } from "../../lib/planetClass";

interface PlanetNodeProps {
  planet: Planet;
  x: number;
  y: number;
  faction?: Faction;
  selected: boolean;
  mapScale: number;
  onNavigate: () => void;
}

export function PlanetNode({
  planet,
  x,
  y,
  faction,
  selected,
  mapScale,
  onNavigate,
}: PlanetNodeProps) {
  const base = classificationColor(planet.classification);
  const ring = faction?.color ?? base;
  const showLabel = mapScale >= 0.55 || selected;
  const classLabel =
    PLANET_CLASSIFICATION_LABELS[planet.classification] ??
    PLANET_CLASSIFICATION_LABELS.earthlike;

  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 bg-transparent border-0 p-0 cursor-pointer group"
      style={{ left: x, top: y }}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate();
      }}
      title={`${planet.name} — ${PLANET_TYPE_LABELS[planet.type]} · ${classLabel}`}
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
            {classLabel}
          </span>
        </>
      )}
    </button>
  );
}
