import type { Fleet } from "../../types/campaign";
import { shipCount } from "../../lib/fleets";

type FleetMarkerProps = {
  fleet: Fleet;
  color: string;
  x: number;
  y: number;
  selected: boolean;
  moving: boolean;
  mapScale?: number;
  offsetIndex?: number;
  onSelect: () => void;
};

/** Compact Stellaris-like fleet diamond / badge. */
export function FleetMarker({
  fleet,
  color,
  x,
  y,
  selected,
  moving,
  mapScale = 1,
  offsetIndex = 0,
  onSelect,
}: FleetMarkerProps) {
  const n = shipCount(fleet);
  const showLabel = mapScale >= 0.5 || selected || moving;
  const ox = (offsetIndex % 3) * 14 - (Math.min(offsetIndex, 2) > 0 ? 7 : 0);
  const oy = Math.floor(offsetIndex / 3) * 16;

  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 bg-transparent border-0 p-0 cursor-pointer z-20 group"
      style={{ left: x + ox, top: y + oy }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      title={`${fleet.name} · ${n} ships`}
    >
      <span
        className="relative flex items-center justify-center transition-transform group-hover:scale-110"
        style={{
          width: 18,
          height: 18,
          transform: "rotate(45deg)",
          background: color,
          boxShadow: selected || moving
            ? `0 0 12px ${color}, 0 0 2px #fff`
            : `0 0 6px ${color}99`,
          outline: selected || moving ? `2px solid #e8f0f8` : undefined,
          outlineOffset: 2,
        }}
      >
        <span
          className="text-[8px] font-bold leading-none"
          style={{
            transform: "rotate(-45deg)",
            color: "#0a1018",
          }}
        >
          {n}
        </span>
      </span>
      {showLabel && (
        <span
          className="text-[9px] whitespace-nowrap px-1 rounded max-w-[7rem] truncate"
          style={{
            color: "#e8f0f8",
            background: "rgba(6,12,20,0.75)",
            borderBottom: moving ? `1px solid ${color}` : undefined,
          }}
        >
          {fleet.name}
        </span>
      )}
    </button>
  );
}
