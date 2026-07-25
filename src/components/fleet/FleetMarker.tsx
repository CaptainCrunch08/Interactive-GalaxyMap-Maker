import type { Fleet } from "../../types/campaign";
import { shipCount } from "../../lib/fleets";

const ICON = 18;
/** Horizontal spacing between stacked fleets at the same location. */
const COL_GAP = 26;
/** Vertical spacing for wrap rows. */
const ROW_GAP = 24;
const COLS = 4;

type FleetMarkerProps = {
  fleet: Fleet;
  color: string;
  x: number;
  y: number;
  selected: boolean;
  moving: boolean;
  mapScale?: number;
  offsetIndex?: number;
  /** Total fleets at this anchor — used to center the stack. */
  stackCount?: number;
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
  stackCount,
  onSelect,
}: FleetMarkerProps) {
  const n = shipCount(fleet);
  const showLabel = mapScale >= 0.55 || selected || moving;

  const total = Math.max(stackCount ?? offsetIndex + 1, 1);
  const col = offsetIndex % COLS;
  const row = Math.floor(offsetIndex / COLS);
  const colsInRow = Math.min(COLS, total - row * COLS);
  const rowWidth = (colsInRow - 1) * COL_GAP;
  const ox = col * COL_GAP - rowWidth / 2;
  const oy = -row * ROW_GAP;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-20 pointer-events-none"
      style={{ left: x + ox, top: y + oy }}
    >
      {/* Hit target is icon-only so system stars stay clickable */}
      <button
        type="button"
        className="pointer-events-auto relative bg-transparent border-0 p-0 cursor-pointer transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        style={{ width: ICON, height: ICON }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        title={`${fleet.name} · ${n} ships`}
        aria-label={`${fleet.name}, ${n} ships`}
      >
        <span
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: "rotate(45deg)",
            background: color,
            boxShadow:
              selected || moving
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
      </button>
      {showLabel && (
        <span
          className="text-[9px] whitespace-nowrap px-1 rounded max-w-[7rem] truncate pointer-events-none"
          style={{
            color: "#e8f0f8",
            background: "rgba(6,12,20,0.75)",
            borderBottom: moving ? `1px solid ${color}` : undefined,
          }}
        >
          {fleet.name}
        </span>
      )}
    </div>
  );
}
