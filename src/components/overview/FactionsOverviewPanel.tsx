import { useEffect, useMemo, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import {
  computeStrategicOverview,
  type FactionPowerRow,
  type PowerAxisId,
} from "../../lib/strategicOverview";
import { factionSymbolIds } from "../../lib/factionSymbols";
import { useDebouncedDraft } from "../../lib/useDebouncedDraft";
import type { Campaign, Faction } from "../../types/campaign";

type FactionLoreDraft = {
  epithet: string;
  leader: string;
  origin: string;
  purpose: string;
  standing: string;
};

function loreDraftFromFaction(faction: Faction): FactionLoreDraft {
  return {
    epithet: faction.epithet ?? "",
    leader: faction.leader ?? "",
    origin: faction.origin ?? "",
    purpose: faction.purpose ?? "",
    standing: faction.standing ?? "",
  };
}

const METRIC_AXES: { id: PowerAxisId; label: string }[] = [
  { id: "military", label: "Military" },
  { id: "territory", label: "Territory" },
  { id: "supply", label: "Supply" },
  { id: "growth", label: "Growth" },
];

type HomeworldEntry = {
  planetId: string;
  planetName: string;
  systemName: string;
};

function FactionShield({
  color,
  symbolUrl,
  size = "md",
}: {
  color: string;
  symbolUrl?: string;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const icon = size === "lg" ? "h-8 w-8" : "h-5 w-5";
  const dot = size === "lg" ? "h-3 w-3" : "h-2 w-2";
  return (
    <span
      className={`relative flex ${box} shrink-0 items-center justify-center`}
      aria-hidden
    >
      <svg viewBox="0 0 40 44" className="absolute inset-0 h-full w-full">
        <path
          d="M20 2 L36 10 V22 C36 32 28 40 20 42 C12 40 4 32 4 22 V10 Z"
          fill={`${color}22`}
          stroke={color}
          strokeWidth="2"
        />
      </svg>
      {symbolUrl ? (
        <img
          src={symbolUrl}
          alt=""
          className={`relative z-[1] ${icon} object-contain`}
        />
      ) : (
        <span
          className={`relative z-[1] ${dot} rounded-full`}
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}
    </span>
  );
}

function MetricBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-display uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        <span className="text-[10px] tabular-nums text-muted">
          {value}
          <span className="text-panel-border">/100</span>
        </span>
      </div>
      <div className="h-1.5 rounded-sm bg-void/80 overflow-hidden border border-panel-border/50">
        <div
          className="h-full rounded-sm transition-[width] duration-500"
          style={{
            width: `${Math.max(2, value)}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function FactionCard({
  row,
  leader,
  epithet,
  symbolUrl,
  onOpen,
}: {
  row: FactionPowerRow;
  leader: string;
  epithet?: string;
  symbolUrl?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hud-panel p-4 md:p-5 border border-panel-border bg-panel/40 text-left w-full transition-colors hover:bg-panel/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass/60"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: row.color,
      }}
    >
      <div className="flex items-start gap-3">
        <FactionShield color={row.color} symbolUrl={symbolUrl} />
        <div className="min-w-0 flex-1">
          <h4
            className="font-display text-lg tracking-wide truncate"
            style={{ color: row.color }}
          >
            {row.name}
          </h4>
          {epithet?.trim() ? (
            <p className="mt-0.5 text-[12px] text-star/80 truncate italic">
              {epithet.trim()}
            </p>
          ) : null}
          <p className="mt-0.5 text-[11px] font-display uppercase tracking-[0.12em] text-muted truncate">
            Leader: {leader}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3">
        {METRIC_AXES.map(({ id, label }) => (
          <MetricBar
            key={id}
            label={label}
            value={row.scores[id]}
            color={row.color}
          />
        ))}
      </div>
    </button>
  );
}

function matchesQuery(
  name: string,
  leader: string,
  epithet: string,
  q: string,
): boolean {
  if (!q) return true;
  return `${name} ${leader} ${epithet}`.toLowerCase().includes(q);
}

function primarySymbolUrl(
  campaign: Campaign,
  factionId: string,
): string | undefined {
  const faction = campaign.factions.find((f) => f.id === factionId);
  if (!faction) return undefined;
  const primaryId =
    faction.defaultSymbolId ?? factionSymbolIds(faction)[0];
  if (!primaryId) return undefined;
  return campaign.symbols?.find((s) => s.id === primaryId)?.imageDataUrl;
}

function homeworldsForFaction(
  campaign: Campaign,
  factionId: string,
): HomeworldEntry[] {
  const systemName = (systemId: string) =>
    campaign.systems.find((s) => s.id === systemId)?.name ?? "Unknown system";

  return campaign.planets
    .filter(
      (p) =>
        p.type === "homeworld" && p.controllingFactionId === factionId,
    )
    .map((p) => ({
      planetId: p.id,
      planetName: p.name,
      systemName: systemName(p.systemId),
    }))
    .sort((a, b) => a.planetName.localeCompare(b.planetName));
}

function FactionDossier({
  faction,
  symbolUrl,
  homeworlds,
  onBack,
}: {
  faction: Faction;
  symbolUrl?: string;
  homeworlds: HomeworldEntry[];
  onBack: () => void;
}) {
  const updateFaction = useCampaignStore((s) => s.updateFaction);
  const enterPlanet = useCampaignStore((s) => s.enterPlanet);
  const closeGalaxyOverview = useCampaignStore((s) => s.closeGalaxyOverview);

  const { draft, patchDraft, flush, onBlurFlush } = useDebouncedDraft(
    faction.id,
    loreDraftFromFaction(faction),
    (next) => {
      updateFaction(faction.id, {
        epithet: next.epithet.trim() || undefined,
        leader: next.leader.trim() || undefined,
        origin: next.origin.trim() || undefined,
        purpose: next.purpose.trim() || undefined,
        standing: next.standing.trim() || undefined,
      });
    },
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="hud-btn shrink-0"
          onClick={() => {
            flush();
            onBack();
          }}
        >
          ← Back
        </button>
        <p className="text-[11px] font-display uppercase tracking-[0.2em] text-muted truncate">
          ◆ Faction Dossier
        </p>
      </div>

      <header
        className="hud-panel p-5 md:p-6 border border-panel-border bg-panel/40"
        style={{
          borderLeftWidth: 3,
          borderLeftColor: faction.color,
        }}
      >
        <div className="flex items-start gap-4">
          <FactionShield
            color={faction.color}
            symbolUrl={symbolUrl}
            size="lg"
          />
          <div className="min-w-0 flex-1 space-y-3">
            <h3
              className="font-display text-2xl md:text-3xl tracking-[0.06em] uppercase truncate"
              style={{ color: faction.color }}
            >
              {faction.name}
            </h3>
            <label className="block">
              <span className="text-[10px] font-display uppercase tracking-[0.14em] text-muted">
                Epithet
              </span>
              <input
                type="text"
                className="hud-input mt-1 w-full"
                value={draft.epithet}
                placeholder="Short tagline…"
                onChange={(e) => patchDraft({ epithet: e.target.value })}
                onBlur={onBlurFlush}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-display uppercase tracking-[0.14em] text-muted">
                Leader
              </span>
              <input
                type="text"
                className="hud-input mt-1 w-full"
                value={draft.leader}
                placeholder="Named commander or sovereign…"
                onChange={(e) => patchDraft({ leader: e.target.value })}
                onBlur={onBlurFlush}
              />
            </label>
          </div>
        </div>
      </header>

      <section className="space-y-2">
        <h4 className="font-display text-sm text-brass uppercase tracking-[0.14em]">
          Homeworld
        </h4>
        {homeworlds.length === 0 ? (
          <p className="text-sm text-muted">No homeworld controlled.</p>
        ) : (
          <ul className="space-y-2">
            {homeworlds.map((hw) => (
              <li key={hw.planetId}>
                <button
                  type="button"
                  className="hud-panel w-full text-left px-4 py-3 border border-panel-border bg-panel/30 hover:bg-panel/50 transition-colors"
                  onClick={() => {
                    flush();
                    closeGalaxyOverview();
                    enterPlanet(hw.planetId);
                  }}
                >
                  <span className="font-display text-base tracking-wide text-star">
                    {hw.planetName}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-display uppercase tracking-[0.12em] text-muted">
                    {hw.systemName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="font-display text-sm text-brass uppercase tracking-[0.14em]">
          Lore
        </h4>
        <label className="block">
          <span className="text-[10px] font-display uppercase tracking-[0.14em] text-muted">
            Origin
          </span>
          <textarea
            className="hud-input mt-1 w-full min-h-[7rem] resize-y"
            value={draft.origin}
            placeholder="Where this faction came from…"
            onChange={(e) => patchDraft({ origin: e.target.value })}
            onBlur={onBlurFlush}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-display uppercase tracking-[0.14em] text-muted">
            Purpose
          </span>
          <textarea
            className="hud-input mt-1 w-full min-h-[7rem] resize-y"
            value={draft.purpose}
            placeholder="What drives them now…"
            onChange={(e) => patchDraft({ purpose: e.target.value })}
            onBlur={onBlurFlush}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-display uppercase tracking-[0.14em] text-muted">
            Standing
          </span>
          <textarea
            className="hud-input mt-1 w-full min-h-[10rem] resize-y"
            value={draft.standing}
            placeholder="Where they stand now — wars, crises, victories…"
            onChange={(e) => patchDraft({ standing: e.target.value })}
            onBlur={onBlurFlush}
          />
        </label>
      </section>
    </div>
  );
}

function FactionDossierHost({
  factionId,
  onBack,
}: {
  factionId: string;
  onBack: () => void;
}) {
  const faction = useCampaignStore((s) =>
    s.campaign.factions.find((f) => f.id === factionId),
  );
  const campaign = useCampaignStore((s) => s.campaign);

  useEffect(() => {
    if (!faction) onBack();
  }, [faction, onBack]);

  if (!faction) return null;

  return (
    <FactionDossier
      faction={faction}
      symbolUrl={primarySymbolUrl(campaign, faction.id)}
      homeworlds={homeworldsForFaction(campaign, faction.id)}
      onBack={onBack}
    />
  );
}

function FactionsList({
  onOpen,
}: {
  onOpen: (factionId: string) => void;
}) {
  const campaign = useCampaignStore((s) => s.campaign);
  const [query, setQuery] = useState("");

  const overview = useMemo(
    () => computeStrategicOverview(campaign),
    [campaign],
  );
  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    return overview.factions
      .map((row) => {
        const faction = campaign.factions.find((f) => f.id === row.factionId);
        const leader = faction?.leader?.trim() || "Unknown command";
        const epithet = faction?.epithet?.trim() || "";
        const symbolUrl = primarySymbolUrl(campaign, row.factionId);
        return { row, leader, epithet, symbolUrl };
      })
      .filter((x) => matchesQuery(x.row.name, x.leader, x.epithet, q));
  }, [overview.factions, campaign, q]);

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6">
      <div>
        <h3 className="font-display text-2xl md:text-3xl text-brass tracking-[0.08em] uppercase">
          Factions
        </h3>
        <p className="mt-1 text-[11px] font-display uppercase tracking-[0.2em] text-muted">
          ◆ Faction Database // {rows.length} Entit
          {rows.length === 1 ? "y" : "ies"}
          {q && rows.length !== overview.factions.length
            ? ` of ${overview.factions.length}`
            : ""}
        </p>
      </div>

      <label className="relative block">
        <span className="sr-only">Search factions</span>
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
          placeholder="Search factions, leaders…"
          className="hud-input w-full pl-9"
        />
      </label>

      {overview.factions.length === 0 ? (
        <p className="text-sm text-muted">
          Add factions in Edit Galaxy to populate this database.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No factions match that search.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map(({ row, leader, epithet, symbolUrl }) => (
            <FactionCard
              key={row.factionId}
              row={row}
              leader={leader}
              epithet={epithet}
              symbolUrl={symbolUrl}
              onOpen={() => onOpen(row.factionId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FactionsOverviewPanel() {
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(
    null,
  );

  if (selectedFactionId) {
    return (
      <FactionDossierHost
        factionId={selectedFactionId}
        onBack={() => setSelectedFactionId(null)}
      />
    );
  }

  return <FactionsList onOpen={setSelectedFactionId} />;
}
