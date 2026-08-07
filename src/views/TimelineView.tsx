import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEvent } from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";
import {
  campaignAtFrame,
  frameAtTime,
  timelineSpan,
} from "../lib/galaxyHistory";
import { GalaxyChronicleMap } from "../components/galaxy/GalaxyChronicleMap";
import { VerticalChronicleRail } from "../components/galaxy/VerticalChronicleRail";

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function parseTimeInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(0, Number(t));
  const m = t.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (!m) return null;
  const mins = Number(m[1]);
  const secs = Number(m[2]);
  if (secs >= 60) return null;
  return mins * 60 + secs;
}

export function TimelineView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const goBack = useCampaignStore((s) => s.goBack);
  const updateTimelineEvent = useCampaignStore((s) => s.updateTimelineEvent);
  const trackRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [panelEventId, setPanelEventId] = useState<string | null>(null);
  const [frameFlash, setFrameFlash] = useState(false);

  const timeline = campaign.timeline ?? { frames: [], events: [] };
  const frames = useMemo(
    () => [...(timeline.frames ?? [])].sort((a, b) => a.timeSec - b.timeSec),
    [timeline.frames],
  );
  const events = useMemo(
    () => [...(timeline.events ?? [])].sort((a, b) => a.timeSec - b.timeSec),
    [timeline.events],
  );

  const span = timelineSpan(frames, events);
  const activeFrame = frameAtTime(frames, currentTime);
  const viewCampaign = useMemo(
    () => campaignAtFrame(campaign, activeFrame),
    [campaign, activeFrame],
  );

  useEffect(() => {
    // Brief flash only — do not remount the map (that resets zoom/pan).
    setFrameFlash(true);
    const t = window.setTimeout(() => setFrameFlash(false), 180);
    return () => window.clearTimeout(t);
  }, [activeFrame?.id]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime((t) => {
        const next = t + dt;
        if (next >= span) {
          setPlaying(false);
          return span;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, span]);

  useEffect(() => {
    if (events.length === 0) {
      setActiveEventId(null);
      return;
    }
    let current: TimelineEvent | null = null;
    for (const e of events) {
      if (e.timeSec <= currentTime + 0.25) current = e;
      else break;
    }
    setActiveEventId(current?.id ?? null);
  }, [currentTime, events]);

  const seekTo = (t: number, play = true) => {
    setCurrentTime(Math.max(0, Math.min(span, t)));
    if (play) setPlaying(true);
  };

  const seekToEvent = (event: TimelineEvent) => {
    setActiveEventId(event.id);
    seekTo(event.timeSec, true);
  };

  const openEventPanel = (event: TimelineEvent) => {
    setPanelEventId(event.id);
    seekToEvent(event);
  };

  const seekRatio = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekTo(ratio * span, true);
  };

  const activeEvent = events.find((e) => e.id === activeEventId);

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden flex flex-col">
      <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-[1] shrink-0 flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted">
            Galactic chronicle
          </p>
          <h1 className="font-display text-lg text-star">{campaign.name}</h1>
        </div>
        <button type="button" className="hud-btn" onClick={goBack}>
          ← Galaxy map
        </button>
      </div>

      <div className="relative z-[1] flex-1 min-h-0 px-4 pb-2 flex items-center justify-center">
        <div className="relative w-full max-w-5xl h-full max-h-full">
          <div className="hud-panel absolute inset-0 flex flex-col p-2 overflow-hidden">
            {frames.length === 0 ? (
              <div className="relative flex-1 min-h-0 flex items-center justify-center text-center px-6 text-muted text-sm">
                <p>
                  No chronicle frames yet. Change ownership or move fleets to
                  auto-record, or press{" "}
                  <strong className="text-cyan">Capture moment</strong> in
                  Details.
                </p>
              </div>
            ) : (
              <>
                <div className="relative flex-1 min-h-0 rounded overflow-hidden">
                  <GalaxyChronicleMap campaign={viewCampaign} />
                  <div
                    className={`pointer-events-none absolute inset-0 bg-void/35 transition-opacity duration-150 ${
                      frameFlash ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden
                  />
                </div>
                {(activeFrame?.label || activeEvent) && !panelEventId && (
                  <div className="shrink-0 mt-2 px-2 py-1.5 border-t border-panel-border/60">
                    {activeEvent ? (
                      <>
                        <p className="text-[10px] font-display uppercase tracking-wider text-cyan">
                          {formatTime(activeEvent.timeSec)} ·{" "}
                          {activeEvent.title}
                        </p>
                        {activeEvent.summary && (
                          <p className="text-xs text-muted mt-0.5 leading-snug">
                            {activeEvent.summary}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[10px] font-display uppercase tracking-wider text-cyan">
                        {formatTime(activeFrame!.timeSec)}
                        {activeFrame!.label
                          ? ` · ${activeFrame!.label}`
                          : ""}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Outside hud-panel so clip-path cannot crop the event tab */}
          {(frames.length > 0 || events.length > 0) && (
            <VerticalChronicleRail
              events={events}
              span={span}
              currentTime={currentTime}
              selectedEventId={panelEventId}
              onSelectEvent={openEventPanel}
              onClosePanel={() => setPanelEventId(null)}
              onUpdateEvent={updateTimelineEvent}
              formatTime={formatTime}
            />
          )}
        </div>
      </div>

      <div className="relative z-[1] shrink-0 px-4 pb-4">
        <div className="hud-panel px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
            <div className="flex items-center gap-2">
              <span className="font-display uppercase tracking-wider text-cyan">
                Timeline
              </span>
              <button
                type="button"
                className="hud-btn text-[10px] py-0.5 px-2"
                onClick={() => setPlaying((p) => !p)}
                disabled={frames.length === 0}
              >
                {playing ? "Pause" : "Play"}
              </button>
            </div>
            <span>
              {formatTime(currentTime)} / {formatTime(span)}
              {playing ? " · playing" : ""}
              {frames.length > 0
                ? ` · ${frames.length} frame${frames.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>

          <div
            ref={trackRef}
            className="relative h-10 cursor-pointer select-none"
            onClick={(e) => seekRatio(e.clientX)}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={span}
            aria-valuenow={currentTime}
            aria-label="Chronicle timeline"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                seekTo(currentTime + 1, playing);
              } else if (e.key === "ArrowLeft") {
                seekTo(Math.max(0, currentTime - 1), playing);
              } else if (e.key === " ") {
                e.preventDefault();
                setPlaying((p) => !p);
              }
            }}
          >
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-panel-border/80" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-cyan/70"
              style={{
                width: `${Math.min(100, (currentTime / span) * 100)}%`,
              }}
            />
            {frames.map((frame) => {
              const left = (frame.timeSec / span) * 100;
              const active = frame.id === activeFrame?.id;
              return (
                <button
                  key={frame.id}
                  type="button"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-[5]"
                  style={{ left: `${left}%` }}
                  title={
                    frame.label
                      ? `${formatTime(frame.timeSec)} — ${frame.label}`
                      : formatTime(frame.timeSec)
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    seekTo(frame.timeSec, true);
                  }}
                >
                  <span
                    className={`block w-2 h-2 rounded-full border ${
                      active
                        ? "bg-star border-star scale-125"
                        : "bg-panel-border border-cyan/50"
                    }`}
                  />
                </button>
              );
            })}
            {events.map((event) => {
              const left = (event.timeSec / span) * 100;
              const active = event.id === activeEventId;
              const sig = event.significance ?? "normal";
              return (
                <button
                  key={event.id}
                  type="button"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 group"
                  style={{ left: `${left}%` }}
                  title={`${formatTime(event.timeSec)} — ${event.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEventPanel(event);
                  }}
                >
                  <span
                    className={`block rotate-45 border transition-transform group-hover:scale-125 ${
                      sig === "important"
                        ? "w-4 h-4"
                        : sig === "notable"
                          ? "w-3.5 h-3.5"
                          : "w-3 h-3"
                    } ${
                      active
                        ? "bg-brass border-star scale-125"
                        : sig === "important"
                          ? "bg-brass border-brass/80"
                          : "bg-cyan border-cyan/80"
                    }`}
                  />
                  <span className="absolute left-1/2 -translate-x-1/2 top-5 whitespace-nowrap text-[9px] text-muted opacity-0 group-hover:opacity-100 pointer-events-none">
                    {event.title}
                  </span>
                </button>
              );
            })}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-star/90 pointer-events-none"
              style={{
                left: `${Math.min(100, (currentTime / span) * 100)}%`,
              }}
            />
          </div>

          {frames.length === 0 && (
            <p className="text-[11px] text-muted">
              History records as you claim systems and move fleets. Event markers
              seek the timelapse to that moment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export { formatTime, parseTimeInput };
