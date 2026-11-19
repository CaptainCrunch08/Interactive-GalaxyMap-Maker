import { useEffect, useMemo, useRef, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import type {
  Campaign,
  CampaignBattleLogEntry,
  Fleet,
  FleetStatus,
} from "../../types/campaign";
import { BATTLE_THEATER_LABELS } from "../../types/campaign";
import {
  battlesForFleet,
  chassisSummary,
  embarkedDetachmentsOnFleet,
  fleetStatus,
  locationLabel,
} from "../../lib/fleets";
import { fleetPower, fleetPowerCap } from "../../lib/fleetPower";
import { charactersOnFleet } from "../../lib/characterLocation";
import { resolveFleetSymbolUrl } from "../../lib/fleetSymbols";
import { factionsSortedByName, getFactionById } from "../../lib/territory";
import { AutoGrowTextarea } from "../AutoGrowTextarea";

const STATUS_STYLE: Record<
  FleetStatus,
  { border: string; icon: string; badgeBg: string; badgeFg: string; label: string }
> = {
  alive: {
    border: "#3d9b6a",
    icon: "#4caf7a",
    badgeBg: "#1e4a32",
    badgeFg: "#9fe3b8",
    label: "Alive",
  },
  lost: {
    border: "#a88b3d",
    icon: "#c9a84a",
    badgeBg: "#3d3420",
    badgeFg: "#e8d090",
    label: "Lost",
  },
  dead: {
    border: "#a84848",
    icon: "#c45c5c",
    badgeBg: "#4a1818",
    badgeFg: "#f0a0a0",
    label: "Dead",
  },
};

type StatusFilter = "all" | FleetStatus;
type SortMode = "name_asc" | "name_desc" | "faction_asc";

type Draft = {
  name: string;
  factionId: string;
  status: FleetStatus;
  notes: string;
};

function draftFromFleet(fleet: Fleet): Draft {
  return {
    name: fleet.name,
    factionId: fleet.factionId,
    status: fleetStatus(fleet),
    notes: fleet.notes ?? "",
  };
}

function FleetGlyph({
  color,
  symbolUrl,
}: {
  color: string;
  symbolUrl?: string;
}) {
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border"
      style={{ borderColor: `${color}88`, background: `${color}14` }}
      aria-hidden
    >
      {symbolUrl ? (
        <img src={symbolUrl} alt="" className="h-7 w-7 object-contain" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
          <path
            d="M12 3 L19 9.5 L16.5 20 H7.5 L5 9.5 Z"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M12 7 V14 M9.5 11.5 H14.5"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

function battleTitle(battle: CampaignBattleLogEntry): string {
  if (battle.name?.trim()) return battle.name.trim();
  return battle.summary.trim() || "Untitled engagement";
}

function FleetCard({
  fleet,
  campaign,
  factionName,
  factionColor,
  symbolUrl,
  battles,
  onEdit,
  onDelete,
}: {
  fleet: Fleet;
  campaign: Campaign;
  factionName?: string;
  factionColor?: string;
  symbolUrl?: string;
  battles: CampaignBattleLogEntry[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = fleetStatus(fleet);
  const style = STATUS_STYLE[status];
  const locationPrefix = status === "lost" ? "Last known" : "Location";
  const outline = factionColor ?? style.border;
  const nameColor =
    status === "dead" ? "#e85a4f" : status === "lost" ? "#e8a045" : undefined;
  const boarded = embarkedDetachmentsOnFleet(fleet);
  const aboard = charactersOnFleet(campaign.characters, fleet.id);
  const power = fleetPower(fleet);
  const powerCap = fleetPowerCap(fleet);
  const chassis = chassisSummary(fleet);

  return (
    <article
      className="hud-panel relative p-4 border text-left transition-colors hover:bg-panel/80"
      style={{ borderColor: `${outline}99` }}
    >
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          type="button"
          className="text-[10px] uppercase tracking-wider text-muted hover:text-star px-1.5 py-0.5"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="text-[10px] uppercase tracking-wider text-crimson/80 hover:text-crimson px-1.5 py-0.5"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>

      <button type="button" className="w-full text-left pr-16" onClick={onEdit}>
        <div className="flex items-start gap-3">
          <FleetGlyph color={factionColor ?? style.icon} symbolUrl={symbolUrl} />
          <div className="min-w-0 flex-1">
            <h4
              className={`font-display text-base tracking-wide truncate ${
                nameColor ? "" : "text-star"
              }`}
              style={nameColor ? { color: nameColor } : undefined}
            >
              {fleet.name}
            </h4>
            <p className="text-[11px] text-muted truncate mt-0.5">
              {chassis || "No ships recorded"}
            </p>
            {status === "alive" ? (
              <p className="text-[11px] text-cyan/90 mt-0.5">
                {power}/{powerCap} FP
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted truncate max-w-[70%]">
            {factionName ?? "Unaffiliated"}
          </span>
          <span
            className="inline-flex rounded-sm px-2 py-0.5 text-[10px] font-display uppercase tracking-wider"
            style={{ background: style.badgeBg, color: style.badgeFg }}
          >
            {style.label}
          </span>
        </div>

        <p className="mt-3 text-[11px] text-muted truncate">
          ◆ {locationPrefix}: {locationLabel(campaign, fleet.location)}
        </p>

        {fleet.notes.trim() ? (
          <p className="mt-2 text-[11px] text-fog/85 leading-snug line-clamp-3 whitespace-pre-wrap">
            {fleet.notes.trim()}
          </p>
        ) : null}

        {boarded.length > 0 ? (
          <p className="mt-2 text-[10px] text-brass/90 truncate">
            Boarded: {boarded.map((a) => a.name).join(", ")}
          </p>
        ) : (
          <p className="mt-2 text-[10px] text-muted">No boarded detachments</p>
        )}

        {aboard.length > 0 ? (
          <p className="mt-1 text-[10px] text-brass/90 truncate">
            Characters: {aboard.map((c) => c.name).join(", ")}
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-muted">No characters aboard</p>
        )}

        {battles.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {battles.slice(0, 3).map((battle) => (
              <li
                key={battle.id}
                className="text-[10px] text-brass/90 truncate"
                title={battle.outcome}
              >
                ✦ {battleTitle(battle)}
              </li>
            ))}
            {battles.length > 3 ? (
              <li className="text-[10px] text-muted">
                +{battles.length - 3} more battle
                {battles.length - 3 === 1 ? "" : "s"}
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-2 text-[10px] text-muted">No battles recorded</p>
        )}
      </button>
    </article>
  );
}

function FleetForm({
  title,
  draft,
  campaign,
  onChange,
  onSave,
  onCancel,
  saveLabel,
  fleet,
}: {
  title: string;
  draft: Draft;
  campaign: Campaign;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  fleet: Fleet;
}) {
  const battles = useMemo(
    () => battlesForFleet(campaign.battleLog, fleet.id),
    [campaign.battleLog, fleet.id],
  );
  const boarded = embarkedDetachmentsOnFleet(fleet);
  const aboard = charactersOnFleet(campaign.characters, fleet.id);
  const factions = factionsSortedByName(campaign.factions);

  return (
    <div className="hud-panel border border-panel-border p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-display text-lg text-brass tracking-wide uppercase">
            {title}
          </h4>
          <p className="text-[11px] text-muted mt-0.5">
            {locationLabel(campaign, fleet.location)}
          </p>
        </div>
        <button type="button" className="hud-btn text-xs" onClick={onCancel}>
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Name
          <input
            className="hud-input mt-1 w-full"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Faction
          <select
            className="hud-input mt-1 w-full"
            value={draft.factionId}
            onChange={(e) => onChange({ factionId: e.target.value })}
          >
            {factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Status
          <select
            className="hud-input mt-1 w-full"
            value={draft.status}
            onChange={(e) =>
              onChange({ status: e.target.value as FleetStatus })
            }
          >
            <option value="alive">Alive</option>
            <option value="lost">Lost</option>
            <option value="dead">Dead</option>
          </select>
        </label>
        <div className="text-[11px] text-muted self-end pb-2">
          {chassisSummary(fleet) || "No ships"} · {fleetPower(fleet)}/
          {fleetPowerCap(fleet)} FP
        </div>
      </div>

      <label className="block text-[10px] uppercase tracking-wider text-muted">
        Lore
        <span className="normal-case tracking-normal text-muted/80 ml-2">
          (fleet notes)
        </span>
        <AutoGrowTextarea
          className="hud-input mt-1 w-full min-h-24"
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Orders, composition lore, history of the fleet…"
        />
      </label>

      <section className="space-y-2">
        <h5 className="font-display text-[10px] uppercase tracking-[0.16em] text-muted">
          Boarded detachments
        </h5>
        {boarded.length === 0 ? (
          <p className="text-[11px] text-muted">None embarked.</p>
        ) : (
          <ul className="space-y-1">
            {boarded.map((army) => (
              <li key={army.id} className="text-[12px] text-star/90">
                {army.name}
                <span className="text-muted">
                  {" "}
                  · {army.strengthPercent ?? 100}% strength
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h5 className="font-display text-[10px] uppercase tracking-[0.16em] text-muted">
          Characters aboard
        </h5>
        {aboard.length === 0 ? (
          <p className="text-[11px] text-muted">None assigned.</p>
        ) : (
          <ul className="space-y-1">
            {aboard.map((c) => (
              <li key={c.id} className="text-[12px] text-star/90">
                {c.name}
                {c.title.trim() ? (
                  <span className="text-muted"> · {c.title.trim()}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h5 className="font-display text-[10px] uppercase tracking-[0.16em] text-muted">
          Battles fought
        </h5>
        {battles.length === 0 ? (
          <p className="text-[11px] text-muted">No recorded engagements.</p>
        ) : (
          <ul className="space-y-2">
            {battles.map((battle) => (
              <li
                key={battle.id}
                className="rounded border border-panel-border/70 bg-panel/30 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] text-star font-medium">
                    {battleTitle(battle)}
                  </p>
                  <span className="text-[10px] uppercase tracking-wider text-muted">
                    {BATTLE_THEATER_LABELS[battle.theater] ?? battle.theater}
                    {battle.date ? ` · ${battle.date}` : ""}
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-1">
                  {battle.locationLabel}
                </p>
                <p className="text-[11px] text-fog/90 mt-1 leading-snug">
                  {battle.outcome}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="hud-btn" onClick={onSave}>
          {saveLabel}
        </button>
        <button type="button" className="hud-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function FleetsOverviewPanel() {
  const campaign = useCampaignStore((s) => s.campaign);
  const updateFleet = useCampaignStore((s) => s.updateFleet);
  const deleteFleet = useCampaignStore((s) => s.deleteFleet);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("faction_asc");
  const [mode, setMode] = useState<"idle" | "edit">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    name: "",
    factionId: "",
    status: "alive",
    notes: "",
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const fleets = campaign.fleets ?? [];
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (mode !== "edit") return;
    const panel = panelRef.current;
    const id = requestAnimationFrame(() => {
      panel?.scrollTo({ top: 0, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [mode, editingId]);

  const filtered = useMemo(() => {
    const list = fleets.filter((f) => {
      const status = fleetStatus(f);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const faction = getFactionById(campaign, f.factionId)?.name ?? "";
      const loc = locationLabel(campaign, f.location);
      const battles = battlesForFleet(campaign.battleLog, f.id);
      const boarded = embarkedDetachmentsOnFleet(f)
        .map((a) => a.name)
        .join(" ");
      const aboard = charactersOnFleet(campaign.characters, f.id)
        .map((c) => c.name)
        .join(" ");
      const hay = [
        f.name,
        f.notes,
        chassisSummary(f),
        loc,
        faction,
        STATUS_STYLE[status].label,
        boarded,
        aboard,
        ...battles.map((b) => `${b.name ?? ""} ${b.summary} ${b.outcome}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const byName = (a: Fleet, b: Fleet) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    const sorted = [...list];
    if (sortMode === "name_asc") {
      sorted.sort(byName);
    } else if (sortMode === "name_desc") {
      sorted.sort((a, b) => byName(b, a));
    } else {
      sorted.sort((a, b) => {
        const fa = getFactionById(campaign, a.factionId)?.name ?? "\uffff";
        const fb = getFactionById(campaign, b.factionId)?.name ?? "\uffff";
        const factionCmp = fa.localeCompare(fb, undefined, {
          sensitivity: "base",
        });
        if (factionCmp !== 0) return factionCmp;
        return byName(a, b);
      });
    }
    return sorted;
  }, [fleets, campaign, q, statusFilter, sortMode]);

  const editingFleet = editingId
    ? fleets.find((f) => f.id === editingId) ?? null
    : null;

  const openEdit = (fleet: Fleet) => {
    setMode("edit");
    setEditingId(fleet.id);
    setDraft(draftFromFleet(fleet));
  };

  const cancelForm = () => {
    setMode("idle");
    setEditingId(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateFleet(editingId, {
      name: draft.name.trim() || "Unnamed Fleet",
      factionId: draft.factionId,
      status: draft.status,
      notes: draft.notes,
    });
    cancelForm();
  };

  const handleDelete = (fleet: Fleet) => {
    if (
      !confirm(
        `Delete fleet “${fleet.name}” from the encyclopedia? This cannot be undone.`,
      )
    ) {
      return;
    }
    if (editingId === fleet.id) cancelForm();
    deleteFleet(fleet.id);
  };

  return (
    <div
      ref={panelRef}
      className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl md:text-3xl text-brass tracking-[0.08em] uppercase">
            Fleets
          </h3>
          <p className="mt-1 text-[11px] font-display uppercase tracking-[0.2em] text-muted">
            ◆ Fleet Encyclopedia // {filtered.length} Record
            {filtered.length === 1 ? "" : "s"}
            {filtered.length !== fleets.length ? ` of ${fleets.length}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <label className="relative block flex-1">
          <span className="sr-only">Search fleets</span>
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
            placeholder="Search fleets, battles, lore, detachments…"
            className="hud-input w-full pl-9"
          />
        </label>
        <div className="flex flex-col gap-2 sm:w-44 shrink-0">
          <label className="block">
            <span className="sr-only">Organize by</span>
            <select
              className="hud-input w-full"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              title="Organize fleets"
            >
              <option value="faction_asc">Faction A → Z</option>
              <option value="name_asc">Name A → Z</option>
              <option value="name_desc">Name Z → A</option>
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Filter by status</span>
            <select
              className="hud-input w-full"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Status</option>
              <option value="alive">Alive</option>
              <option value="lost">Lost</option>
              <option value="dead">Dead</option>
            </select>
          </label>
        </div>
      </div>

      {mode === "edit" && editingFleet ? (
        <FleetForm
          title="Fleet Sheet"
          draft={draft}
          campaign={campaign}
          fleet={editingFleet}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onSave={saveEdit}
          onCancel={cancelForm}
          saveLabel="Save"
        />
      ) : null}

      {fleets.length === 0 && mode === "idle" ? (
        <p className="text-sm text-muted">
          No fleets yet. Deploy one from a system, or recover past fleets from
          space battles.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">No fleets match that filter.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((fleet) => {
            const faction = getFactionById(campaign, fleet.factionId);
            return (
              <FleetCard
                key={fleet.id}
                fleet={fleet}
                campaign={campaign}
                factionName={faction?.name}
                factionColor={faction?.color}
                symbolUrl={resolveFleetSymbolUrl(
                  fleet,
                  faction,
                  campaign.symbols,
                )}
                battles={battlesForFleet(campaign.battleLog, fleet.id)}
                onEdit={() => openEdit(fleet)}
                onDelete={() => handleDelete(fleet)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
