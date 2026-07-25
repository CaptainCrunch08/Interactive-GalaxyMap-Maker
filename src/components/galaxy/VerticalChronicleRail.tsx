import { useLayoutEffect, useRef, useState } from "react";
import type {
  TimelineEvent,
  TimelineEventSignificance,
} from "../../types/campaign";

const SIGNIFICANCE_ORDER: TimelineEventSignificance[] = [
  "normal",
  "notable",
  "important",
];

const TICK: Record<
  TimelineEventSignificance,
  { width: number; height: number; className: string }
> = {
  normal: {
    width: 14,
    height: 1.5,
    className: "bg-cyan/55",
  },
  notable: {
    width: 26,
    height: 2.5,
    className: "bg-cyan/90",
  },
  important: {
    width: 44,
    height: 4,
    className: "bg-brass shadow-[0_0_8px_rgba(201,162,39,0.45)]",
  },
};

function eventSignificance(
  event: TimelineEvent,
): TimelineEventSignificance {
  return event.significance ?? "normal";
}

interface VerticalChronicleRailProps {
  events: TimelineEvent[];
  span: number;
  currentTime: number;
  selectedEventId: string | null;
  onSelectEvent: (event: TimelineEvent) => void;
  onClosePanel: () => void;
  onUpdateEvent: (
    eventId: string,
    patch: Partial<TimelineEvent>,
  ) => void;
  formatTime: (sec: number) => string;
}

export function VerticalChronicleRail({
  events,
  span,
  currentTime,
  selectedEventId,
  onSelectEvent,
  onClosePanel,
  onUpdateEvent,
  formatTime,
}: VerticalChronicleRailProps) {
  const selected = events.find((e) => e.id === selectedEventId) ?? null;
  const safeSpan = Math.max(span, 1e-6);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelTopPx, setPanelTopPx] = useState(8);

  /** Top = past (0), bottom = most recent (span). */
  const yPercent = (timeSec: number) =>
    Math.min(100, Math.max(0, (timeSec / safeSpan) * 100));

  useLayoutEffect(() => {
    if (!selected || !rootRef.current || !panelRef.current) return;
    const rootH = rootRef.current.clientHeight;
    const panelH = panelRef.current.offsetHeight;
    const ideal =
      (yPercent(selected.timeSec) / 100) * rootH - panelH / 2;
    const pad = 8;
    setPanelTopPx(Math.max(pad, Math.min(ideal, rootH - panelH - pad)));
  }, [
    selected,
    selected?.id,
    selected?.timeSec,
    selected?.summary,
    selected?.title,
    selected?.significance,
    span,
  ]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-30 pointer-events-none overflow-visible"
    >
      {/* Vertical rail */}
      <div className="pointer-events-auto absolute inset-y-2 right-2 w-11">
        <div className="absolute right-[1.125rem] inset-y-0 w-px bg-gradient-to-b from-cyan/25 via-panel-border to-brass/40" />

        <div
          className="absolute right-[1.125rem] z-[2] pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${yPercent(currentTime)}%` }}
        >
          <div className="w-2.5 h-2.5 rotate-45 border border-star bg-star/90" />
        </div>

        {events.map((event) => {
          const level = eventSignificance(event);
          const tick = TICK[level];
          const isSelected = event.id === selectedEventId;
          return (
            <button
              key={event.id}
              type="button"
              className="absolute right-[1.125rem] flex items-center justify-end z-[3] group"
              style={{
                top: `${yPercent(event.timeSec)}%`,
                width: tick.width + 12,
                transform: "translate(0, -50%)",
              }}
              title={`${formatTime(event.timeSec)} — ${event.title}`}
              onClick={() => onSelectEvent(event)}
            >
              <span
                className={`block rounded-[1px] origin-right transition-transform group-hover:scale-x-110 ${
                  tick.className
                } ${isSelected ? "ring-1 ring-offset-1 ring-offset-transparent ring-star/80" : ""}`}
                style={{
                  width: tick.width,
                  height: tick.height,
                }}
              />
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          ref={panelRef}
          className="pointer-events-auto absolute right-14 w-56 max-h-[calc(100%-1rem)] overflow-y-auto hud-panel border border-panel-border p-3 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
          style={{ top: panelTopPx }}
        >
          <div
            className="absolute top-6 -right-2 w-2 h-px bg-panel-border"
            aria-hidden
          />

          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-display uppercase tracking-wider text-cyan">
                {formatTime(selected.timeSec)}
              </p>
              <input
                className="hud-input w-full text-sm mt-1"
                value={selected.title}
                onChange={(e) =>
                  onUpdateEvent(selected.id, { title: e.target.value })
                }
              />
            </div>
            <button
              type="button"
              className="text-muted hover:text-cyan text-lg leading-none px-0.5 shrink-0"
              onClick={onClosePanel}
              aria-label="Close event panel"
            >
              ×
            </button>
          </div>

          <label className="block text-[10px] uppercase tracking-wide text-muted mb-1">
            Notes
          </label>
          <textarea
            className="hud-input w-full min-h-[5.5rem] resize-y text-xs mb-3"
            value={selected.summary}
            placeholder="Event notes…"
            onChange={(e) =>
              onUpdateEvent(selected.id, { summary: e.target.value })
            }
          />

          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
            Significance
          </p>
          <div className="flex flex-wrap gap-1">
            {SIGNIFICANCE_ORDER.map((level) => {
              const active = eventSignificance(selected) === level;
              return (
                <button
                  key={level}
                  type="button"
                  className={`hud-btn text-[10px] py-0.5 px-2 capitalize ${
                    active ? "hud-btn-active" : ""
                  }`}
                  onClick={() =>
                    onUpdateEvent(selected.id, { significance: level })
                  }
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
