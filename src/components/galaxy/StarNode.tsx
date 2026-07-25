import type { StarSystem } from "../../types/campaign";
import type { Faction } from "../../types/campaign";

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
  const glow = faction?.color ?? "#e8d5a3";
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

  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-transparent border-0 p-0 cursor-pointer group z-10"
      style={{ left: system.x, top: system.y }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <span
        className="relative block w-5 h-5 rounded-full transition-transform group-hover:scale-110"
        style={{
          background: `radial-gradient(circle at 35% 35%, #fff8e7, ${glow})`,
          boxShadow: `0 0 ${selected ? 24 : 14}px ${glow}88, 0 0 4px ${glow}`,
          outline: selected ? `2px solid ${glow}` : undefined,
        }}
      />
      {showLabel && (
        <span
          className="text-[11px] font-medium whitespace-nowrap px-1.5 py-0.5 text-star max-w-[140px] truncate"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "0.04em",
            background: "rgba(6, 12, 20, 0.75)",
            border: contested
              ? `1px solid ${contestedFactions?.[0]?.color ?? glow}`
              : "1px solid rgba(79, 210, 255, 0.2)",
          }}
        >
          {system.name}
          {contested
            ? " · Battlezone"
            : faction
              ? ` · ${faction.name}`
              : ""}
        </span>
      )}
    </button>
  );
}
