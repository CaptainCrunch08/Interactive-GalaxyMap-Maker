import { useEffect, useMemo, useRef, useState } from "react";
import { useCampaignStore } from "../../store/useCampaignStore";
import type {
  Campaign,
  CampaignCharacter,
  CharacterFeat,
  CharacterStatus,
  Faction,
} from "../../types/campaign";
import { compareByLabel, sortedByName } from "../../lib/sortOptions";
import { factionsSortedByName, getFactionById } from "../../lib/territory";
import {
  characterLocationDisplay,
  characterPlacementLabel,
  placementFromDraft,
  resolvePlacementDraft,
} from "../../lib/characterLocation";
import { locationLabel } from "../../lib/fleets";
import { AutoGrowTextarea } from "../AutoGrowTextarea";

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
type SortMode = "name_asc" | "name_desc" | "faction_asc";

type DraftFeat = {
  id: string;
  title: string;
  detail: string;
};

type Draft = {
  name: string;
  nickname: string;
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
  /** Description and background lore. */
  background: string;
  feats: DraftFeat[];
};

const emptyDraft = (): Draft => ({
  name: "",
  nickname: "",
  title: "",
  factionId: "",
  affiliation: "",
  status: "alive",
  systemId: "",
  planetId: "",
  fleetId: "",
  armyId: "",
  locationNote: "",
  background: "",
  feats: [],
});

function draftFeatsFromCharacter(feats: CharacterFeat[] | undefined): DraftFeat[] {
  return (feats ?? []).map((f) => ({
    id: f.id,
    title: f.title,
    detail: f.detail ?? "",
  }));
}

function featsFromDraft(feats: DraftFeat[]): CharacterFeat[] | undefined {
  const cleaned = feats
    .map((f) => ({
      id: f.id,
      title: f.title.trim(),
      detail: f.detail.trim() || undefined,
    }))
    .filter((f) => f.title.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

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
    nickname: c.nickname ?? "",
    title: c.title,
    factionId: c.factionId ?? "",
    affiliation: c.affiliation ?? "",
    status: c.status,
    ...place,
    locationNote: note,
    background: c.background ?? c.notes ?? "",
    feats: draftFeatsFromCharacter(c.feats),
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
  factionColor,
  onEdit,
  onDelete,
}: {
  character: CampaignCharacter;
  locationLabel: string;
  factionName?: string;
  factionColor?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const style = STATUS_STYLE[character.status] ?? STATUS_STYLE.alive;
  const locationPrefix =
    character.status === "lost" ? "Last known" : "Location";
  const outline = factionColor ?? style.border;
  const nameColor =
    character.status === "deceased"
      ? "#e85a4f"
      : character.status === "lost"
        ? "#e8a045"
        : undefined;
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

      <button
        type="button"
        className="w-full text-left pr-16"
        onClick={onEdit}
      >
        <div className="flex items-start gap-3">
          <PersonIcon color={factionColor ?? style.icon} />
          <div className="min-w-0 flex-1">
            <h4
              className={`font-display text-base tracking-wide truncate ${
                nameColor ? "" : "text-star"
              }`}
              style={nameColor ? { color: nameColor } : undefined}
            >
              {character.name}
            </h4>
            {character.nickname?.trim() ? (
              <p className="text-[11px] text-brass/90 truncate mt-0.5 italic">
                “{character.nickname.trim()}”
              </p>
            ) : null}
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
        {(character.background ?? character.notes)?.trim() ? (
          <p className="mt-2 text-[11px] text-fog/85 leading-snug line-clamp-3 whitespace-pre-wrap">
            {(character.background ?? character.notes)!.trim()}
          </p>
        ) : null}
        {(character.feats?.length ?? 0) > 0 ? (
          <ul className="mt-2 space-y-1">
            {character.feats!.slice(0, 3).map((feat) => (
              <li
                key={feat.id}
                className="text-[10px] text-brass/90 truncate"
                title={feat.detail?.trim() || feat.title}
              >
                ✦ {feat.title.trim() || "Untitled feat"}
              </li>
            ))}
            {character.feats!.length > 3 ? (
              <li className="text-[10px] text-muted">
                +{character.feats!.length - 3} more
              </li>
            ) : null}
          </ul>
        ) : null}
      </button>
    </article>
  );
}

