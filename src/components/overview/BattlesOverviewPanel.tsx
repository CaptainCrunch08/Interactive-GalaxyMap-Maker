import { useMemo, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import {
  BATTLE_THEATER_LABELS,
  type BattleTheater,
  type CampaignBattleLogEntry,
} from "../../types/campaign";
import {
  isImportantBattle,
  VICTORY_KIND_LABELS,
} from "../../lib/battleResolve";
import {
  compareBattleLogNewestFirst,
  ensureCampaignBattleLog,
} from "../../lib/battleLog";
import { getFactionById } from "../../lib/territory";
import { AutoGrowTextarea } from "../AutoGrowTextarea";

type BattleListFilter = "important" | "all" | BattleTheater;

function factionName(
  campaign: { factions: { id: string; name: string; color: string }[] },
  id?: string | null,
): string {
  if (!id) return "Unknown";
  return getFactionById(campaign, id)?.name ?? "Unknown";
}

function factionColor(
  campaign: { factions: { id: string; name: string; color: string }[] },
  id?: string | null,
): string {
  if (!id) return "#6a8296";
  return getFactionById(campaign, id)?.color ?? "#6a8296";
}

function matchesQuery(entry: CampaignBattleLogEntry, q: string): boolean {
  if (!q) return true;
  const hay = [
    entry.date,
    entry.summary,
    entry.outcome,
    entry.locationLabel,
    BATTLE_THEATER_LABELS[entry.theater],
    entry.victoryKind ? VICTORY_KIND_LABELS[entry.victoryKind] : "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function CrossedSwords({ color }: { color: string }) {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border"
      style={{ borderColor: `${color}88`, background: `${color}14` }}
      aria-hidden
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M4 16 L9 5 M11 5 L16 16 M6.5 10.5 H13.5"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M3 4 L7 8 M17 4 L13 8"
          stroke={color}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function BattlesOverviewPanel() {
  const campaign = useCampaignStore((s) => s.campaign);
  const addBattleLogEntry = useCampaignStore((s) => s.addBattleLogEntry);
  const updateBattleLogEntry = useCampaignStore((s) => s.updateBattleLogEntry);
  const deleteBattleLogEntry = useCampaignStore((s) => s.deleteBattleLogEntry);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BattleListFilter>("important");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = useMemo(() => {
    const list = ensureCampaignBattleLog(campaign);
    return [...list].sort(compareBattleLogNewestFirst);
  }, [campaign]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "important") {
        if (!isImportantBattle(e)) return false;
      } else if (filter !== "all" && e.theater !== filter) {
        return false;
      }
      return matchesQuery(e, q);
    });
  }, [entries, filter, query]);

  const selected =
    visible.find((e) => e.id === selectedId) ??
    entries.find((e) => e.id === selectedId) ??
    null;

  const addEntry = (theater: BattleTheater) => {
    const id = addBattleLogEntry(theater);
    setSelectedId(id);
    setFilter(theater);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-panel-border px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-star tracking-wide">
              Battles
            </h3>
            <p className="text-[11px] text-muted mt-0.5">
              Defaults to Important battles (Heroic/Epochal, or any fight where a
              character dies). Results log automatically; add a summary for the
              chronicle.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="hud-btn text-xs"
              onClick={() => addEntry("planetary")}
            >
              + Planetary
            </button>
            <button
              type="button"
              className="hud-btn text-xs"
              onClick={() => addEntry("space")}
            >
              + Space
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="hud-input flex-1 min-w-[12rem] text-sm"
            placeholder="Search battles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {(
            [
              ["important", "Important"],
              ["all", "All"],
              ["planetary", "Planetary"],
              ["space", "Space"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`hud-btn text-xs ${filter === id ? "hud-btn-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ul className="w-[min(100%,22rem)] shrink-0 overflow-y-auto border-r border-panel-border p-3 space-y-2">
          {visible.length === 0 ? (
            <li className="text-xs text-muted px-2 py-6 text-center">
              {filter === "important"
                ? "No important battles yet — Heroic/Epochal victories or fights where a character dies."
                : "No battles logged yet. Resolve a fight on a world, or add an entry."}
            </li>
          ) : (
            visible.map((entry) => {
              const accent = factionColor(
                campaign,
                entry.victorFactionId ?? entry.attackerFactionId,
              );
              const active = selected?.id === entry.id;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`w-full text-left rounded border p-3 transition-colors ${
                      active
                        ? "bg-panel border-brass/50"
                        : "border-panel-border/70 hover:bg-panel/60"
                    }`}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <CrossedSwords color={accent} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-brass">
                            {BATTLE_THEATER_LABELS[entry.theater]}
                          </span>
                          <span className="text-[10px] text-muted truncate">
                            {entry.date || "Undated"}
                          </span>
                        </div>
                        <p className="text-sm text-star truncate mt-0.5">
                          {entry.locationLabel || "Unknown location"}
                        </p>
                        <p className="text-[11px] text-muted truncate mt-0.5">
                          {entry.outcome || "Outcome not recorded"}
                        </p>
                        {isImportantBattle(entry) && (
                          <p className="text-[10px] text-brass mt-1">
                            {entry.victoryKind === "epochal"
                              ? "Epochal"
                              : entry.victoryKind === "heroic"
                                ? "Heroic"
                                : null}
                            {(entry.killedCharacterIds?.length ?? 0) > 0
                              ? `${entry.victoryKind === "heroic" || entry.victoryKind === "epochal" ? " · " : ""}${entry.killedCharacterIds!.length} character fall${entry.killedCharacterIds!.length === 1 ? "" : "s"}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex-1 min-w-0 overflow-y-auto p-5">
          {!selected ? (
            <p className="text-sm text-muted">
              Select a battle to review results and write a summary.
            </p>
          ) : (
            <div className="max-w-2xl space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-brass">
                    {BATTLE_THEATER_LABELS[selected.theater]} battle
                  </p>
                  <h4 className="font-display text-xl text-star mt-1">
                    {selected.locationLabel || "Unknown location"}
                  </h4>
                </div>
                <button
                  type="button"
                  className="text-xs text-crimson"
                  onClick={() => {
                    deleteBattleLogEntry(selected.id);
                    setSelectedId(null);
                  }}
                >
                  Delete entry
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Date
                  <input
                    className="hud-input mt-1 w-full text-sm"
                    value={selected.date}
                    placeholder="e.g. 999.M41"
                    onChange={(e) =>
                      updateBattleLogEntry(selected.id, {
                        date: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Location
                  <input
                    className="hud-input mt-1 w-full text-sm"
                    value={selected.locationLabel}
                    onChange={(e) =>
                      updateBattleLogEntry(selected.id, {
                        locationLabel: e.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="rounded border border-panel-border/80 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  Result
                </p>
                {selected.victoryKind && (
                  <p className="text-sm text-brass">
                    {VICTORY_KIND_LABELS[selected.victoryKind]}
                    {selected.attackerVp != null &&
                    selected.defenderVp != null
                      ? ` · ${selected.attackerVp}–${selected.defenderVp} VP`
                      : ""}
                  </p>
                )}
                <p className="text-sm text-star leading-snug">
                  {selected.outcome || "No outcome recorded."}
                </p>
                <p className="text-[11px] text-muted">
                  {factionName(campaign, selected.attackerFactionId)}
                  {" vs "}
                  {factionName(campaign, selected.defenderFactionId)}
                  {selected.attackerCasualties != null ||
                  selected.defenderCasualties != null
                    ? ` · KIA ${(selected.attackerCasualties ?? 0) + (selected.defenderCasualties ?? 0)}`
                    : ""}
                </p>
                {(selected.killedCharacterIds?.length ?? 0) > 0 && (
                  <p className="text-[11px] text-crimson leading-snug">
                    Fallen:{" "}
                    {selected.killedCharacterIds!
                      .map(
                        (id) =>
                          (campaign.characters ?? []).find((c) => c.id === id)
                            ?.name ?? "Unknown",
                      )
                      .join(", ")}
                  </p>
                )}
                <label className="block text-[10px] uppercase tracking-wider text-muted pt-1">
                  Outcome (edit)
                  <input
                    className="hud-input mt-1 w-full text-sm"
                    value={selected.outcome}
                    placeholder="Who won, and how?"
                    onChange={(e) =>
                      updateBattleLogEntry(selected.id, {
                        outcome: e.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <label className="block text-[10px] uppercase tracking-wider text-muted">
                Battle summary
                <AutoGrowTextarea
                  className="hud-input mt-1 w-full text-sm min-h-[7rem]"
                  value={selected.summary}
                  placeholder="Write what happened — commanders, turning points, aftermath…"
                  onChange={(e) =>
                    updateBattleLogEntry(selected.id, {
                      summary: e.target.value,
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
