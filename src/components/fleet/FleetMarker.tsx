import { useEffect, useMemo, useRef, useState } from "react";
import type { Fleet, ShipChassis } from "../../types/campaign";
import { shipCount } from "../../lib/fleets";
import {
  CHASSIS_VISUAL_SCALE,
  formationChassisList,
} from "../../lib/shipMeshes";
import { getShipIconDataUrl } from "../../lib/shipIconRenderer";

const BADGE_ICON = 28;
/** Base pixel size for a cruiser-scale hull in system view. */
const SHIP_BASE = 22;
/** Horizontal spacing between stacked fleets at the same location. */
const BADGE_COL_GAP = 26;
const SHIP_COL_GAP = 72;
/** Vertical spacing for wrap rows. */
const BADGE_ROW_GAP = 24;
const SHIP_ROW_GAP = 48;
const COLS = 4;
const MAX_FORMATION = 7;

type FleetMarkerProps = {
  fleet: Fleet;
  color: string;
  /** Faction / fleet emblem data URL (optional). */
  symbolUrl?: string | null;
  x: number;
  y: number;
  selected: boolean;
  moving: boolean;
  mapScale?: number;
  offsetIndex?: number;
  /** Total fleets at this anchor — used to center the stack. */
  stackCount?: number;
  /** System view uses low-poly ship models; galaxy keeps the diamond badge. */
  appearance?: "badge" | "ship";
  onSelect: () => void;
};

/** Wedge / V formation offsets (lead ship at index 0). */
function formationOffset(
  index: number,
  total: number,
): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: 0 };
  if (index === 0) return { x: 6, y: 0 };
  const pair = Math.ceil(index / 2);
  const side = index % 2 === 1 ? -1 : 1;
  return {
    x: 6 - pair * 11,
    y: side * (7 + pair * 2),
  };
}

function shipPx(chassis: ShipChassis): number {
  return Math.round(SHIP_BASE * (CHASSIS_VISUAL_SCALE[chassis] ?? 1));
}

function moveDurationMs(fromX: number, fromY: number, toX: number, toY: number) {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  return Math.min(1400, Math.max(400, dist * 0.85));
}

