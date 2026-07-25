import type { Faction, StarSystem } from "../../types/campaign";
import { STAR_CLASS_LABELS } from "../../types/campaign";
import {
  normalizeStarClass,
  starAppearance,
  starBodyGradient,
  starGlowShadow,
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
  editMode: boolean;
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
  mapScale,
  onDrag,
}: StarNodeProps) {
  const starClass = normalizeStarClass(system.starClass);
  const look = starAppearance(starClass);
  const isPulsar = starClass === "pulsar";
  /** Labels only when zoomed in enough (map starts ~0.45). */
  const showLabel = mapScale >= 0.55 || selected;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = system.x;
    const origY = system.y;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / mapScale;
      const dy = (ev.clientY - startY) / mapScale;
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
      onSelect();
    } else {
      onNavigate();
    }
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
      title={`${system.name} · ${STAR_CLASS_LABELS[starClass]}`}
    >
      <span
        className="relative block transition-transform group-hover:scale-110"
        style={{
          width: look.galaxySize,
          height: look.galaxySize,
        }}
      >
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
          className="absolute inset-0 rounded-full"
          style={{
            background: starBodyGradient(starClass),
            boxShadow: starGlowShadow(starClass, selected),
            outline: selected ? `2px solid ${look.corona}` : undefined,
          }}
        />
      </span>
      {showLabel && (
        <span
          className="text-[11px] font-medium whitespace-nowrap px-1.5 py-0.5 text-star max-w-[150px] truncate"
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
          <span className="text-muted"> · {look.shortLabel}</span>
          {ownerBit}
        </span>
      )}
    </button>
  );
}
