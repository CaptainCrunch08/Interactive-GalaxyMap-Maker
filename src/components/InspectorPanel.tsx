import { useRef, useState } from "react";
import type { PlanetType } from "../types/campaign";
import {
  DISTRICT_KIND_LABELS,
  PLANET_TYPE_LABELS,
  campaignMapSize,
} from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";
import {
  getFactionById,
  getSystemOwnership,
  ownershipLabel,
  systemOwnerSelectValue,
} from "../lib/territory";
import { countDistrictsByFaction } from "../lib/settlements";
import { TERRAIN_PAINT_ERASE } from "./strategic/HexPlanet";
import { FleetInspector, FleetListSection } from "./FleetInspector";
import { formatTime, parseTimeInput } from "../views/TimelineView";

const inputClass = "hud-input";

function FactionSwatch({ color }: { color?: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
      style={{ background: color ?? "#6a8296" }}
      aria-hidden
    />
  );
}

export function InspectorPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const symbolFileRef = useRef<HTMLInputElement>(null);
  const campaign = useCampaignStore((s) => s.campaign);
  const viewLevel = useCampaignStore((s) => s.viewLevel);
  const editMode = useCampaignStore((s) => s.editMode);
  const selectedSystemId = useCampaignStore((s) => s.selectedSystemId);
  const focusedSystemId = useCampaignStore((s) => s.focusedSystemId);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);

  const setCampaignName = useCampaignStore((s) => s.setCampaignName);
  const importCampaign = useCampaignStore((s) => s.importCampaign);
  const resetToDemo = useCampaignStore((s) => s.resetToDemo);
  const updateSystem = useCampaignStore((s) => s.updateSystem);
  const deleteSystem = useCampaignStore((s) => s.deleteSystem);
  const addPlanet = useCampaignStore((s) => s.addPlanet);
  const updatePlanet = useCampaignStore((s) => s.updatePlanet);
  const deletePlanet = useCampaignStore((s) => s.deletePlanet);
  const addFaction = useCampaignStore((s) => s.addFaction);
  const updateFaction = useCampaignStore((s) => s.updateFaction);
  const deleteFaction = useCampaignStore((s) => s.deleteFaction);
  const addSystem = useCampaignStore((s) => s.addSystem);
  const setSystemOwner = useCampaignStore((s) => s.setSystemOwner);
  const setPlanetOwner = useCampaignStore((s) => s.setPlanetOwner);
  const setCityOwner = useCampaignStore((s) => s.setCityOwner);
  const setDistrictOwner = useCampaignStore((s) => s.setDistrictOwner);
  const clearOpenTileClaims = useCampaignStore((s) => s.clearOpenTileClaims);
  const setTerrainPaintFaction = useCampaignStore(
    (s) => s.setTerrainPaintFaction,
  );
  const regenerateSettlements = useCampaignStore((s) => s.regenerateSettlements);
  const addSymbol = useCampaignStore((s) => s.addSymbol);
  const updateSymbol = useCampaignStore((s) => s.updateSymbol);
  const deleteSymbol = useCampaignStore((s) => s.deleteSymbol);
  const addArmy = useCampaignStore((s) => s.addArmy);
  const updateArmy = useCampaignStore((s) => s.updateArmy);
  const deleteArmy = useCampaignStore((s) => s.deleteArmy);
  const selectArmy = useCampaignStore((s) => s.selectArmy);
  const setPlacingArmy = useCampaignStore((s) => s.setPlacingArmy);
  const selectSystem = useCampaignStore((s) => s.selectSystem);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const enterPlanet = useCampaignStore((s) => s.enterPlanet);
  const goBack = useCampaignStore((s) => s.goBack);
  const toggleInspector = useCampaignStore((s) => s.toggleInspector);
  const addBattle = useCampaignStore((s) => s.addBattle);
  const updateBattle = useCampaignStore((s) => s.updateBattle);
  const deleteBattle = useCampaignStore((s) => s.deleteBattle);
  const selectedCityId = useCampaignStore((s) => s.selectedCityId);
  const selectedDistrictId = useCampaignStore((s) => s.selectedDistrictId);
  const selectedArmyId = useCampaignStore((s) => s.selectedArmyId);
  const placingArmyId = useCampaignStore((s) => s.placingArmyId);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const terrainPaintFactionId = useCampaignStore(
    (s) => s.terrainPaintFactionId,
  );
  const selectSettlement = useCampaignStore((s) => s.selectSettlement);
  const enterTimeline = useCampaignStore((s) => s.enterTimeline);
  const captureTimelineFrame = useCampaignStore((s) => s.captureTimelineFrame);
  const clearTimelineFrames = useCampaignStore((s) => s.clearTimelineFrames);
  const addTimelineEvent = useCampaignStore((s) => s.addTimelineEvent);
  const updateTimelineEvent = useCampaignStore((s) => s.updateTimelineEvent);
  const deleteTimelineEvent = useCampaignStore((s) => s.deleteTimelineEvent);
  const [captureLabel, setCaptureLabel] = useState("");
  const [pendingArmyDelete, setPendingArmyDelete] = useState<{
    planetId: string;
    armyId: string;
    name: string;
  } | null>(null);

  const selectedFleet = selectedFleetId
    ? (campaign.fleets ?? []).find((f) => f.id === selectedFleetId)
    : undefined;

  const systemId =
    viewLevel === "galaxy"
      ? selectedSystemId
      : focusedSystemId ?? selectedSystemId;

  const system = systemId
    ? campaign.systems.find((s) => s.id === systemId)
    : undefined;
  const planet =
    (viewLevel === "planet" || viewLevel === "strategic") && focusedPlanetId
      ? campaign.planets.find((p) => p.id === focusedPlanetId)
      : undefined;

  const systemPlanets = system
    ? campaign.planets
        .filter((p) => p.systemId === system.id)
        .sort((a, b) => a.orbitIndex - b.orbitIndex)
    : [];

  const systemOwnership = system
    ? getSystemOwnership(campaign, system.id)
    : null;

  /** Galaxy chrome: no system selected and still on the galaxy map. */
  const showGalaxyOverview =
    (viewLevel === "galaxy" || viewLevel === "timeline") && !system;
  const showPlanetDetails =
    (viewLevel === "planet" || viewLevel === "strategic") && !!planet;
  const showTimelineEditor = viewLevel === "timeline" || showGalaxyOverview;

  const handleImport = async (file: File) => {
    const { readCampaignFile } = await import("../lib/io");
    try {
      const data = await readCampaignFile(file);
      importCampaign(data);
    } catch {
      alert("Invalid campaign file. Check JSON format.");
    }
  };

  return (
    <aside className="w-80 shrink-0 border-l hud-side flex flex-col overflow-hidden">
      {selectedFleet ? (
        <FleetInspector
          fleet={selectedFleet}
          onClose={() => selectFleet(null)}
        />
      ) : showGalaxyOverview ? (
        <>
          <div className="p-4 border-b border-panel-border space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[10px] text-cyan uppercase tracking-[0.18em]">
                Details
              </h2>
              <button
                type="button"
                className="text-muted hover:text-cyan text-lg leading-none px-1"
                onClick={toggleInspector}
                title="Hide panel"
                aria-label="Hide details panel"
              >
                ×
              </button>
            </div>
            <label className="block text-xs text-muted">Galaxy map name</label>
            <input
              className={inputClass}
              value={campaign.name}
              onChange={(e) => setCampaignName(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  void import("../lib/io").then(({ downloadCampaign }) =>
                    downloadCampaign(campaign),
                  );
                }}
              >
                Export
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => fileRef.current?.click()}
              >
                Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImport(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  if (
                    confirm("Reset to demo campaign? Unsaved changes are lost.")
                  )
                    resetToDemo();
                }}
              >
                Demo data
              </button>
              <button
                type="button"
                className={`hud-btn ${viewLevel === "timeline" ? "hud-btn-active" : ""}`}
                onClick={() => enterTimeline()}
                title="Open galactic chronicle timeline"
              >
                Timeline
              </button>
            </div>
            <p className="text-xs text-muted">
              Mode: {editMode ? "Edit (drag stars)" : "Navigate (click to enter)"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {showTimelineEditor && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase text-muted tracking-wide">
                    Chronicle
                  </h3>
                  {viewLevel !== "timeline" && (
                    <button
                      type="button"
                      className="text-xs text-brass"
                      onClick={() => enterTimeline()}
                    >
                      Open →
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted mb-2 leading-snug">
                  Territory and fleet changes are recorded automatically. Capture
                  labeled beats anytime.
                </p>
                <p className="text-[11px] text-muted mb-2">
                  {(campaign.timeline?.frames ?? []).length} frame
                  {(campaign.timeline?.frames ?? []).length === 1 ? "" : "s"}{" "}
                  recorded
                </p>
                <input
                  className={inputClass + " mb-2"}
                  placeholder="Moment label (optional)"
                  value={captureLabel}
                  onChange={(e) => setCaptureLabel(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    className="hud-btn text-xs"
                    onClick={() => {
                      captureTimelineFrame(captureLabel || undefined);
                      setCaptureLabel("");
                    }}
                  >
                    Capture moment
                  </button>
                  {(campaign.timeline?.frames ?? []).length > 0 && (
                    <button
                      type="button"
                      className="hud-btn text-xs text-crimson"
                      onClick={() => {
                        if (
                          confirm(
                            "Clear all chronicle frames? Events are kept.",
                          )
                        ) {
                          clearTimelineFrames();
                        }
                      }}
                    >
                      Clear history
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] uppercase text-muted tracking-wide">
                    Events
                  </h4>
                  <button
                    type="button"
                    className="text-xs text-brass"
                    onClick={() => addTimelineEvent()}
                  >
                    + Add
                  </button>
                </div>
                {(campaign.timeline?.events ?? []).length === 0 ? (
                  <p className="text-xs text-muted">
                    No events yet. Markers seek the timelapse to that moment.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {[...(campaign.timeline?.events ?? [])]
                      .sort((a, b) => a.timeSec - b.timeSec)
                      .map((ev) => (
                        <li
                          key={ev.id}
                          className="rounded border border-panel-border/80 p-2 space-y-1.5"
                        >
                          <div className="flex gap-2 items-center">
                            <input
                              className={inputClass + " w-16 shrink-0"}
                              style={{ fontSize: "0.75rem" }}
                              title="Time (m:ss or seconds)"
                              defaultValue={formatTime(ev.timeSec)}
                              key={`${ev.id}-t-${ev.timeSec}`}
                              onBlur={(e) => {
                                const parsed = parseTimeInput(e.target.value);
                                if (parsed == null) {
                                  e.target.value = formatTime(ev.timeSec);
                                  return;
                                }
                                updateTimelineEvent(ev.id, {
                                  timeSec: parsed,
                                });
                              }}
                            />
                            <input
                              className={inputClass + " flex-1"}
                              style={{ fontSize: "0.75rem" }}
                              value={ev.title}
                              onChange={(e) =>
                                updateTimelineEvent(ev.id, {
                                  title: e.target.value,
                                })
                              }
                            />
                            <button
                              type="button"
                              className="text-xs text-crimson shrink-0"
                              onClick={() => deleteTimelineEvent(ev.id)}
                            >
                              ×
                            </button>
                          </div>
                          <textarea
                            className={
                              inputClass + " w-full min-h-[2.5rem] resize-y"
                            }
                            style={{ fontSize: "0.75rem" }}
                            placeholder="Summary…"
                            value={ev.summary ?? ""}
                            onChange={(e) =>
                              updateTimelineEvent(ev.id, {
                                summary: e.target.value,
                              })
                            }
                          />
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            )}

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Factions
                </h3>
                <button
                  type="button"
                  className="text-xs text-brass"
                  onClick={() => addFaction()}
                >
                  + Add
                </button>
              </div>
              {campaign.factions.length === 0 ? (
                <p className="text-xs text-muted">No factions defined.</p>
              ) : (
                <ul className="space-y-2">
                  {campaign.factions.map((f) => (
                    <li key={f.id} className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                          value={f.color}
                          onChange={(e) =>
                            updateFaction(f.id, { color: e.target.value })
                          }
                        />
                        <input
                          className={inputClass + " flex-1"}
                          value={f.name}
                          onChange={(e) =>
                            updateFaction(f.id, { name: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="text-xs text-crimson shrink-0"
                          onClick={() => deleteFaction(f.id)}
                        >
                          ×
                        </button>
                      </div>
                      {(campaign.symbols?.length ?? 0) > 0 && (
                        <select
                          className={inputClass}
                          style={{ fontSize: "0.75rem" }}
                          value={f.defaultSymbolId ?? ""}
                          onChange={(e) =>
                            updateFaction(f.id, {
                              defaultSymbolId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">Default army symbol…</option>
                          {(campaign.symbols ?? []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Army symbols
                </h3>
                <button
                  type="button"
                  className="text-xs text-brass"
                  onClick={() => symbolFileRef.current?.click()}
                >
                  + Import
                </button>
                <input
                  ref={symbolFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void import("../lib/io").then(async ({ readImageAsDataUrl }) => {
                      try {
                        const dataUrl = await readImageAsDataUrl(file);
                        const base = file.name.replace(/\.[^.]+$/, "") || "Symbol";
                        addSymbol(base, dataUrl);
                      } catch {
                        alert("Could not import that image.");
                      }
                    });
                    e.target.value = "";
                  }}
                />
              </div>
              {(campaign.symbols ?? []).length === 0 ? (
                <p className="text-xs text-muted">
                  Import PNG/SVG icons to mark armies on planets.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(campaign.symbols ?? []).map((sym) => (
                    <li
                      key={sym.id}
                      className="flex items-center gap-2 rounded border border-panel-border/80 p-1.5"
                    >
                      <img
                        src={sym.imageDataUrl}
                        alt=""
                        className="w-9 h-9 object-contain rounded bg-void/60 border border-panel-border"
                      />
                      <input
                        className={inputClass + " flex-1"}
                        style={{ fontSize: "0.75rem" }}
                        value={sym.name}
                        onChange={(e) =>
                          updateSymbol(sym.id, { name: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className="text-xs text-crimson shrink-0"
                        onClick={() => deleteSymbol(sym.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-xs uppercase text-muted tracking-wide mb-2">
                Ownership
              </h3>
              {campaign.systems.length === 0 ? (
                <p className="text-xs text-muted">No systems yet.</p>
              ) : (
                <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {campaign.systems.map((sys) => {
                    const own = getSystemOwnership(campaign, sys.id);
                    return (
                      <li key={sys.id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded border border-transparent hover:bg-panel-border/30 text-xs flex items-center gap-2 text-muted hover:text-text"
                          onClick={() => selectSystem(sys.id)}
                        >
                          <span className="flex gap-0.5 shrink-0">
                            {own.status === "unowned" && <FactionSwatch />}
                            {own.factions.map((f) => (
                              <FactionSwatch key={f.id} color={f.color} />
                            ))}
                          </span>
                          <span className="truncate flex-1">{sys.name}</span>
                          <span
                            className={`truncate max-w-[40%] text-right ${
                              own.status === "contested"
                                ? "text-brass"
                                : "text-muted"
                            }`}
                          >
                            {ownershipLabel(own)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <FleetListSection title="Fleets" />

            <section>
              <p className="text-xs text-muted mb-2">
                Select a star or add a new system.
              </p>
              <button
                type="button"
                className="text-sm px-3 py-2 rounded border border-brass-dim text-brass w-full"
                onClick={() =>
                  addSystem(
                    campaignMapSize(campaign) / 2 +
                      campaign.systems.length * 40,
                    campaignMapSize(campaign) / 2 +
                      campaign.systems.length * 30,
                  )
                }
              >
                + Add system
              </button>
            </section>
          </div>
        </>
      ) : showPlanetDetails && planet ? (
        <>
          <div className="p-4 border-b border-panel-border space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[10px] text-cyan uppercase tracking-[0.18em]">
                Planet
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[10px] text-muted hover:text-cyan"
                  onClick={goBack}
                >
                  {viewLevel === "strategic" ? "← Planet" : "← System"}
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-cyan text-lg leading-none px-1"
                  onClick={toggleInspector}
                  title="Hide panel"
                  aria-label="Hide details panel"
                >
                  ×
                </button>
              </div>
            </div>
            <p className="font-display text-sm text-star truncate">{planet.name}</p>
            {system && (
              <p className="text-[10px] text-muted truncate">{system.name}</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <section>
              <label className="block text-xs text-muted mb-1">Name</label>
              <input
                className={inputClass + " mb-2"}
                value={planet.name}
                onChange={(e) =>
                  updatePlanet(planet.id, { name: e.target.value })
                }
              />
              <label className="block text-xs text-muted mb-1">Type</label>
              <select
                className={inputClass + " mb-2"}
                value={planet.type}
                onChange={(e) =>
                  updatePlanet(planet.id, {
                    type: e.target.value as PlanetType,
                  })
                }
              >
                {(Object.keys(PLANET_TYPE_LABELS) as PlanetType[]).map((t) => (
                  <option key={t} value={t}>
                    {PLANET_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <label className="block text-xs text-muted mb-1">
                Controlling faction
              </label>
              <div className="flex items-center gap-2 mb-2">
                <FactionSwatch
                  color={
                    getFactionById(campaign, planet.controllingFactionId)?.color
                  }
                />
                <select
                  className={inputClass + " flex-1"}
                  value={planet.controllingFactionId ?? ""}
                  onChange={(e) =>
                    setPlanetOwner(planet.id, e.target.value || null)
                  }
                >
                  <option value="">Unclaimed</option>
                  {campaign.factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="block text-xs text-muted mb-1">Notes</label>
              <textarea
                className={inputClass + " min-h-24 resize-y mb-2"}
                value={planet.notes}
                onChange={(e) =>
                  updatePlanet(planet.id, { notes: e.target.value })
                }
                placeholder="Campaign narrative, objectives, special rules..."
              />
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Cities & districts
                </h3>
                <button
                  type="button"
                  className="text-[10px] text-brass"
                  onClick={() => {
                    if (
                      confirm(
                        "Regenerate cities onto separate hex tiles for this world class?",
                      )
                    )
                      regenerateSettlements(planet.id);
                  }}
                >
                  Regenerate
                </button>
              </div>
              <p className="text-[10px] text-muted mb-2 leading-snug">
                Each city and district owns one hex. Empire color outlines that
                tile.
              </p>
              {(() => {
                const cities = planet.cities ?? [];
                if (cities.length === 0) {
                  return (
                    <p className="text-xs text-muted">
                      No settlements yet. Open strategic view or regenerate.
                    </p>
                  );
                }
                const counts = countDistrictsByFaction(cities);
                return (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[...counts.entries()].map(([fid, n]) => {
                        const fac =
                          fid === "__none__"
                            ? null
                            : getFactionById(campaign, fid);
                        return (
                          <span
                            key={fid}
                            className="text-[10px] text-muted flex items-center gap-1"
                          >
                            <FactionSwatch color={fac?.color} />
                            {fac?.name ?? "Unclaimed"} · {n}
                          </span>
                        );
                      })}
                    </div>
                    <ul className="space-y-3">
                      {cities.map((city) => {
                        const cityActive = selectedCityId === city.id;
                        return (
                          <li
                            key={city.id}
                            className={`rounded border p-2 space-y-2 ${
                              cityActive
                                ? "border-cyan/40 bg-cyan/5"
                                : "border-panel-border/80"
                            }`}
                          >
                            <button
                              type="button"
                              className="w-full text-left bg-transparent border-0 p-0 cursor-pointer"
                              onClick={() => selectSettlement(city.id, null)}
                            >
                              <span className="text-sm text-star font-medium">
                                {city.name}
                              </span>
                              <span className="text-[10px] text-muted ml-2">
                                {city.districts.length} districts
                              </span>
                            </button>
                            <select
                              className={inputClass}
                              style={{ fontSize: "0.75rem" }}
                              value=""
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) return;
                                setCityOwner(
                                  planet.id,
                                  city.id,
                                  v === "__none__" ? null : v,
                                );
                                e.target.value = "";
                              }}
                            >
                              <option value="">Assign all districts…</option>
                              <option value="__none__">Unclaimed</option>
                              {campaign.factions.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                            <ul className="space-y-1.5 pl-1">
                              {city.districts.map((d) => {
                                const fac = getFactionById(
                                  campaign,
                                  d.controllingFactionId,
                                );
                                const active = selectedDistrictId === d.id;
                                return (
                                  <li
                                    key={d.id}
                                    className={`flex items-center gap-2 rounded px-1.5 py-1 ${
                                      active ? "bg-cyan/10" : ""
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="shrink-0 bg-transparent border-0 p-0 cursor-pointer"
                                      onClick={() =>
                                        selectSettlement(city.id, d.id)
                                      }
                                      title={d.name}
                                    >
                                      <FactionSwatch color={fac?.color} />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <button
                                        type="button"
                                        className="w-full text-left text-xs text-text truncate bg-transparent border-0 p-0 cursor-pointer"
                                        onClick={() =>
                                          selectSettlement(city.id, d.id)
                                        }
                                      >
                                        {d.name}
                                      </button>
                                      <p className="text-[10px] text-muted truncate">
                                        {DISTRICT_KIND_LABELS[d.kind]}
                                      </p>
                                    </div>
                                    <select
                                      className={inputClass + " w-[42%] shrink-0"}
                                      style={{ fontSize: "0.7rem" }}
                                      value={d.controllingFactionId ?? ""}
                                      onChange={(e) => {
                                        selectSettlement(city.id, d.id);
                                        setDistrictOwner(
                                          planet.id,
                                          city.id,
                                          d.id,
                                          e.target.value || null,
                                        );
                                      }}
                                    >
                                      <option value="">Unclaimed</option>
                                      {campaign.factions.map((f) => (
                                        <option key={f.id} value={f.id}>
                                          {f.name}
                                        </option>
                                      ))}
                                    </select>
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                );
              })()}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Open territory
                </h3>
                <button
                  type="button"
                  className="text-[10px] text-brass"
                  onClick={() => {
                    if (
                      confirm("Clear all open-hex claims on this world?")
                    )
                      clearOpenTileClaims(planet.id);
                  }}
                >
                  Clear open
                </button>
              </div>
              <p className="text-[10px] text-muted mb-2 leading-snug">
                Paint empty hexes (not cities/districts) with an empire color.
                Use Erase to unclaim.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button
                  type="button"
                  className={`hud-btn text-[10px] ${
                    terrainPaintFactionId == null ? "hud-btn-active" : ""
                  }`}
                  onClick={() => setTerrainPaintFaction(null)}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={`hud-btn text-[10px] ${
                    terrainPaintFactionId === TERRAIN_PAINT_ERASE
                      ? "hud-btn-active"
                      : ""
                  }`}
                  onClick={() => setTerrainPaintFaction(TERRAIN_PAINT_ERASE)}
                >
                  Erase
                </button>
                {campaign.factions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`hud-btn text-[10px] inline-flex items-center gap-1 ${
                      terrainPaintFactionId === f.id ? "hud-btn-active" : ""
                    }`}
                    onClick={() => setTerrainPaintFaction(f.id)}
                  >
                    <FactionSwatch color={f.color} />
                    {f.name}
                  </button>
                ))}
              </div>
              {terrainPaintFactionId != null && (
                <p className="text-[10px] text-cyan">
                  {viewLevel === "strategic"
                    ? "Click and drag open hexes on the globe to paint."
                    : "Open the strategic hex map to paint territory."}
                </p>
              )}
              {Object.keys(planet.tileClaims ?? {}).length > 0 && (
                <p className="text-[10px] text-muted mt-1">
                  {Object.keys(planet.tileClaims ?? {}).length} open hex
                  {Object.keys(planet.tileClaims ?? {}).length === 1
                    ? ""
                    : "es"}{" "}
                  claimed
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Armies
                </h3>
                {campaign.factions.length > 0 && (
                  <select
                    className={inputClass}
                    style={{ fontSize: "0.7rem", width: "auto" }}
                    value=""
                    onChange={(e) => {
                      const fid = e.target.value;
                      if (!fid || !planet) return;
                      addArmy(planet.id, fid);
                      e.target.value = "";
                    }}
                  >
                    <option value="">+ Deploy…</option>
                    {campaign.factions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {(planet.armies ?? []).length === 0 ? (
                <p className="text-xs text-muted">
                  Deploy an army, assign a symbol, then place it on the globe.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(planet.armies ?? []).map((army) => {
                    const fac = getFactionById(campaign, army.factionId);
                    const active = selectedArmyId === army.id;
                    const placing = placingArmyId === army.id;
                    return (
                      <li
                        key={army.id}
                        className={`rounded border p-2 space-y-2 ${
                          active
                            ? "border-cyan/40 bg-cyan/5"
                            : "border-panel-border/80"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {army.symbolId ? (
                            <img
                              src={
                                campaign.symbols?.find(
                                  (s) => s.id === army.symbolId,
                                )?.imageDataUrl
                              }
                              alt=""
                              className="w-8 h-8 object-contain rounded bg-void/50 border border-panel-border"
                            />
                          ) : (
                            <FactionSwatch color={fac?.color} />
                          )}
                          <input
                            className={inputClass + " flex-1"}
                            style={{ fontSize: "0.8rem" }}
                            value={army.name}
                            onChange={(e) =>
                              updateArmy(planet.id, army.id, {
                                name: e.target.value,
                              })
                            }
                            onFocus={() => selectArmy(army.id)}
                            placeholder="Army name (shown under symbol)"
                          />
                          <button
                            type="button"
                            className="text-xs text-crimson shrink-0"
                            onClick={() =>
                              setPendingArmyDelete({
                                planetId: planet.id,
                                armyId: army.id,
                                name: army.name,
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                        <select
                          className={inputClass}
                          style={{ fontSize: "0.75rem" }}
                          value={army.factionId}
                          onChange={(e) =>
                            updateArmy(planet.id, army.id, {
                              factionId: e.target.value,
                            })
                          }
                        >
                          {campaign.factions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className={inputClass}
                          style={{ fontSize: "0.75rem" }}
                          value={army.symbolId ?? ""}
                          onChange={(e) =>
                            updateArmy(planet.id, army.id, {
                              symbolId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">No symbol</option>
                          {(campaign.symbols ?? []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={`hud-btn w-full ${placing ? "hud-btn-active" : ""}`}
                          onClick={() => {
                            selectArmy(army.id);
                            setPlacingArmy(placing ? null : army.id);
                          }}
                        >
                          {placing ? "Click map to place…" : "Place on planet"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Battle log
                </h3>
                <button
                  type="button"
                  className="text-xs text-brass"
                  onClick={() => addBattle(planet.id)}
                >
                  + Entry
                </button>
              </div>
              {planet.battles.length === 0 ? (
                <p className="text-xs text-muted">No battles recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {planet.battles.map((battle) => (
                    <li
                      key={battle.id}
                      className="rounded border border-panel-border/80 p-2 space-y-1.5"
                    >
                      <div className="flex gap-2">
                        <input
                          className={inputClass + " flex-1"}
                          style={{ fontSize: "0.75rem" }}
                          placeholder="Date (e.g. 999.M41)"
                          value={battle.date}
                          onChange={(e) =>
                            updateBattle(planet.id, battle.id, {
                              date: e.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          className="text-xs text-crimson shrink-0"
                          onClick={() => deleteBattle(planet.id, battle.id)}
                        >
                          ×
                        </button>
                      </div>
                      <input
                        className={inputClass}
                        style={{ fontSize: "0.75rem" }}
                        placeholder="Summary"
                        value={battle.summary}
                        onChange={(e) =>
                          updateBattle(planet.id, battle.id, {
                            summary: e.target.value,
                          })
                        }
                      />
                      <input
                        className={inputClass}
                        style={{ fontSize: "0.75rem" }}
                        placeholder="Outcome"
                        value={battle.outcome}
                        onChange={(e) =>
                          updateBattle(planet.id, battle.id, {
                            outcome: e.target.value,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-crimson/50 text-crimson"
                onClick={() => {
                  if (confirm(`Delete ${planet.name}?`))
                    deletePlanet(planet.id);
                }}
              >
                Delete planet
              </button>
            </section>
          </div>
        </>
      ) : system && systemOwnership ? (
        <>
          <div className="p-4 border-b border-panel-border space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[10px] text-cyan uppercase tracking-[0.18em]">
                System
              </h2>
              <div className="flex items-center gap-2">
                {viewLevel === "galaxy" && (
                  <button
                    type="button"
                    className="text-[10px] text-muted hover:text-cyan"
                    onClick={() => selectSystem(null)}
                  >
                    ← Galaxy
                  </button>
                )}
                <button
                  type="button"
                  className="text-muted hover:text-cyan text-lg leading-none px-1"
                  onClick={toggleInspector}
                  title="Hide panel"
                  aria-label="Hide details panel"
                >
                  ×
                </button>
              </div>
            </div>
            <p className="font-display text-sm text-star truncate">{system.name}</p>
            {viewLevel === "galaxy" && (
              <button
                type="button"
                className="hud-btn w-full"
                onClick={() => enterSystem(system.id)}
              >
                Enter system
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <section>
              <label className="block text-xs text-muted mb-1">Name</label>
              <input
                className={inputClass + " mb-2"}
                value={system.name}
                onChange={(e) =>
                  updateSystem(system.id, { name: e.target.value })
                }
              />

              <label className="block text-xs text-muted mb-1">
                System owner
              </label>
              <div className="flex items-center gap-2 mb-1">
                {systemOwnership.status === "owned" && (
                  <FactionSwatch color={systemOwnership.factions[0].color} />
                )}
                {systemOwnership.status === "contested" &&
                  systemOwnership.factions.map((f) => (
                    <FactionSwatch key={f.id} color={f.color} />
                  ))}
                <select
                  className={inputClass + " flex-1"}
                  value={systemOwnerSelectValue(system, systemOwnership)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__contested__") return;
                    setSystemOwner(system.id, v || null);
                  }}
                >
                  <option value="">Unclaimed</option>
                  {systemOwnership.status === "contested" && (
                    <option value="__contested__" disabled>
                      Contested — {ownershipLabel(systemOwnership)}
                    </option>
                  )}
                  {campaign.factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-muted mb-2 leading-snug">
                Setting a system owner assigns every planet in it. Mixed planet
                owners make the system a battlezone.
              </p>

              <label className="block text-xs text-muted mb-1">Notes</label>
              <textarea
                className={inputClass + " min-h-16 resize-y mb-2"}
                value={system.notes}
                onChange={(e) =>
                  updateSystem(system.id, { notes: e.target.value })
                }
              />
            </section>

            <section>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted uppercase tracking-wide">
                  Planets
                </span>
                <button
                  type="button"
                  className="text-xs text-brass"
                  onClick={() => addPlanet(system.id)}
                >
                  + Planet
                </button>
              </div>
              {systemPlanets.length === 0 ? (
                <p className="text-xs text-muted">No planets.</p>
              ) : (
                <ul className="space-y-1">
                  {systemPlanets.map((p) => {
                    const fac = getFactionById(
                      campaign,
                      p.controllingFactionId,
                    );
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded border border-transparent hover:bg-panel-border/30 text-xs flex items-center gap-2 text-muted hover:text-text"
                          onClick={() => enterPlanet(p.id)}
                        >
                          <FactionSwatch color={fac?.color} />
                          <span className="truncate flex-1 text-star">
                            {p.name}
                          </span>
                          <span className="text-muted truncate max-w-[40%]">
                            {PLANET_TYPE_LABELS[p.type]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <FleetListSection systemId={system.id} title="Fleets" />

            <section>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-crimson/50 text-crimson"
                onClick={() => {
                  if (confirm(`Delete ${system.name} and all its planets?`))
                    deleteSystem(system.id);
                }}
              >
                Delete system
              </button>
            </section>
          </div>
        </>
      ) : (
        <div className="p-4 text-xs text-muted">Select a star system.</div>
      )}

      {pendingArmyDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-void/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-army-title"
        >
          <div className="hud-panel w-full max-w-sm p-4 shadow-xl space-y-4">
            <h2
              id="delete-army-title"
              className="font-display text-sm text-cyan uppercase tracking-[0.14em]"
            >
              Delete detachment
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="text-star">{pendingArmyDelete.name}</span>? This
              cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => setPendingArmyDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hud-btn flex-1 text-crimson border-crimson/40"
                onClick={() => {
                  deleteArmy(
                    pendingArmyDelete.planetId,
                    pendingArmyDelete.armyId,
                  );
                  setPendingArmyDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
