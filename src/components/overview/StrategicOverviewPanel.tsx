import { useMemo } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import {
  aggregateFactionLoreCasualties,
  formatLoreCount,
  MODEL_CATEGORY_IDS,
  resolveModelCategory,
} from "../../lib/modelCasualties";
import {
  computeStrategicOverview,
  POWER_AXIS_SHORT,
  type PowerAxisId,
} from "../../lib/strategicOverview";
import { getFactionById } from "../../lib/territory";
import { FactionRadarChart } from "./FactionRadarChart";

type StatCardProps = {
  label: string;
  value: number;
  accent: string;
};

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div
      className="hud-panel flex flex-col items-center justify-center gap-1.5 px-3 py-4 min-h-[96px] border"
      style={{ borderColor: `${accent}55` }}
    >
      <span
        className="w-5 h-0.5 rounded-full"
        style={{ background: accent }}
        aria-hidden
      />
      <span
        className="font-display text-3xl tabular-nums leading-none"
        style={{ color: accent }}
      >
        {value}
      </span>
      <span className="text-[9px] font-display uppercase tracking-[0.16em] text-muted text-center">
        {label}
      </span>
    </div>
  );
}

function PowerBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-8 shrink-0 text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-sm bg-void/80 overflow-hidden border border-panel-border/60">
        <div
          className="h-full rounded-sm transition-[width] duration-500"
          style={{
            width: `${Math.max(2, value)}%`,
            background: color,
          }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted">
        {value}
        <span className="text-panel-border">/100</span>
      </span>
    </div>
  );
}

const LEFT_AXES: PowerAxisId[] = ["military", "supply", "morale"];
const RIGHT_AXES: PowerAxisId[] = ["territory", "growth", "momentum"];

export function StrategicOverviewPanel() {
  const campaign = useCampaignStore((s) => s.campaign);
  const overview = useMemo(
    () => computeStrategicOverview(campaign),
    [campaign],
  );

  const { stats, factions } = overview;
  const casualtyRows = useMemo(
    () => aggregateFactionLoreCasualties(campaign),
    [campaign],
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6">
      <div>
        <h3 className="font-display text-sm text-brass uppercase tracking-[0.16em]">
          Strategic Overview
        </h3>
        <p className="text-xs text-muted mt-1 max-w-2xl">
          Live read of galactic power from fleets, armies, ownership, industry,
          and battle records. Axis scores are comparative (leading faction ≈
          100 on each factor). KIA sums recorded lore deaths from battles.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Battles Logged"
          value={stats.battlesLogged}
          accent="#e8c547"
        />
        <StatCard
          label="Worlds Tracked"
          value={stats.worldsTracked}
          accent="#4fd2ff"
        />
        <StatCard
          label="Lore KIA"
          value={stats.kia}
          accent="#b48cff"
        />
      </div>

      {casualtyRows.length > 0 && (
        <section className="hud-panel p-4 md:p-5 border border-panel-border space-y-4">
          <div>
            <h4 className="font-display text-xs text-brass uppercase tracking-[0.18em]">
              Lore deaths by faction
            </h4>
            <p className="text-[10px] text-muted mt-1">
              Totals from battle records, broken down by model category (using
              each faction&apos;s names).
            </p>
          </div>
          <ul className="space-y-4">
            {casualtyRows
              .slice()
              .sort((a, b) => b.total - a.total)
              .map((row) => {
                const faction = getFactionById(campaign, row.factionId);
                const name = faction?.name ?? "Unknown";
                const color = faction?.color ?? "#6a8296";
                const parts = MODEL_CATEGORY_IDS.map((id) => {
                  const lore = row.byCategory[id];
                  if (lore <= 0) return null;
                  const label = resolveModelCategory(faction, id).label;
                  return { id, label, lore };
                }).filter(Boolean) as {
                  id: string;
                  label: string;
                  lore: number;
                }[];
                return (
                  <li key={row.factionId} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="font-display text-sm tracking-wide truncate"
                        style={{ color }}
                      >
                        {name}
                      </span>
                      <span className="text-xs tabular-nums text-brass shrink-0">
                        {formatLoreCount(row.total)}
                      </span>
                    </div>
                    {parts.length > 0 || row.uncategorized > 0 ? (
                      <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                        {parts.map((p) => (
                          <li
                            key={p.id}
                            className="flex justify-between gap-2 text-[11px] text-muted tabular-nums"
                          >
                            <span className="truncate text-star">{p.label}</span>
                            <span>{formatLoreCount(p.lore)}</span>
                          </li>
                        ))}
                        {row.uncategorized > 0 ? (
                          <li className="flex justify-between gap-2 text-[11px] text-muted tabular-nums">
                            <span className="truncate text-star">
                              Uncategorized
                            </span>
                            <span>{formatLoreCount(row.uncategorized)}</span>
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      {factions.length === 0 ? (
        <p className="text-sm text-muted">
          Add factions in Edit Galaxy to populate the power matrix.
        </p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <section className="hud-panel p-4 md:p-5 border border-brass/35 space-y-3 overflow-visible">
            <h4 className="font-display text-xs text-brass uppercase tracking-[0.18em]">
              Faction Power Matrix
            </h4>
            <FactionRadarChart factions={factions} />
            <p className="text-[10px] text-muted leading-relaxed">
              Military = ship tonnage + detachments + fortifications. Territory =
              systems, worlds, districts, claims. Supply = BP banks,
              manufactorums, agri/industry sites. Growth = agri/forge holdings,
              free district slots, transports. Morale = shrine/hive cohesion
              minus ruins & contested heat. Momentum = fleets/armies abroad and
              battle momentum.
            </p>
          </section>

          <section className="hud-panel p-4 md:p-5 border border-panel-border space-y-4 max-h-[min(70vh,720px)] overflow-y-auto">
            <h4 className="font-display text-xs text-cyan uppercase tracking-[0.18em]">
              Faction Power Levels
            </h4>
            <ul className="space-y-5">
              {factions.map((f) => (
                <li key={f.factionId} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="font-display text-sm tracking-wide truncate"
                      style={{ color: f.color }}
                    >
                      {f.name}
                    </span>
                    <span className="text-[10px] text-muted shrink-0 truncate max-w-[40%]">
                      {f.subtitle}
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="space-y-1.5">
                      {LEFT_AXES.map((axis) => (
                        <PowerBar
                          key={axis}
                          label={POWER_AXIS_SHORT[axis]}
                          value={f.scores[axis]}
                          color={f.color}
                        />
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      {RIGHT_AXES.map((axis) => (
                        <PowerBar
                          key={axis}
                          label={POWER_AXIS_SHORT[axis]}
                          value={f.scores[axis]}
                          color={f.color}
                        />
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
