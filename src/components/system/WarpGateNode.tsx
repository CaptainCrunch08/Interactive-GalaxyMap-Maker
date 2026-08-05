import type { Faction, Planet } from "../../types/campaign";
import { PLANET_TYPE_LABELS } from "../../types/campaign";
import { WarpGateGlobe } from "../warpGate/WarpGateGlobe";

interface WarpGateNodeProps {
  planet: Planet;
  x: number;
  y: number;
  faction?: Faction;
  selected: boolean;
  mapScale: number;
  onNavigate: () => void;
}

/** System-map warp gate marker with a live 3D crescent station. */
export function WarpGateNode({
  planet,
  x,
  y,
  faction,
  selected,
  mapScale,
  onNavigate,
}: WarpGateNodeProps) {
  const size = Math.max(36, Math.min(72, 48 * mapScale));
  const accent = faction?.color ?? "#4fd2ff";
  const showLabel = mapScale >= 0.55 || selected;

  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 bg-transparent border-0 p-0 cursor-pointer group z-[11]"
      style={{ left: x, top: y }}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate();
      }}
      title={`${planet.name} — ${PLANET_TYPE_LABELS.warp_gate}`}
    >
      <span
        className="relative block overflow-hidden rounded-sm transition-transform group-hover:scale-110"
        style={{
          width: size,
          height: size,
          boxShadow: selected
            ? `0 0 16px ${accent}, 0 0 28px ${accent}66`
            : `0 0 10px ${accent}55`,
          outline: selected ? `1px solid ${accent}` : "1px solid transparent",
          background: "radial-gradient(circle at 50% 45%, #1a2838 0%, #060c14 75%)",
        }}
      >
        <WarpGateGlobe
          accentColor={accent}
          compact
          className="pointer-events-none"
        />
      </span>
      {showLabel && (
        <>
          <span className="text-[10px] leading-tight text-text whitespace-nowrap drop-shadow-[0_1px_2px_#000]">
            {planet.name}
          </span>
          <span className="text-[9px] leading-tight text-brass whitespace-nowrap uppercase tracking-wider">
            Warp Gate
          </span>
        </>
      )}
    </button>
  );
}
