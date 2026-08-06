import type { Faction, Planet } from "../../types/campaign";
import { PLANET_TYPE_LABELS } from "../../types/campaign";
import { WarpGateIcon } from "./WarpGateIcon";

interface WarpGateNodeProps {
  planet: Planet;
  x: number;
  y: number;
  /** Star / Dyson Sphere center — hub docks into the beam toward this point. */
  faceTowardX: number;
  faceTowardY: number;
  faction?: Faction;
  selected: boolean;
  mapScale: number;
  onNavigate: () => void;
}

/** Degrees so the icon’s hub (+Y) aims at (tx, ty) from (x, y). */
function hubFacingDegrees(
  x: number,
  y: number,
  tx: number,
  ty: number,
): number {
  const dx = tx - x;
  const dy = ty - y;
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI - 90;
}

/**
 * System-map warp gate — hub faces the Dyson beam and sits on the beam tip
 * so the tether reads as power collected into the station.
 */
export function WarpGateNode({
  planet,
  x,
  y,
  faceTowardX,
  faceTowardY,
  faction,
  selected,
  mapScale,
  onNavigate,
}: WarpGateNodeProps) {
  const size = Math.max(22, Math.min(36, 28 * mapScale));
  const accent = faction?.color ?? "#4fd2ff";
  const showLabel = mapScale >= 0.55 || selected;
  const rotation = hubFacingDegrees(x, y, faceTowardX, faceTowardY);

  // Beam ends at (x, y). Hub is ~28% of the icon toward +Y in local space;
  // push the icon center outward (away from the star) so the hub lands on the tip.
  const awayX = x - faceTowardX;
  const awayY = y - faceTowardY;
  const awayLen = Math.hypot(awayX, awayY) || 1;
  const hubInset = size * 0.28;
  const iconX = x + (awayX / awayLen) * hubInset;
  const iconY = y + (awayY / awayLen) * hubInset;

  return (
    <div
      className="absolute z-[11]"
      style={{ left: iconX, top: iconY }}
    >
      <button
        type="button"
        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 bg-transparent border-0 p-0 cursor-pointer group"
        style={{ width: size, height: size }}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate();
        }}
        title={`${planet.name} — ${PLANET_TYPE_LABELS.warp_gate}`}
      >
        <span
          className="block w-full h-full transition-transform group-hover:scale-125"
          style={{
            filter: selected
              ? `drop-shadow(0 0 6px ${accent}) drop-shadow(0 0 12px ${accent}88)`
              : `drop-shadow(0 0 4px ${accent}66)`,
          }}
        >
          <span
            className="block w-full h-full"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <WarpGateIcon accent={accent} />
          </span>
        </span>
      </button>
      {showLabel && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none"
          style={{ top: size / 2 + 2 }}
        >
          <span className="text-[10px] leading-tight text-text whitespace-nowrap drop-shadow-[0_1px_2px_#000]">
            {planet.name}
          </span>
          <span className="text-[9px] leading-tight text-brass whitespace-nowrap uppercase tracking-wider">
            Warp Gate
          </span>
        </div>
      )}
    </div>
  );
}
