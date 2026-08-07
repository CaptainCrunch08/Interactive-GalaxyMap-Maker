import { useMemo, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import type {
  Campaign,
  CampaignCharacter,
  CharacterStatus,
} from "../../types/campaign";
import { factionsSortedByName, getFactionById } from "../../lib/territory";
import {
  characterLocationDisplay,
  characterPlacementLabel,
  fleetsForLocationDraft,
  placementFromDraft,
  resolvePlacementDraft,
} from "../../lib/characterLocation";

const STATUS_STYLE: Record<
  CharacterStatus,
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
  deceased: {
    border: "#a84848",
    icon: "#c45c5c",
    badgeBg: "#4a1818",
    badgeFg: "#f0a0a0",
    label: "Deceased",
  },
};

type StatusFilter = "all" | CharacterStatus;

type Draft = {
  name: string;
  title: string;
  factionId: string;
  affiliation: string;
  status: CharacterStatus;
  systemId: string;
  planetId: string;
  fleetId: string;
  armyId: string;
  /** Free-text detail when placement is unknown, or extra lore note. */
  locationNote: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  title: "",
  factionId: "",
  affiliation: "",
  status: "alive",
  systemId: "",
  planetId: "",
  fleetId: "",
  armyId: "",
  locationNote: "",
});

function draftFromCharacter(
  campaign: Campaign,
  c: CampaignCharacter,
): Draft {
  const place = resolvePlacementDraft(campaign, c.placement);
  const derived = characterPlacementLabel(campaign, c.placement);
  const note =
    derived && c.location.trim() === derived
      ? ""
      : c.placement && c.placement.kind !== "unknown"
        ? ""
        : c.location;
  return {
    name: c.name,
    title: c.title,
    factionId: c.factionId ?? "",
    affiliation: c.affiliation ?? "",
    status: c.status,
    ...place,
    locationNote: note,
  };
}

function affiliationLine(
  character: CampaignCharacter,
  factionName?: string,
): string {
  const aff = character.affiliation?.trim();
  if (aff && factionName) return `${aff} (${factionName})`;
  if (aff) return aff;
  if (factionName) return factionName;
  return "Unaffiliated";
}