/** Fleet marker — diamond badge (galaxy) or small multi-ship formation (system). */
export function FleetMarker({
  fleet,
  color,
  symbolUrl,
  x,
  y,
  selected,
  moving,
  mapScale: _mapScale = 1,
  offsetIndex = 0,
  stackCount,
  appearance = "badge",
  onSelect,
}: FleetMarkerProps) {
  const n = shipCount(fleet);
  const showLabel = selected;
  const isShip = appearance === "ship";

  const colGap = isShip ? SHIP_COL_GAP : BADGE_COL_GAP;
  const rowGap = isShip ? SHIP_ROW_GAP : BADGE_ROW_GAP;

  const total = Math.max(stackCount ?? offsetIndex + 1, 1);
  const col = offsetIndex % COLS;
  const row = Math.floor(offsetIndex / COLS);
  const colsInRow = Math.min(COLS, total - row * COLS);
  const rowWidth = (colsInRow - 1) * colGap;
  const ox = col * colGap - rowWidth / 2;
  const oy = -row * rowGap;

  const targetX = x + ox;
  const targetY = y + oy;

  const [display, setDisplay] = useState({ x: targetX, y: targetY });
  const [durationMs, setDurationMs] = useState(0);
  const [animating, setAnimating] = useState(false);
  const primed = useRef(false);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (!primed.current) {
      primed.current = true;
      setDisplay({ x: targetX, y: targetY });
      setDurationMs(0);
      setAnimating(false);
      return;
    }
    const from = displayRef.current;
    if (
      Math.abs(from.x - targetX) < 0.5 &&
      Math.abs(from.y - targetY) < 0.5
    ) {
      return;
    }
    const ms = moveDurationMs(from.x, from.y, targetX, targetY);
    setDurationMs(ms);
    setAnimating(true);
    // Next frame so the browser applies the transition from the current left/top.
    const id = requestAnimationFrame(() => {
      setDisplay({ x: targetX, y: targetY });
    });
    const done = window.setTimeout(() => setAnimating(false), ms + 40);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(done);
    };
  }, [targetX, targetY]);

  const chassisList = useMemo(
    () => (isShip ? formationChassisList(fleet.ships, MAX_FORMATION) : []),
    [isShip, fleet.ships],
  );

  const shipIcons = useMemo(() => {
    if (!isShip) return [];
    return chassisList.map((chassis) => ({
      chassis,
      src: getShipIconDataUrl(chassis, color),
      size: shipPx(chassis),
    }));
  }, [isShip, chassisList, color]);

  const formationSpan = useMemo(() => {
    if (!isShip || shipIcons.length === 0) {
      return { w: BADGE_ICON, h: BADGE_ICON };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    shipIcons.forEach((ship, i) => {
      const o = formationOffset(i, shipIcons.length);
      const half = ship.size / 2;
      minX = Math.min(minX, o.x - half);
      maxX = Math.max(maxX, o.x + half);
      minY = Math.min(minY, o.y - half);
      maxY = Math.max(maxY, o.y + half);
    });
    return {
      w: Math.max(28, Math.ceil(maxX - minX + 4)),
      h: Math.max(28, Math.ceil(maxY - minY + 4)),
    };
  }, [isShip, shipIcons]);

  const glow =
    selected || moving || animating
      ? `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 1px #fff)`
      : `drop-shadow(0 0 3px ${color}99)`;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-20 pointer-events-none"
      style={{
        left: display.x,
        top: display.y,
        transition:
          durationMs > 0
            ? `left ${durationMs}ms cubic-bezier(0.22, 0.61, 0.36, 1), top ${durationMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
            : undefined,
        willChange: animating ? "left, top" : undefined,
      }}
    >
      <button
        type="button"
        className="pointer-events-auto relative bg-transparent border-0 p-0 cursor-pointer transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        style={{
          width: isShip ? formationSpan.w : BADGE_ICON,
          height: isShip ? formationSpan.h : BADGE_ICON,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        title={`${fleet.name} · ${n} ships`}
        aria-label={`${fleet.name}, ${n} ships`}
      >
        {isShip ? (
          <>
            <span className="absolute inset-0 fleet-ship-bob pointer-events-none">
              {shipIcons.map((ship, i) => {
                const o = formationOffset(i, shipIcons.length);
                return (
                  <img
                    key={`${ship.chassis}-${i}`}
                    src={ship.src}
                    alt=""
                    draggable={false}
                    className="absolute object-contain"
                    style={{
                      width: ship.size,
                      height: ship.size,
                      left: "50%",
                      top: "50%",
                      transform: `translate(calc(-50% + ${o.x}px), calc(-50% + ${o.y}px))`,
                      filter: glow,
                      zIndex: shipIcons.length - i,
                    }}
                  />
                );
              })}
            </span>
            {n > MAX_FORMATION && (
              <span
                className="absolute -top-1 -right-1 min-w-[14px] h-[12px] px-0.5 rounded-sm flex items-center justify-center text-[7px] font-bold leading-none z-10"
                style={{
                  background: "rgba(6,12,20,0.85)",
                  color: "#e8f0f8",
                  border: `1px solid ${color}`,
                }}
              >
                +{n - MAX_FORMATION}
              </span>
            )}
            {symbolUrl ? (
              <span
                className="absolute -bottom-1 -left-1 w-[16px] h-[16px] rounded-sm flex items-center justify-center z-10 overflow-hidden"
                style={{
                  background: color,
                  boxShadow:
                    selected || moving || animating
                      ? `0 0 6px ${color}`
                      : `0 0 3px ${color}88`,
                  outline:
                    selected || moving || animating
                      ? `1px solid #e8f0f8`
                      : undefined,
                }}
              >
                <img
                  src={symbolUrl}
                  alt=""
                  draggable={false}
                  className="w-[12px] h-[12px] object-contain"
                />
              </span>
            ) : null}
            <span
              className="absolute -bottom-0.5 -right-0.5 min-w-[12px] h-[12px] px-0.5 rounded-sm flex items-center justify-center text-[7px] font-bold leading-none z-10"
              style={{
                background: color,
                color: "#0a1018",
                boxShadow:
                  selected || moving || animating
                    ? `0 0 6px ${color}`
                    : `0 0 3px ${color}88`,
                outline:
                  selected || moving || animating
                    ? `1px solid #e8f0f8`
                    : undefined,
              }}
            >
              {n}
            </span>
          </>
        ) : (
          <>
            <span
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: "rotate(45deg)",
                background: color,
                boxShadow:
                  selected || moving || animating
                    ? `0 0 12px ${color}, 0 0 2px #fff`
                    : `0 0 6px ${color}99`,
                outline:
                  selected || moving || animating
                    ? `2px solid #e8f0f8`
                    : undefined,
                outlineOffset: 2,
              }}
            >
              <span
                className="absolute inset-[3px] flex items-center justify-center overflow-hidden"
                style={{ transform: "rotate(-45deg)" }}
              >
                {symbolUrl ? (
                  <img
                    src={symbolUrl}
                    alt=""
                    draggable={false}
                    className="w-[18px] h-[18px] object-contain"
                  />
                ) : (
                  <span
                    className="text-[10px] font-bold leading-none"
                    style={{ color: "#0a1018" }}
                  >
                    {n}
                  </span>
                )}
              </span>
            </span>
            {symbolUrl && (
              <span
                className="absolute -bottom-1 -right-1 min-w-[12px] h-[12px] px-0.5 rounded-sm flex items-center justify-center text-[7px] font-bold leading-none z-10"
                style={{
                  background: "rgba(6,12,20,0.9)",
                  color: "#e8f0f8",
                  border: `1px solid ${color}`,
                }}
              >
                {n}
              </span>
            )}
          </>
        )}
      </button>
      {showLabel && (
        <span
          className="text-[10px] leading-tight text-center px-1.5 py-0.5 rounded max-w-[9rem] pointer-events-none"
          style={{
            color: "#e8f0f8",
            background: "rgba(6,12,20,0.8)",
            borderBottom:
              moving || animating ? `1px solid ${color}` : undefined,
            marginTop: isShip ? 2 : 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
          title={fleet.name}
        >
          {fleet.name}
        </span>
      )}
    </div>
  );
}