type SelectOption = { id: string; label: string };

function FilterableSelect({
  value,
  onChange,
  options,
  emptyLabel,
  searchPlaceholder = "Search…",
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SelectOption[];
  emptyLabel: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : [...options];
    list = [...list].sort((a, b) => compareByLabel(a.label, b.label));
    if (value && !list.some((o) => o.id === value)) {
      const selected = options.find((o) => o.id === value);
      if (selected) list = [selected, ...list.filter((o) => o.id !== value)];
    }
    return list;
  }, [options, filter, value]);

  return (
    <div className="mt-1 space-y-1.5">
      <input
        type="search"
        className="hud-input w-full"
        value={filter}
        disabled={disabled}
        placeholder={searchPlaceholder}
        onChange={(e) => setFilter(e.target.value)}
      />
      <select
        className="hud-input w-full"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {filtered.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function armyOptionId(planetId: string, armyId: string) {
  return `${planetId}::${armyId}`;
}

function parseArmyOptionId(value: string): {
  planetId: string;
  armyId: string;
} | null {
  const i = value.indexOf("::");
  if (i <= 0) return null;
  return { planetId: value.slice(0, i), armyId: value.slice(i + 2) };
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
  factions: Faction[];
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

  const systemNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of campaign.systems) map.set(s.id, s.name);
    return map;
  }, [campaign.systems]);

  const planetOptions = useMemo(() => {
    const list = [...campaign.planets].sort((a, b) => {
      const sa = systemNameById.get(a.systemId) ?? "";
      const sb = systemNameById.get(b.systemId) ?? "";
      const sysCmp = sa.localeCompare(sb, undefined, { sensitivity: "base" });
      if (sysCmp !== 0) return sysCmp;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return list.map((p) => ({
      id: p.id,
      label: `${p.name} · ${systemNameById.get(p.systemId) ?? "Unknown system"}`,
    }));
  }, [campaign.planets, systemNameById]);

  const fleetOptions = useMemo(() => {
    let fleets = [...(campaign.fleets ?? [])];
    if (draft.factionId) {
      fleets = fleets.filter((f) => f.factionId === draft.factionId);
    }
    fleets.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    return fleets.map((f) => ({
      id: f.id,
      label: `${f.name} · ${locationLabel(campaign, f.location)}`,
    }));
  }, [campaign, draft.factionId]);

  const detachmentOptions = useMemo(() => {
    const options: SelectOption[] = [];
    for (const planet of campaign.planets) {
      for (const army of planet.armies ?? []) {
        if (draft.factionId && army.factionId !== draft.factionId) continue;
        const system = systemNameById.get(planet.systemId) ?? "Unknown system";
        options.push({
          id: armyOptionId(planet.id, army.id),
          label: `${army.name} · ${planet.name} · ${system}`,
        });
      }
    }
    options.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
    return options;
  }, [campaign.planets, draft.factionId, systemNameById]);

  const detachmentValue =
    draft.planetId && draft.armyId
      ? armyOptionId(draft.planetId, draft.armyId)
      : "";

  const placementPreview = characterPlacementLabel(
    campaign,
    placementFromDraft(draft),
  );

  const setSystem = (systemId: string) => {
    const planetStillValid =
      draft.planetId &&
      campaign.planets.some(
        (p) => p.id === draft.planetId && p.systemId === systemId,
      );
    onChange({
      systemId,
      planetId: planetStillValid ? draft.planetId : "",
      fleetId: "",
      armyId: "",
    });
  };

  const setPlanet = (planetId: string) => {
    if (!planetId) {
      onChange({
        planetId: "",
        fleetId: "",
        armyId: "",
      });
      return;
    }
    const planet = campaign.planets.find((p) => p.id === planetId);
    onChange({
      planetId,
      systemId: planet?.systemId ?? draft.systemId,
      fleetId: "",
      armyId: "",
    });
  };

  const setFleet = (fleetId: string) => {
    if (!fleetId) {
      onChange({ fleetId: "" });
      return;
    }
    const fleet = (campaign.fleets ?? []).find((f) => f.id === fleetId);
    if (!fleet) {
      onChange({ fleetId, armyId: "" });
      return;
    }
    onChange({
      fleetId,
      armyId: "",
      factionId: fleet.factionId,
      systemId: fleet.location.systemId,
      planetId:
        fleet.location.kind === "orbit" ? fleet.location.planetId : "",
    });
  };

  const setArmy = (optionId: string) => {
    if (!optionId) {
      onChange({ armyId: "" });
      return;
    }
    const parsed = parseArmyOptionId(optionId);
    if (!parsed) {
      onChange({ armyId: optionId, fleetId: "" });
      return;
    }
    const planet = campaign.planets.find((p) => p.id === parsed.planetId);
    const army = planet?.armies?.find((a) => a.id === parsed.armyId);
    onChange({
      armyId: parsed.armyId,
      planetId: parsed.planetId,
      systemId: planet?.systemId ?? draft.systemId,
      fleetId: "",
      factionId: army?.factionId ?? draft.factionId,
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
          Nickname
          <input
            className="hud-input mt-1 w-full"
            value={draft.nickname}
            placeholder="Callsign, epithet, or familiar name…"
            onChange={(e) => onChange({ nickname: e.target.value })}
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
            {factionsSortedByName(factions).map((f) => (
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
            <option value="deceased">Deceased</option>
            <option value="lost">Lost (unconfirmed)</option>
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
          Pick any field — planet, fleet, or detachment will fill in the rest.
          Search to narrow long lists.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Star system
            <select
              className="hud-input mt-1 w-full"
              value={draft.systemId}
              onChange={(e) => setSystem(e.target.value)}
            >
              <option value="">— Unknown —</option>
              {sortedByName(systems).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Planet
            <FilterableSelect
              value={draft.planetId}
              onChange={setPlanet}
              options={planetOptions}
              emptyLabel="— At star / system only —"
              searchPlaceholder="Search planets…"
            />
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Fleet (optional)
            <FilterableSelect
              value={draft.fleetId}
              onChange={setFleet}
              options={fleetOptions}
              emptyLabel="— None —"
              searchPlaceholder={
                draft.factionId
                  ? "Search fleets…"
                  : "Search fleets (all factions)…"
              }
            />
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Detachment (optional)
            <FilterableSelect
              value={detachmentValue}
              onChange={setArmy}
              options={detachmentOptions}
              emptyLabel="— None —"
              searchPlaceholder={
                draft.factionId
                  ? "Search detachments…"
                  : "Search detachments (all factions)…"
              }
            />
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

      <label className="block text-[10px] uppercase tracking-wider text-muted">
        Description &amp; background
        <AutoGrowTextarea
          className="hud-input mt-1 w-full min-h-[7rem]"
          value={draft.background}
          placeholder="Appearance, history, and other lore…"
          onChange={(e) => onChange({ background: e.target.value })}
        />
      </label>

      <section className="space-y-2 border-t border-panel-border/70 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="font-display text-[11px] text-brass uppercase tracking-[0.14em]">
            Feats
          </h5>
          <button
            type="button"
            className="hud-btn text-xs"
            onClick={() =>
              onChange({
                feats: [
                  ...draft.feats,
                  { id: crypto.randomUUID(), title: "", detail: "" },
                ],
              })
            }
          >
            + Add feat
          </button>
        </div>
        <p className="text-[11px] text-muted">
          Named deeds and achievements for this character&apos;s sheet.
        </p>
        {draft.feats.length === 0 ? (
          <p className="text-[11px] text-muted/80">No feats recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {draft.feats.map((feat, index) => (
              <li
                key={feat.id}
                className="rounded border border-panel-border/70 bg-panel/30 p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <label className="block min-w-0 flex-1 text-[10px] uppercase tracking-wider text-muted">
                    Feat
                    <input
                      className="hud-input mt-1 w-full"
                      value={feat.title}
                      placeholder="e.g. Held the Cadia Gate"
                      onChange={(e) => {
                        const feats = draft.feats.map((f, i) =>
                          i === index ? { ...f, title: e.target.value } : f,
                        );
                        onChange({ feats });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="mt-5 shrink-0 text-[10px] uppercase tracking-wider text-crimson/80 hover:text-crimson"
                    onClick={() =>
                      onChange({
                        feats: draft.feats.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Detail (optional)
                  <textarea
                    className="hud-input mt-1 w-full min-h-[3.5rem] resize-y text-sm"
                    value={feat.detail}
                    placeholder="When, where, and how…"
                    onChange={(e) => {
                      const feats = draft.feats.map((f, i) =>
                        i === index ? { ...f, detail: e.target.value } : f,
                      );
                      onChange({ feats });
                    }}
                  />
                </label>
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

function payloadFromDraft(campaign: Campaign, draft: Draft) {
  const placement = placementFromDraft(draft);
  const derived = characterPlacementLabel(campaign, placement);
  const location =
    derived ||
    draft.locationNote.trim() ||
    "";
  return {
    name: draft.name.trim() || "New Character",
    nickname: draft.nickname.trim() || undefined,
    title: draft.title.trim(),
    factionId: draft.factionId || undefined,
    affiliation: draft.affiliation.trim() || undefined,
    status: draft.status,
    placement,
    location,
    background: draft.background.trim() || undefined,
    feats: featsFromDraft(draft.feats),
    notes: undefined,
  };
}

export function CharactersOverviewPanel() {
  const campaign = useCampaignStore((s) => s.campaign);
  const addCharacter = useCampaignStore((s) => s.addCharacter);
  const updateCharacter = useCampaignStore((s) => s.updateCharacter);
  const deleteCharacter = useCampaignStore((s) => s.deleteCharacter);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("faction_asc");
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const panelRef = useRef<HTMLDivElement>(null);

  const characters = campaign.characters ?? [];
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (mode !== "edit" && mode !== "create") return;
    const panel = panelRef.current;
    // Wait a frame so the form is mounted, then scroll the encyclopedia panel.
    const id = requestAnimationFrame(() => {
      panel?.scrollTo({ top: 0, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [mode, editingId]);

  const filtered = useMemo(() => {
    const list = characters.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      const faction = getFactionById(campaign, c.factionId)?.name ?? "";
      const loc = characterLocationDisplay(campaign, c);
      const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.alive;
      const hay = [
        c.name,
        c.nickname ?? "",
        c.title,
        c.affiliation ?? "",
        c.background ?? "",
        c.notes ?? "",
        ...(c.feats ?? []).flatMap((f) => [f.title, f.detail ?? ""]),
        loc,
        c.location,
        faction,
        style.label,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const byName = (a: CampaignCharacter, b: CampaignCharacter) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    const sorted = [...list];
    if (sortMode === "name_asc") {
      sorted.sort(byName);
    } else if (sortMode === "name_desc") {
      sorted.sort((a, b) => byName(b, a));
    } else {
      sorted.sort((a, b) => {
        const fa =
          getFactionById(campaign, a.factionId)?.name ??
          a.affiliation?.trim() ??
          "\uffff";
        const fb =
          getFactionById(campaign, b.factionId)?.name ??
          b.affiliation?.trim() ??
          "\uffff";
        const factionCmp = fa.localeCompare(fb, undefined, {
          sensitivity: "base",
        });
        if (factionCmp !== 0) return factionCmp;
        return byName(a, b);
      });
    }
    return sorted;
  }, [characters, campaign, q, statusFilter, sortMode]);

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
    <div
      ref={panelRef}
      className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6"
    >
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

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
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
        <div className="flex flex-col gap-2 sm:w-44 shrink-0">
          <label className="block">
            <span className="sr-only">Organize by</span>
            <select
              className="hud-input w-full"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              title="Organize characters"
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
              <option value="deceased">Deceased</option>
              <option value="lost">Lost</option>
            </select>
          </label>
        </div>
      </div>

      {(mode === "create" || mode === "edit") && (
        <CharacterForm
          title={mode === "create" ? "Create Character" : "Edit Character"}
          draft={draft}
          campaign={campaign}
          factions={factionsSortedByName(campaign.factions)}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onSave={mode === "create" ? saveCreate : saveEdit}
          onCancel={cancelForm}
          saveLabel={mode === "create" ? "Create" : "Save"}
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
          {filtered.map((c) => {
            const faction = getFactionById(campaign, c.factionId);
            return (
              <CharacterCard
                key={c.id}
                character={c}
                locationLabel={characterLocationDisplay(campaign, c)}
                factionName={faction?.name}
                factionColor={faction?.color}
                onEdit={() => openEdit(c)}
                onDelete={() => handleDelete(c)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
