import { useMemo, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import {
  computePlanetsOverview,
  type PlanetOverviewCard,
} from "../../lib/planetsOverview";

function PlanetGlyph({ color }: { color: string }) {
  return (
    <span
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
      style={{
        borderColor: `${color}88`,
        background: `radial-gradient(circle at 35% 30%, ${color}55, #0a1018 70%)`,
      }}
      aria-hidden
    >
      <span
        className="absolute inset-[3px] rounded-full opacity-40"
        style={{
          background: `linear-gradient(135deg, transparent 40%, ${color}66 42%, transparent 55%)`,
        }}
      />
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </span>
  );
}

function matchesQuery(card: PlanetOverviewCard, q: string): boolean {
  if (!q) return true;
  const hay = [
    card.name,
    card.systemName,
    card.controlLabel,
    card.classification,
    card.description,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function PlanetCard({
  card,
  onOpen,
}: {
  card: PlanetOverviewCard;
  onOpen: () => void;
}) {
  const controlBg =
    card.controlKind === "faction"
      ? `${card.accent}28`
      : card.controlKind === "contested"
        ? "#2a3038"
        : "#1a222c";
  const controlFg =
    card.controlKind === "faction" ? card.accent : "#c0c8d0";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hud-panel text-left p-4 border transition-colors hover:bg-panel/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-brass/60"
      style={{ borderColor: `${card.accent}66` }}
    >
      <div className="flex items-start gap-3">
        <PlanetGlyph color={card.accent} />
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base text-star tracking-wide truncate">
            {card.name}
          </h4>
          <p className="text-[11px] text-muted truncate">{card.systemName}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className="inline-flex max-w-full truncate rounded-sm px-2 py-0.5 text-[10px] font-display uppercase tracking-wider"
          style={{ background: controlBg, color: controlFg }}
          title={card.controlLabel}
        >
          {card.controlLabel}
        </span>
      </div>

      <p className="mt-3 text-xs text-muted leading-relaxed line-clamp-3">
        {card.description}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-panel-border/50 pt-3">
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {card.classification}
        </span>
        <span className="font-display text-xs tabular-nums text-brass shrink-0">
          STR: {card.strength}
          <span className="text-muted">/100</span>
        </span>
      </div>
    </button>
  );
}

export function PlanetsOverviewPanel() {
  const campaign = useCampaignStore((s) => s.campaign);
  const enterPlanet = useCampaignStore((s) => s.enterPlanet);
  const closeGalaxyOverview = useCampaignStore((s) => s.closeGalaxyOverview);
  const [query, setQuery] = useState("");

  const cards = useMemo(() => computePlanetsOverview(campaign), [campaign]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => cards.filter((c) => matchesQuery(c, q)),
    [cards, q],
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6">
      <div>
        <h3 className="font-display text-2xl md:text-3xl text-brass tracking-[0.08em] uppercase">
          Planets
        </h3>
        <p className="mt-1 text-[11px] font-display uppercase tracking-[0.2em] text-muted">
          ◆ World Database // {filtered.length} Record
          {filtered.length === 1 ? "" : "s"}
          {q && filtered.length !== cards.length
            ? ` of ${cards.length}`
            : ""}
        </p>
      </div>

      <label className="relative block">
        <span className="sr-only">Search planets</span>
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm"
          aria-hidden
        >
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search planets, systems, factions…"
          className="hud-input w-full pl-9"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">
          {cards.length === 0
            ? "No worlds tracked yet. Add planets in Edit Galaxy → Galaxy Contents."
            : "No worlds match that search."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((card) => (
            <PlanetCard
              key={card.planetId}
              card={card}
              onOpen={() => {
                closeGalaxyOverview();
                enterPlanet(card.planetId);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