function PersonIcon({ color }: { color: string }) {
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border"
      style={{ borderColor: `${color}88`, background: `${color}14` }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.6" />
        <path
          d="M5.5 19c1.2-3.2 3.4-4.8 6.5-4.8S17.3 15.8 18.5 19"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function CharacterCard({
  character,
  locationLabel,
  factionName,
  onEdit,
  onDelete,
}: {
  character: CampaignCharacter;
  locationLabel: string;
  factionName?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const style = STATUS_STYLE[character.status] ?? STATUS_STYLE.alive;
  const locationPrefix =
    character.status === "lost" ? "Last known" : "Location";
  return (
    <article
      className="hud-panel relative p-4 border text-left transition-colors hover:bg-panel/80"
      style={{ borderColor: `${style.border}88` }}
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

      <button
        type="button"
        className="w-full text-left pr-16"
        onClick={onEdit}
      >
        <div className="flex items-start gap-3">
          <PersonIcon color={style.icon} />
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-base text-star tracking-wide truncate">
              {character.name}
            </h4>
            <p className="text-[11px] text-muted truncate mt-0.5">
              {character.title.trim() || "No rank recorded"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted truncate max-w-[70%]">
            {affiliationLine(character, factionName)}
          </span>
          <span
            className="inline-flex rounded-sm px-2 py-0.5 text-[10px] font-display uppercase tracking-wider"
            style={{ background: style.badgeBg, color: style.badgeFg }}
          >
            {style.label}
          </span>
        </div>

        <p className="mt-3 text-[11px] text-muted truncate">
          ◆ {locationPrefix}: {locationLabel || "Unknown"}
        </p>
      </button>
    </article>
  );
}

function CharacterForm({
  title,
  draft,
  campaign,
  factions,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  title: string;
  draft: Draft;
  campaign: Campaign;
  factions: { id: string; name: string }[];
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const systems = useMemo(
    () =>
      [...campaign.systems].sort((a, b) => a.name.localeCompare(b.name)),
    [campaign.systems],
  );
  const planets = useMemo(() => {
    if (!draft.systemId) return [];
    return campaign.planets
      .filter((p) => p.systemId === draft.systemId)
      .sort((a, b) => a.orbitIndex - b.orbitIndex || a.name.localeCompare(b.name));
  }, [campaign.planets, draft.systemId]);

  const fleets = useMemo(
    () =>
      fleetsForLocationDraft(
        campaign,
        draft.systemId,
        draft.planetId,
        draft.factionId || undefined,
      ),
    [campaign, draft.systemId, draft.planetId, draft.factionId],
  );

  const detachments = useMemo(() => {
    if (!draft.planetId || !draft.factionId) return [];
    const planet = campaign.planets.find((p) => p.id === draft.planetId);
    return [...(planet?.armies ?? [])]
      .filter((a) => a.factionId === draft.factionId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [campaign.planets, draft.planetId, draft.factionId]);

  const placementPreview = characterPlacementLabel(
    campaign,
    placementFromDraft(draft),
  );

  const setSystem = (systemId: string) => {
    onChange({
      systemId,
      planetId: "",
      fleetId: "",
      armyId: "",
    });
  };

  const setPlanet = (planetId: string) => {
    onChange({
      planetId,
      fleetId: "",
      armyId: "",
    });
  };

  const setFleet = (fleetId: string) => {
    onChange({
      fleetId,
      armyId: fleetId ? "" : draft.armyId,
    });
  };

  const setArmy = (armyId: string) => {
    onChange({
      armyId,
      fleetId: armyId ? "" : draft.fleetId,
    });
  };

  return (
    <div className="hud-panel p-4 md:p-5 border border-brass/40 space-y-3">
      <h4 className="font-display text-xs text-brass uppercase tracking-[0.16em]">
        {title}
      </h4>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-[10px] uppercase tracking-wider text-muted sm:col-span-2">
          Name
          <input
            className="hud-input mt-1 w-full"
            value={draft.name}
            placeholder="Captain Sevrael Sanzeo"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <label className="block text-[10px] uppercase tracking-wider text-muted sm:col-span-2">
          Rank / role
          <input
            className="hud-input mt-1 w-full"
            value={draft.title}
            placeholder="Captain of the 4th Company"
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>
        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Affiliation
          <input
            className="hud-input mt-1 w-full"
            value={draft.affiliation}
            placeholder="Blood Angels, regiment,…"
            onChange={(e) => onChange({ affiliation: e.target.value })}
          />
        </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Faction
            <select
              className="hud-input mt-1 w-full"
              value={draft.factionId}
              onChange={(e) =>
                onChange({
                  factionId: e.target.value,
                  fleetId: "",
                  armyId: "",
                })
              }
            >
              <option value="">— None —</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        <label className="block text-[10px] uppercase tracking-wider text-muted sm:col-span-2">
          Status
          <select
            className="hud-input mt-1 w-full"
            value={draft.status}
            onChange={(e) =>
              onChange({ status: e.target.value as CharacterStatus })
            }
          >
            <option value="alive">Alive</option>
            <option value="lost">Lost (unconfirmed)</option>
            <option value="deceased">Deceased</option>
          </select>
          {draft.status === "lost" && (
            <span className="mt-1 block normal-case tracking-normal text-[10px] text-muted">
              Not confirmed dead or alive — placement is treated as last known.
            </span>
          )}
        </label>
      </div>

      <div className="rounded border border-panel-border/80 bg-void/40 px-3 py-3 space-y-3">
        <p className="font-display text-[10px] uppercase tracking-[0.16em] text-brass">
          Location
        </p>
        <p className="text-[10px] text-muted">
          Select star system, then planet, then optionally a fleet or surface
          detachment.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            1. Star system
            <select
              className="hud-input mt-1 w-full"
              value={draft.systemId}
              onChange={(e) => setSystem(e.target.value)}
            >
              <option value="">— Unknown —</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            2. Planet
            <select
              className="hud-input mt-1 w-full"
              value={draft.planetId}
              disabled={!draft.systemId}
              onChange={(e) => setPlanet(e.target.value)}
            >
              <option value="">
                {draft.systemId ? "— At star / system only —" : "— Pick a system —"}
              </option>
              {planets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            3. Fleet (optional)
            <select
              className="hud-input mt-1 w-full"
              value={draft.fleetId}
              disabled={!draft.systemId || !draft.factionId}
              onChange={(e) => setFleet(e.target.value)}
            >
              <option value="">
                {!draft.factionId
                  ? "— Pick a faction —"
                  : !draft.systemId
                    ? "— Pick a system —"
                    : "— None —"}
              </option>
              {fleets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            4. Detachment (optional)
            <select
              className="hud-input mt-1 w-full"
              value={draft.armyId}
              disabled={!draft.planetId || !draft.factionId}
              onChange={(e) => setArmy(e.target.value)}
            >
              <option value="">
                {!draft.factionId
                  ? "— Pick a faction —"
                  : !draft.planetId
                    ? "— Pick a planet —"
                    : "— None —"}
              </option>
              {detachments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {!draft.systemId && (
            <label className="block text-[10px] uppercase tracking-wider text-muted sm:col-span-2">
              Location note
              <input
                className="hud-input mt-1 w-full"
                value={draft.locationNote}
                placeholder="Free-text last known place…"
                onChange={(e) => onChange({ locationNote: e.target.value })}
              />
            </label>
          )}
        </div>
        {(placementPreview || draft.locationNote.trim()) && (
          <p className="text-[11px] text-fog/90">
            {draft.status === "lost" ? "Last known: " : "Located: "}
            <span className="text-star">
              {placementPreview || draft.locationNote.trim() || "Unknown"}
            </span>
          </p>
        )}
      </div>

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

function payloadFromDraft(campaign: Campaign, draft: Draft) {
  const placement = placementFromDraft(draft);
  const derived = characterPlacementLabel(campaign, placement);
  const location =
    derived ||
    draft.locationNote.trim() ||
    "";
  return {
    name: draft.name.trim() || "New Character",
    title: draft.title.trim(),
    factionId: draft.factionId || undefined,
    affiliation: draft.affiliation.trim() || undefined,
    status: draft.status,
    placement,
    location,
  };
}

export function CharactersOverviewPanel() {
  const campaign = useCampaignStore((s) => s.campaign);
  const addCharacter = useCampaignStore((s) => s.addCharacter);
  const updateCharacter = useCampaignStore((s) => s.updateCharacter);
  const deleteCharacter = useCampaignStore((s) => s.deleteCharacter);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const characters = campaign.characters ?? [];
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return characters.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      const faction = getFactionById(campaign, c.factionId)?.name ?? "";
      const loc = characterLocationDisplay(campaign, c);
      const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.alive;
      const hay = [
        c.name,
        c.title,
        c.affiliation ?? "",
        loc,
        c.location,
        faction,
        style.label,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [characters, campaign, q, statusFilter]);

  const openCreate = () => {
    setMode("create");
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const openEdit = (c: CampaignCharacter) => {
    setMode("edit");
    setEditingId(c.id);
    setDraft(draftFromCharacter(campaign, c));
  };

  const cancelForm = () => {
    setMode("idle");
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const saveCreate = () => {
    addCharacter(payloadFromDraft(campaign, draft));
    cancelForm();
  };

  const saveEdit = () => {
    if (!editingId) return;
    const payload = payloadFromDraft(campaign, draft);
    updateCharacter(editingId, {
      ...payload,
      name: payload.name.trim() || "Unnamed",
    });
    cancelForm();
  };

  const handleDelete = (c: CampaignCharacter) => {
    if (
      !confirm(
        `Delete character “${c.name}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    if (editingId === c.id) cancelForm();
    deleteCharacter(c.id);
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl md:text-3xl text-brass tracking-[0.08em] uppercase">
            Characters
          </h3>
          <p className="mt-1 text-[11px] font-display uppercase tracking-[0.2em] text-muted">
            ◆ Character Encyclopedia // {filtered.length} Record
            {filtered.length === 1 ? "" : "s"}
            {filtered.length !== characters.length
              ? ` of ${characters.length}`
              : ""}
          </p>
        </div>
        <button type="button" className="hud-btn" onClick={openCreate}>
          + New Character
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <label className="relative block flex-1">
          <span className="sr-only">Search characters</span>
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
            placeholder="Search characters, factions, ranks…"
            className="hud-input w-full pl-9"
          />
        </label>
        <label className="block sm:w-44 shrink-0">
          <span className="sr-only">Filter by status</span>
          <select
            className="hud-input w-full"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="alive">Alive</option>
            <option value="lost">Lost</option>
            <option value="deceased">Deceased</option>
          </select>
        </label>
      </div>

      {mode === "create" && (
        <CharacterForm
          title="Create Character"
          draft={draft}
          campaign={campaign}
          factions={factionsSortedByName(campaign.factions)}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onSave={saveCreate}
          onCancel={cancelForm}
          saveLabel="Create"
        />
      )}
      {mode === "edit" && (
        <CharacterForm
          title="Edit Character"
          draft={draft}
          campaign={campaign}
          factions={factionsSortedByName(campaign.factions)}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onSave={saveEdit}
          onCancel={cancelForm}
          saveLabel="Save"
        />
      )}

      {characters.length === 0 && mode === "idle" ? (
        <p className="text-sm text-muted">
          No characters yet. Create one to begin the encyclopedia.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">No characters match that filter.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              locationLabel={characterLocationDisplay(campaign, c)}
              factionName={getFactionById(campaign, c.factionId)?.name}
              onEdit={() => openEdit(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
