import { useMemo, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import {
  BATTLE_THEATER_LABELS,
  type BattleCharacterFate,
  type BattleCharacterOutcome,
  type BattleTheater,
  type Campaign,
  type CampaignBattleLogEntry,
  type VictoryKind,
} from "../../types/campaign";
import {
  isImportantBattle,
  VICTORY_KIND_LABELS,
  VICTORY_KIND_OPTIONS,
} from "../../lib/battleResolve";
import {
  compareBattleLogNewestFirst,
  ensureCampaignBattleLog,
} from "../../lib/battleLog";
import { sortedByName } from "../../lib/sortOptions";
import { factionsSortedByName, getFactionById } from "../../lib/territory";
import { useDebouncedDraft } from "../../lib/useDebouncedDraft";
import { AutoGrowTextarea } from "../AutoGrowTextarea";

const FATE_OPTIONS: { value: BattleCharacterFate; label: string }[] = [
  { value: "survived", label: "Survived" },
  { value: "deceased", label: "Died" },
  { value: "lost", label: "Lost" },
];

function outcomesFromEntry(
  entry: CampaignBattleLogEntry,
): BattleCharacterOutcome[] {
  if (entry.characterOutcomes && entry.characterOutcomes.length > 0) {
    return entry.characterOutcomes.map((o) => ({ ...o }));
  }
  return (entry.killedCharacterIds ?? []).map((characterId) => ({
    characterId,
    fate: "deceased" as const,
  }));
}

type BattleEditDraft = {
  name: string;
  date: string;
  planetId: string;
  systemId: string;
  locationLabel: string;
  outcome: string;
  summary: string;
  victoryKind: VictoryKind | "";
  attackerFactionId: string;
  defenderFactionId: string;
  victorFactionId: string;
};

function battleDraftFromEntry(entry: CampaignBattleLogEntry): BattleEditDraft {
  return {
    name: entry.name ?? "",
    date: entry.date ?? "",
    planetId: entry.planetId ?? "",
    systemId: entry.systemId ?? "",
    locationLabel: entry.locationLabel ?? "",
    outcome: entry.outcome ?? "",
    summary: entry.summary ?? "",
    victoryKind: entry.victoryKind ?? "",
    attackerFactionId: entry.attackerFactionId ?? "",
    defenderFactionId: entry.defenderFactionId ?? "",
    victorFactionId: entry.victorFactionId ?? "",
  };
}

/** Primary label: custom name, else location. */
function battleTitle(entry: Pick<CampaignBattleLogEntry, "name" | "locationLabel">): string {
  const named = entry.name?.trim();
  if (named) return named;
  return entry.locationLabel?.trim() || "Untitled battle";
}

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

function formatOutcomeLine(
  campaign: { factions: { id: string; name: string; color: string }[] },
  args: {
    victoryKind: VictoryKind | "";
    victorFactionId: string;
    attackerVp?: number;
    defenderVp?: number;
  },
): string {
  const { victoryKind, victorFactionId, attackerVp, defenderVp } = args;
  if (!victoryKind) return "";
  const hasVp = attackerVp != null && defenderVp != null;
  if (victoryKind === "draw") {
    return hasVp
      ? `Draw — ${attackerVp}–${defenderVp} VP. Forces withdraw bloodied.`
      : "Draw — Forces withdraw bloodied.";
  }
  const victorLabel = factionName(campaign, victorFactionId);
  if (hasVp) {
    return `${VICTORY_KIND_LABELS[victoryKind]} for ${victorLabel} (${Math.max(attackerVp!, defenderVp!)}–${Math.min(attackerVp!, defenderVp!)} VP).`;
  }
  return `${VICTORY_KIND_LABELS[victoryKind]} for ${victorLabel}.`;
}

function locationLabelForPlanet(
  campaign: Pick<Campaign, "planets" | "systems">,
  planetId: string,
): { planetId: string; systemId: string; locationLabel: string } | null {
  const planet = campaign.planets.find((p) => p.id === planetId);
  if (!planet) return null;
  const systemName = campaign.systems.find((s) => s.id === planet.systemId)?.name;
  return {
    planetId: planet.id,
    systemId: planet.systemId,
    locationLabel: systemName ? `${planet.name} · ${systemName}` : planet.name,
  };
}

function locationLabelForSystem(
  campaign: Pick<Campaign, "systems">,
  systemId: string,
): { planetId: string; systemId: string; locationLabel: string } | null {
  const system = campaign.systems.find((s) => s.id === systemId);
  if (!system) return null;
  return {
    planetId: "",
    systemId: system.id,
    locationLabel: system.name,
  };
}

function matchesQuery(entry: CampaignBattleLogEntry, q: string): boolean {
  if (!q) return true;
  const hay = [
    entry.name ?? "",
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

function BattleDetailEditor({
  entry,
  campaign,
  onDelete,
  onCommit,
}: {
  entry: CampaignBattleLogEntry;
  campaign: Campaign;
  onDelete: () => void;
  onCommit: (patch: Partial<CampaignBattleLogEntry>) => void;
}) {
  const factions = useMemo(
    () => factionsSortedByName(campaign.factions),
    [campaign.factions],
  );
  const planets = useMemo(() => {
    const systemsById = new Map(campaign.systems.map((s) => [s.id, s] as const));
    return sortedByName(campaign.planets).map((p) => ({
      id: p.id,
      label: systemsById.get(p.systemId)?.name
        ? `${p.name} · ${systemsById.get(p.systemId)!.name}`
        : p.name,
    }));
  }, [campaign.planets, campaign.systems]);
  const systems = useMemo(
    () => sortedByName(campaign.systems),
    [campaign.systems],
  );

  const { draft, patchDraft, flush, onBlurFlush } = useDebouncedDraft(
    entry.id,
    battleDraftFromEntry(entry),
    (next) => {
      onCommit({
        name: next.name.trim() || undefined,
        date: next.date,
        planetId: next.planetId || undefined,
        systemId: next.systemId || undefined,
        locationLabel:
          next.locationLabel.trim() ||
          (entry.theater === "space" ? "Deep void" : "Unknown world"),
        outcome: next.outcome,
        summary: next.summary,
        victoryKind: next.victoryKind || undefined,
        attackerFactionId: next.attackerFactionId || undefined,
        defenderFactionId: next.defenderFactionId || undefined,
        victorFactionId:
          next.victoryKind === "draw"
            ? null
            : next.victorFactionId || null,
      });
    },
  );

  const applySelect = (partial: Partial<BattleEditDraft>) => {
    patchDraft(partial);
    // Selects should persist immediately (patchDraft only schedules).
    queueMicrotask(() => flush());
  };

  const setVictoryKind = (kind: VictoryKind | "") => {
    const victorFactionId =
      kind === "draw"
        ? ""
        : draft.victorFactionId ||
          draft.attackerFactionId ||
          draft.defenderFactionId ||
          "";
    const outcome = formatOutcomeLine(campaign, {
      victoryKind: kind,
      victorFactionId,
      attackerVp: entry.attackerVp,
      defenderVp: entry.defenderVp,
    });
    applySelect({
      victoryKind: kind,
      victorFactionId,
      ...(outcome ? { outcome } : {}),
    });
  };

  const setVictor = (victorFactionId: string) => {
    const outcome = formatOutcomeLine(campaign, {
      victoryKind: draft.victoryKind,
      victorFactionId,
      attackerVp: entry.attackerVp,
      defenderVp: entry.defenderVp,
    });
    applySelect({
      victorFactionId,
      ...(outcome ? { outcome } : {}),
    });
  };

  const setAttacker = (attackerFactionId: string) => {
    const victorFactionId =
      draft.victoryKind === "draw"
        ? ""
        : draft.victorFactionId === draft.attackerFactionId
          ? attackerFactionId
          : draft.victorFactionId;
    const outcome = formatOutcomeLine(campaign, {
      victoryKind: draft.victoryKind,
      victorFactionId,
      attackerVp: entry.attackerVp,
      defenderVp: entry.defenderVp,
    });
    applySelect({
      attackerFactionId,
      victorFactionId,
      ...(outcome ? { outcome } : {}),
    });
  };

  const setDefender = (defenderFactionId: string) => {
    const victorFactionId =
      draft.victoryKind === "draw"
        ? ""
        : draft.victorFactionId === draft.defenderFactionId
          ? defenderFactionId
          : draft.victorFactionId;
    const outcome = formatOutcomeLine(campaign, {
      victoryKind: draft.victoryKind,
      victorFactionId,
      attackerVp: entry.attackerVp,
      defenderVp: entry.defenderVp,
    });
    applySelect({
      defenderFactionId,
      victorFactionId,
      ...(outcome ? { outcome } : {}),
    });
  };

  const setLocationPlanet = (planetId: string) => {
    if (!planetId) {
      applySelect({
        planetId: "",
        systemId: "",
        locationLabel: "Unknown world",
      });
      return;
    }
    const loc = locationLabelForPlanet(campaign, planetId);
    if (!loc) return;
    applySelect(loc);
  };

  const setLocationSystem = (systemId: string) => {
    if (!systemId) {
      applySelect({
        planetId: "",
        systemId: "",
        locationLabel: "Deep void",
      });
      return;
    }
    const loc = locationLabelForSystem(campaign, systemId);
    if (!loc) return;
    applySelect(loc);
  };

  const title = battleTitle({
    name: draft.name,
    locationLabel: draft.locationLabel || entry.locationLabel,
  });
  const locationLine =
    draft.locationLabel.trim() || entry.locationLabel.trim() || "";

  const outcomes = outcomesFromEntry(entry);
  const linkedIds = new Set(outcomes.map((o) => o.characterId));
  const addableCharacters = sortedByName(campaign.characters ?? []).filter(
    (c) => !linkedIds.has(c.id),
  );

  const commitOutcomes = (next: BattleCharacterOutcome[]) => {
    onCommit({
      characterOutcomes: next.length > 0 ? next : undefined,
      killedCharacterIds: next
        .filter((o) => o.fate === "deceased")
        .map((o) => o.characterId),
    });
  };

  const setFate = (characterId: string, fate: BattleCharacterFate) => {
    const rest = outcomes.filter((o) => o.characterId !== characterId);
    commitOutcomes([...rest, { characterId, fate }]);
  };

  const addCharacter = (characterId: string) => {
    if (!characterId || linkedIds.has(characterId)) return;
    commitOutcomes([
      ...outcomes,
      { characterId, fate: "survived" },
    ]);
  };

  const removeCharacter = (characterId: string) => {
    commitOutcomes(outcomes.filter((o) => o.characterId !== characterId));
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] gap-5 items-start">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-brass">
              {BATTLE_THEATER_LABELS[entry.theater]} battle
            </p>
            <h4 className="font-display text-xl text-star mt-1">{title}</h4>
            {draft.name.trim() && locationLine ? (
              <p className="text-[11px] text-muted mt-0.5">{locationLine}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`hud-btn text-xs ${entry.favorite ? "hud-btn-active" : ""}`}
              title={
                entry.favorite
                  ? "Unfavorite — remove Important mark"
                  : "Favorite — treat as Important"
              }
              onClick={() => onCommit({ favorite: !entry.favorite })}
            >
              {entry.favorite ? "★ Favorited" : "☆ Favorite"}
            </button>
            <button
              type="button"
              className="text-xs text-crimson"
              onClick={onDelete}
            >
              Delete entry
            </button>
          </div>
        </div>

        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Name
          <input
            className="hud-input mt-1 w-full text-sm"
            value={draft.name}
            placeholder="e.g. Fall of Cadia"
            onChange={(e) => patchDraft({ name: e.target.value })}
            onBlur={onBlurFlush}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Date
            <input
              className="hud-input mt-1 w-full text-sm"
              value={draft.date}
              placeholder="e.g. 05.07.026.M41"
              onChange={(e) => patchDraft({ date: e.target.value })}
              onBlur={onBlurFlush}
            />
          </label>
          {entry.theater === "planetary" ? (
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Location
              <select
                className="hud-input mt-1 w-full text-sm"
                value={draft.planetId}
                onChange={(e) => setLocationPlanet(e.target.value)}
              >
                <option value="">— Unknown world —</option>
                {planets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Location
              <select
                className="hud-input mt-1 w-full text-sm"
                value={draft.systemId}
                onChange={(e) => setLocationSystem(e.target.value)}
              >
                <option value="">— Deep void —</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="rounded border border-panel-border/80 p-3 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Result
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Victory / result
              <select
                className="hud-input mt-1 w-full text-sm"
                value={draft.victoryKind}
                onChange={(e) =>
                  setVictoryKind(e.target.value as VictoryKind | "")
                }
              >
                <option value="">— Unset —</option>
                {VICTORY_KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {VICTORY_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Victor
              <select
                className="hud-input mt-1 w-full text-sm"
                value={
                  draft.victoryKind === "draw" ? "" : draft.victorFactionId
                }
                disabled={draft.victoryKind === "draw" || !draft.victoryKind}
                onChange={(e) => setVictor(e.target.value)}
              >
                <option value="">
                  {draft.victoryKind === "draw" ? "— Draw —" : "— Unset —"}
                </option>
                {factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Attacker
              <select
                className="hud-input mt-1 w-full text-sm"
                value={draft.attackerFactionId}
                onChange={(e) => setAttacker(e.target.value)}
              >
                <option value="">— Unset —</option>
                {factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Defender
              <select
                className="hud-input mt-1 w-full text-sm"
                value={draft.defenderFactionId}
                onChange={(e) => setDefender(e.target.value)}
              >
                <option value="">— Unset —</option>
                {factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {entry.attackerVp != null && entry.defenderVp != null && (
            <p className="text-[11px] text-muted">
              Table score {entry.attackerVp}–{entry.defenderVp} VP
              {entry.attackerCasualties != null ||
              entry.defenderCasualties != null
                ? ` · KIA ${(entry.attackerCasualties ?? 0) + (entry.defenderCasualties ?? 0)}`
                : ""}
            </p>
          )}
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Outcome (edit)
            <input
              className="hud-input mt-1 w-full text-sm"
              value={draft.outcome}
              placeholder="Who won, and how?"
              onChange={(e) => patchDraft({ outcome: e.target.value })}
              onBlur={onBlurFlush}
            />
          </label>
        </div>

        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Battle summary
          <AutoGrowTextarea
            className="hud-input mt-1 w-full text-sm min-h-[7rem]"
            value={draft.summary}
            placeholder="Write what happened — commanders, turning points, aftermath…"
            onChange={(e) => patchDraft({ summary: e.target.value })}
            onBlur={onBlurFlush}
          />
        </label>
      </div>

      <aside className="rounded border border-panel-border/80 bg-void/30 p-3 space-y-3 xl:sticky xl:top-2">
        <div>
          <p className="font-display uppercase tracking-wider text-[10px] text-brass">
            Named characters
          </p>
          <p className="text-[10px] text-muted mt-0.5 leading-snug">
            Add who fought here and whether they died, survived, or were lost.
          </p>
        </div>

        {outcomes.length === 0 ? (
          <p className="text-[11px] text-muted">None linked yet.</p>
        ) : (
          <ul className="space-y-3">
            {outcomes.map((o) => {
              const c = (campaign.characters ?? []).find(
                (x) => x.id === o.characterId,
              );
              return (
                <li key={o.characterId} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-star truncate min-w-0">
                      {c?.name ?? "Unknown"}
                      {c?.title?.trim() ? (
                        <span className="text-muted">
                          {" "}
                          · {c.title.trim()}
                        </span>
                      ) : null}
                    </p>
                    <button
                      type="button"
                      className="text-[10px] text-muted hover:text-crimson shrink-0"
                      onClick={() => removeCharacter(o.characterId)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {FATE_OPTIONS.map((opt) => {
                      const active = o.fate === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`hud-btn text-[10px] px-2 py-0.5 ${
                            active ? "hud-btn-active" : ""
                          }`}
                          onClick={() => setFate(o.characterId, opt.value)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Add character
          <select
            className="hud-input mt-1 w-full text-sm"
            value=""
            disabled={addableCharacters.length === 0}
            onChange={(e) => {
              addCharacter(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">
              {addableCharacters.length === 0
                ? "— No characters left —"
                : "— Choose —"}
            </option>
            {addableCharacters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.status !== "alive" ? ` (${c.status})` : ""}
              </option>
            ))}
          </select>
        </label>
      </aside>
    </div>
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
              Defaults to Important battles (favorited, Heroic/Epochal, or any
              fight where a character dies or is lost). Results log
              automatically; add a summary for the chronicle.
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
                ? "No important battles yet — favorite a fight, win Heroic/Epochal, or lose a character."
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
                          {battleTitle(entry)}
                        </p>
                        {entry.name?.trim() && entry.locationLabel?.trim() ? (
                          <p className="text-[11px] text-muted truncate mt-0.5">
                            {entry.locationLabel.trim()}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-muted truncate mt-0.5">
                          {entry.outcome || "Outcome not recorded"}
                        </p>
                        {isImportantBattle(entry) && (
                          <p className="text-[10px] text-brass mt-1">
                            {[
                              entry.favorite ? "★ Favorited" : null,
                              entry.victoryKind === "epochal"
                                ? "Epochal"
                                : entry.victoryKind === "heroic"
                                  ? "Heroic"
                                  : null,
                              (entry.killedCharacterIds?.length ?? 0) > 0
                                ? `${entry.killedCharacterIds!.length} character fall${entry.killedCharacterIds!.length === 1 ? "" : "s"}`
                                : null,
                              (entry.characterOutcomes ?? []).some(
                                (o) => o.fate === "lost",
                              )
                                ? "Character lost"
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
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
            <BattleDetailEditor
              key={selected.id}
              entry={selected}
              campaign={campaign}
              onDelete={() => {
                deleteBattleLogEntry(selected.id);
                setSelectedId(null);
              }}
              onCommit={(patch) => updateBattleLogEntry(selected.id, patch)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
