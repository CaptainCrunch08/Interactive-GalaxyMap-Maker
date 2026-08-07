import { useMemo, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import {
  computeStrategicOverview,
  type FactionPowerRow,
  type PowerAxisId,
} from "../../lib/strategicOverview";
import { factionSymbolIds } from "../../lib/factionSymbols";
import type { Campaign } from "../../types/campaign";

const METRIC_AXES: { id: PowerAxisId; label: string }[] = [
  { id: "military", label: "Military" },
  { id: "territory", label: "Territory" },
  { id: "supply", label: "Supply" },
  { id: "growth", label: "Growth" },
];

function FactionShield({
  color,
  symbolUrl,
}: {
  color: string;
  symbolUrl?: string;
}) {
  return (
    <span
      className="relative flex h-10 w-10 shrink-0 items-center justify-center"
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
          className="relative z-[1] h-5 w-5 object-contain"
        />
      ) : (
        <span
          className="relative z-[1] h-2 w-2 rounded-full"
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
  symbolUrl,
}: {
  row: FactionPowerRow;
  leader: string;
  symbolUrl?: string;
}) {
  return (
    <article
      className="hud-panel p-4 md:p-5 border border-panel-border bg-panel/40"
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
    </article>
  );
}

function matchesQuery(name: string, leader: string, q: string): boolean {
  if (!q) return true;
  return `${name} ${leader}`.toLowerCase().includes(q);
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

export function FactionsOverviewPanel() {
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
        const symbolUrl = primarySymbolUrl(campaign, row.factionId);
        return { row, leader, symbolUrl };
      })
      .filter((x) => matchesQuery(x.row.name, x.leader, q));
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
          {rows.map(({ row, leader, symbolUrl }) => (
            <FactionCard
              key={row.factionId}
              row={row}
              leader={leader}
              symbolUrl={symbolUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
