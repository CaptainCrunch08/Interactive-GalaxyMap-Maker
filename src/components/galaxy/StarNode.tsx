import type { Faction, StarSystem } from "../../types/campaign";
import { useRef } from "react";
import {
  isBlackHoleBomb,
  megastructureShortLabel,
  normalizeStarClass,
  starAppearance,
  starBodyGradient,
  starGlowShadow,
  starSystemLabel,
} from "../../lib/stars";
import { PulsarJets, pulsarJetAngle } from "./PulsarJets";

interface StarNodeProps {
  system: StarSystem;
  faction?: Faction;
  contested?: boolean;
  contestedFactions?: Faction[];
  selected: boolean;
  onSelect: () => void;
  onNavigate: () => void;
  /** When true, click selects; double-click enters. When false, click enters. */
  editMode: boolean;
  /** When false, star cannot be dragged (defaults to editMode). */
  canDrag?: boolean;
  mapScale: number;
  onDrag: (x: number, y: number) => void;
}

export function StarNode({
  system,
  faction,
  contested = false,
  contestedFactions,
  selected,
  onSelect,
  onNavigate,
  editMode,
  canDrag,
  mapScale,
  onDrag,
}: StarNodeProps) {
  const starClass = normalizeStarClass(system.starClass);
  const look = starAppearance(starClass);
  const isPulsar = starClass === "pulsar";
  const hasDyson = Boolean(system.dysonSphere);
  const isBomb = isBlackHoleBomb(system);
  const megaShort = megastructureShortLabel(system);
  /** Labels only when zoomed in enough (map starts ~0.45). */
  const showLabel = mapScale >= 0.55 || selected;
  const dragMoved = useRef(false);
  const allowDrag = canDrag ?? editMode;
  const bodySize = isBomb
    ? look.galaxySize * 1.7
    : hasDyson
      ? look.galaxySize * 1.35
      : look.galaxySize;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!allowDrag) return;
    e.stopPropagation();
    dragMoved.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = system.x;
    const origY = system.y;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / mapScale;
      const dy = (ev.clientY - startY) / mapScale;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved.current = true;
      onDrag(origX + dx, origY + dy);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editMode) {
      if (dragMoved.current) return;
      onSelect();
    } else {
      onNavigate();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onNavigate();
  };

  const ownerBit = contested
    ? " · Battlezone"
    : faction
      ? ` · ${faction.name}`
      : "";

  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-transparent border-0 p-0 cursor-pointer group z-10"
      style={{ left: system.x, top: system.y }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={`${system.name} · ${starSystemLabel(system)}${editMode ? " · double-click to enter" : ""}`}
    >
      <span
        className="relative block transition-transform group-hover:scale-110"
        style={{
          width: bodySize,
          height: bodySize,
        }}
      >
        {hasDyson &&
          (isBomb ? (
            <>
              <span
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: "-38%",
                  border: "2px solid #c4b5fd",
                  boxShadow:
                    "0 0 14px #22d3eeaa, 0 0 6px #f0abfc88, inset 0 0 8px #a78bfa66",
                  background:
                    "radial-gradient(circle, transparent 58%, rgba(167,139,250,0.22) 78%, transparent 92%)",
                }}
              />
              <span
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: "-22%",
                  border: "1.5px dashed #22d3ee",
                  opacity: 0.85,
                }}
              />
              {[0, 45, 90, 135].map((deg) => (
                <span
                  key={deg}
                  className="absolute pointer-events-none"
                  style={{
                    left: "50%",
                    top: "50%",
                    width: "2px",
                    height: "138%",
                    marginLeft: "-1px",
                    marginTop: "-69%",
                    background:
                      "linear-gradient(to bottom, #f0abfc00, #f0abfcbb, #22d3eecc, #f0abfc00)",
                    transform: `rotate(${deg}deg)`,
                    opacity: 0.7,
                  }}
                />
              ))}
            </>
          ) : (
            <span
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: "-18%",
                border: `1.5px dashed ${look.highlight}99`,
                boxShadow: `0 0 10px ${look.corona}66, inset 0 0 8px ${look.color}44`,
              }}
            />
          ))}
        {isPulsar && (
          <PulsarJets
            length={look.galaxySize * 2.4}
            baseWidth={Math.max(4, look.galaxySize * 0.45)}
            color={look.color}
            highlight={look.highlight}
            angleDeg={pulsarJetAngle(system.id)}
          />
        )}
        <span
          className="absolute rounded-full"
          style={{
            left: "50%",
            top: "50%",
            width: look.galaxySize,
            height: look.galaxySize,
            transform: "translate(-50%, -50%)",
            background: starBodyGradient(starClass),
            boxShadow: starGlowShadow(starClass, selected),
            outline: selected ? `2px solid ${look.corona}` : undefined,
          }}
        />
      </span>
      {showLabel && (
        <span
          className="text-[11px] font-medium whitespace-nowrap px-1.5 py-0.5 text-star max-w-[170px] truncate"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "0.04em",
            background: "rgba(6, 12, 20, 0.75)",
            border: contested
              ? `1px solid ${contestedFactions?.[0]?.color ?? look.corona}`
              : "1px solid rgba(79, 210, 255, 0.2)",
          }}
        >
          {system.name}
          <span className="text-muted">
            {" "}
            · {megaShort ?? look.shortLabel}
          </span>
          {ownerBit}
        </span>
      )}
    </button>
  );
}
