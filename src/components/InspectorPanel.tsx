import { useEffect, useRef, useState } from "react";
import {
  DISTRICT_KIND_LABELS,
  PLANET_CLASSIFICATION_LABELS,
  PLANET_CLASSIFICATION_ORDER,
  PLANET_TYPE_LABELS,
  STAR_CLASS_LABELS,
  STAR_CLASS_ORDER,
  STRUCTURE_KIND_LABELS,
} from "../types/campaign";
import type {
  PlanetClassification,
  PlanetType,
  StarClass,
} from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";
import {
  getFactionById,
  getSystemOwnership,
  ownershipLabel,
  systemOwnerSelectValue,
} from "../lib/territory";
import { countDistrictsByFaction } from "../lib/settlements";
import {
  canBuildManufactorum,
  canRecruitDetachment,
  canRecruitShip,
  canUseSpacePort,
  DETACHMENT_BP_COST,
  getBuildingPoints,
  incomeForFaction,
  MANUFACTORUM_BP_COST,
  ownedCities,
  shipBpCost,
} from "../lib/buildingPoints";
import {
  ARMY_MOVE_RANGE,
  armyMovementRemaining,
  playMoveBlockReason,
} from "../lib/play";
import { armyStrength, VICTORY_KIND_LABELS } from "../lib/battleResolve";
import { factionSymbolIds } from "../lib/factionSymbols";
import {
  normalizeCampaignPlay,
  SHIP_CHASSIS_LABELS,
  SHIP_CHASSIS_ORDER,
} from "../types/campaign";
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
  const campaign = useCampaignStore((s) => s.campaign);
  const isDirty = useCampaignStore((s) => s.isDirty);
  const saveGalaxy = useCampaignStore((s) => s.saveGalaxy);
  const viewLevel = useCampaignStore((s) => s.viewLevel);
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
  const setSystemOwner = useCampaignStore((s) => s.setSystemOwner);
  const setPlanetOwner = useCampaignStore((s) => s.setPlanetOwner);
  const setCityOwner = useCampaignStore((s) => s.setCityOwner);
  const setDistrictOwner = useCampaignStore((s) => s.setDistrictOwner);
  const setStructureOwner = useCampaignStore((s) => s.setStructureOwner);
  const clearOpenTileClaims = useCampaignStore((s) => s.clearOpenTileClaims);
  const setTerrainPaintFaction = useCampaignStore(
    (s) => s.setTerrainPaintFaction,
  );
  const regenerateSettlements = useCampaignStore((s) => s.regenerateSettlements);
  const addArmy = useCampaignStore((s) => s.addArmy);
  const recruitDetachment = useCampaignStore((s) => s.recruitDetachment);
  const recruitShip = useCampaignStore((s) => s.recruitShip);
  const playBuildMode = useCampaignStore((s) => s.playBuildMode);
  const setPlayBuildMode = useCampaignStore((s) => s.setPlayBuildMode);
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
  const selectedStructureId = useCampaignStore((s) => s.selectedStructureId);
  const selectedArmyId = useCampaignStore((s) => s.selectedArmyId);
  const placingArmyId = useCampaignStore((s) => s.placingArmyId);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const terrainPaintFactionId = useCampaignStore(
    (s) => s.terrainPaintFactionId,
  );
  const selectSettlement = useCampaignStore((s) => s.selectSettlement);
  const selectStructure = useCampaignStore((s) => s.selectStructure);
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

  const planetScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPlanetDetails) return;
    const targetId = selectedArmyId
      ? `army-${selectedArmyId}`
      : selectedStructureId
        ? `structure-${selectedStructureId}`
        : selectedDistrictId
          ? `district-${selectedDistrictId}`
          : selectedCityId
            ? `city-${selectedCityId}`
            : null;
    if (!targetId) return;
    const root = planetScrollRef.current;
    const el = root?.querySelector(`#${CSS.escape(targetId)}`);
    el?.scrollIntoView({
      behavior: "smooth",
      block: selectedArmyId ? "center" : "nearest",
    });
  }, [
    showPlanetDetails,
    selectedArmyId,
    selectedCityId,
    selectedDistrictId,
    selectedStructureId,
  ]);

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
                className={`hud-btn ${isDirty ? "hud-btn-active" : ""}`}
                onClick={() => saveGalaxy()}
                title="Download this galaxy as JSON"
              >
                Save
              </button>
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
              <p className="text-xs text-muted leading-relaxed">
                Manage factions and symbols in{" "}
                <span className="text-cyan">Maps → Edit Galaxy</span>.
              </p>
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
              <p className="text-xs text-muted leading-relaxed">
                Add or arrange systems in{" "}
                <span className="text-cyan">Maps → Edit Galaxy</span>.
              </p>
            </section>
          </div>
        </>
      ) : showPlanetDetails && planet ? (
        <>
          <div className="p-4 border-b border-panel-border space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[10px] text-cyan uppercase tracking-[0.18em]">
                {planet.type === "asteroid_belt" ? "Asteroid belt" : "Planet"}
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

          <div
            ref={planetScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-6"
          >
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
              {planet.type === "warp_gate" && (
                <p className="text-[10px] text-brass mb-2 leading-snug">
                  Requires a Dyson Sphere in this system (enabled automatically).
                </p>
              )}
              {planet.type !== "asteroid_belt" &&
                planet.type !== "warp_gate" && (
                <>
                  <label className="block text-xs text-muted mb-1">
                    Classification
                  </label>
                  <select
                    className={inputClass + " mb-2"}
                    value={planet.classification ?? "earthlike"}
                    onChange={(e) =>
                      updatePlanet(planet.id, {
                        classification: e.target
                          .value as PlanetClassification,
                      })
                    }
                  >
                    {PLANET_CLASSIFICATION_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {PLANET_CLASSIFICATION_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </>
              )}
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

            {planet.type !== "asteroid_belt" && (
            <>
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Cities, districts & structures
                </h3>
                <button
                  type="button"
                  className="text-[10px] text-brass"
                  onClick={() => {
                    if (
                      confirm(
                        "Regenerate cities, districts, and structures for this world class?",
                      )
                    )
                      regenerateSettlements(planet.id);
                  }}
                >
                  Regenerate
                </button>
              </div>
              <p className="text-[10px] text-muted mb-2 leading-snug">
                Cities and districts sit on hexes; world-type structures
                (mines, docks, forts, …) occupy their own tiles. Empire color
                outlines owned hexes.
              </p>
              {(() => {
                const cities = planet.cities ?? [];
                const structures = planet.structures ?? [];
                if (cities.length === 0 && structures.length === 0) {
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
                            id={`city-${city.id}`}
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
                                    id={`district-${d.id}`}
                                    className={`rounded px-1.5 py-1.5 space-y-1 ${
                                      active ? "bg-cyan/10" : ""
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="w-full flex items-start gap-2 text-left bg-transparent border-0 p-0 cursor-pointer"
                                      onClick={() =>
                                        selectSettlement(city.id, d.id)
                                      }
                                    >
                                      <FactionSwatch color={fac?.color} />
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-xs text-text truncate">
                                          {d.name}
                                        </span>
                                        <span className="block text-[10px] text-brass truncate">
                                          {DISTRICT_KIND_LABELS[d.kind]}
                                        </span>
                                      </span>
                                    </button>
                                    <select
                                      className={inputClass}
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
                    {structures.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-[10px] uppercase tracking-wide text-muted mb-2">
                          Structures
                        </h4>
                        <ul className="space-y-2">
                          {structures.map((st) => {
                            const fac = getFactionById(
                              campaign,
                              st.controllingFactionId,
                            );
                            const active = selectedStructureId === st.id;
                            return (
                              <li
                                key={st.id}
                                id={`structure-${st.id}`}
                                className={`rounded px-2 py-1.5 space-y-1.5 border ${
                                  active
                                    ? "border-cyan/40 bg-cyan/5"
                                    : "border-panel-border/60"
                                }`}
                              >
                                <button
                                  type="button"
                                  className="w-full flex items-start gap-2 text-left bg-transparent border-0 p-0 cursor-pointer"
                                  onClick={() => selectStructure(st.id)}
                                >
                                  <FactionSwatch color={fac?.color} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-xs text-star font-medium truncate">
                                      {st.name}
                                    </span>
                                    <span className="block text-[10px] text-brass truncate">
                                      {STRUCTURE_KIND_LABELS[st.kind]}
                                    </span>
                                  </span>
                                </button>
                                <select
                                  className={inputClass}
                                  style={{ fontSize: "0.7rem" }}
                                  value={st.controllingFactionId ?? ""}
                                  onChange={(e) => {
                                    selectStructure(st.id);
                                    setStructureOwner(
                                      planet.id,
                                      st.id,
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
                      </div>
                    )}
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
                Paint empty hexes (not cities, districts, or structures) with an
                empire color. Use Erase to unclaim.
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

            {(() => {
              const play = normalizeCampaignPlay(campaign.play);
              if (!play.active || !play.activeFactionId || !planet) return null;
              const factionId = play.activeFactionId;
              const bp = getBuildingPoints(planet, factionId);
              const income = incomeForFaction(planet, factionId);
              const detCheck = canRecruitDetachment(
                campaign,
                planet,
                factionId,
              );
              const portCheck = canUseSpacePort(campaign, planet, factionId);
              const citiesOwned = ownedCities(planet, factionId);
              const buildCityId =
                playBuildMode?.kind === "manufactorum" &&
                playBuildMode.planetId === planet.id
                  ? playBuildMode.cityId
                  : (selectedCityId &&
                      citiesOwned.some((c) => c.id === selectedCityId)
                    ? selectedCityId
                    : citiesOwned[0]?.id ?? null);
              const manufCheck = canBuildManufactorum(
                campaign,
                planet,
                factionId,
                buildCityId,
              );
              const fac = getFactionById(campaign, factionId);
              return (
                <section>
                  <h3 className="text-xs uppercase text-muted tracking-wide mb-2">
                    Building points
                  </h3>
                  <p className="text-xs text-muted mb-2 flex items-center gap-2">
                    <FactionSwatch color={fac?.color} />
                    <span>
                      <span className="text-cyan font-medium">{bp} BP</span>
                      {" on this world"}
                      {income > 0 ? (
                        <span className="text-muted">
                          {" "}
                          · +{income}/turn from manufactorums
                        </span>
                      ) : null}
                    </span>
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      className="hud-btn w-full"
                      disabled={!detCheck.ok}
                      title={detCheck.ok ? undefined : detCheck.message}
                      onClick={() => recruitDetachment(planet.id)}
                    >
                      Recruit detachment ({DETACHMENT_BP_COST} BP)
                    </button>
                    {!detCheck.ok && (
                      <p className="text-[10px] text-brass leading-snug">
                        {detCheck.message}
                      </p>
                    )}

                    <p className="text-[10px] uppercase tracking-wider text-muted pt-1">
                      Build manufactorum
                    </p>
                    {citiesOwned.length > 0 && (
                      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
                        Around city
                        <select
                          className="hud-btn w-full text-left"
                          value={buildCityId ?? ""}
                          onChange={(e) => {
                            const cityId = e.target.value;
                            if (
                              playBuildMode?.kind === "manufactorum" &&
                              cityId
                            ) {
                              setPlayBuildMode({
                                kind: "manufactorum",
                                planetId: planet.id,
                                cityId,
                              });
                            }
                            selectSettlement(cityId, null);
                          }}
                        >
                          {citiesOwned.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      className={`hud-btn w-full ${
                        playBuildMode?.kind === "manufactorum"
                          ? "hud-btn-active"
                          : ""
                      }`}
                      disabled={!manufCheck.ok && playBuildMode == null}
                      title={
                        manufCheck.ok
                          ? "Then click a free hex next to the city on the strategic map"
                          : manufCheck.message
                      }
                      onClick={() => {
                        if (playBuildMode?.kind === "manufactorum") {
                          setPlayBuildMode(null);
                          return;
                        }
                        if (!manufCheck.ok) {
                          return;
                        }
                        setPlayBuildMode({
                          kind: "manufactorum",
                          planetId: planet.id,
                          cityId: manufCheck.city.id,
                        });
                        if (viewLevel !== "strategic") {
                          enterPlanet(planet.id);
                        }
                      }}
                    >
                      {playBuildMode?.kind === "manufactorum"
                        ? "Click hex around city… (cancel)"
                        : `Build manufactorum (${MANUFACTORUM_BP_COST} BP)`}
                    </button>
                    {!manufCheck.ok && playBuildMode == null && (
                      <p className="text-[10px] text-brass leading-snug">
                        {manufCheck.message}
                      </p>
                    )}
                    {playBuildMode?.kind === "manufactorum" && (
                      <p className="text-[10px] text-cyan leading-snug">
                        Open the strategic map and click a free hex adjacent to{" "}
                        {manufCheck.ok
                          ? manufCheck.city.name
                          : "the city"}
                        .
                      </p>
                    )}

                    <p className="text-[10px] uppercase tracking-wider text-muted pt-1">
                      Build ship at Space Port
                    </p>
                    {!portCheck.ok ? (
                      <p className="text-[10px] text-brass leading-snug">
                        {portCheck.message}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
                        {SHIP_CHASSIS_ORDER.map((chassis) => {
                          const shipCheck = canRecruitShip(
                            campaign,
                            planet,
                            factionId,
                            chassis,
                          );
                          const cost = shipBpCost(chassis);
                          return (
                            <button
                              key={chassis}
                              type="button"
                              className="hud-btn"
                              disabled={!shipCheck.ok}
                              title={
                                shipCheck.ok
                                  ? `${SHIP_CHASSIS_LABELS[chassis]} · ${cost} BP`
                                  : shipCheck.message
                              }
                              onClick={() =>
                                recruitShip(planet.id, chassis)
                              }
                            >
                              {SHIP_CHASSIS_LABELS[chassis]} ({cost})
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              );
            })()}

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase text-muted tracking-wide">
                  Armies
                </h3>
                {campaign.factions.length > 0 &&
                  !normalizeCampaignPlay(campaign.play).active && (
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
                  {normalizeCampaignPlay(campaign.play).active
                    ? "Recruit a detachment with building points at a War Camp."
                    : "Deploy an army, assign a symbol, then place it on the globe."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {(planet.armies ?? []).map((army) => {
                    const fac = getFactionById(campaign, army.factionId);
                    const active = selectedArmyId === army.id;
                    const placing = placingArmyId === army.id;
                    const armyMoveBlock = playMoveBlockReason(
                      campaign,
                      army.factionId,
                      army.id,
                      "army",
                    );
                    const play = normalizeCampaignPlay(campaign.play);
                    const movesLeft = play.active
                      ? armyMovementRemaining(play, army.id)
                      : null;
                    const str = armyStrength(army);
                    return (
                      <li
                        key={army.id}
                        id={`army-${army.id}`}
                        className={`rounded border p-2 space-y-2 cursor-pointer ${
                          active
                            ? "border-cyan/40 bg-cyan/5"
                            : "border-panel-border/80"
                        }`}
                        onClick={() => selectArmy(army.id)}
                      >
                        <div className="flex items-center gap-2">
                          {(army.symbolId ?? fac?.defaultSymbolId) ? (
                            <img
                              src={
                                campaign.symbols?.find(
                                  (s) =>
                                    s.id ===
                                    (army.symbolId ?? fac?.defaultSymbolId),
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
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">
                            STR
                          </span>
                          <div className="flex-1 h-1.5 rounded-sm bg-void/80 overflow-hidden border border-panel-border/60">
                            <div
                              className="h-full rounded-sm"
                              style={{
                                width: `${Math.max(2, str)}%`,
                                background: fac?.color ?? "#c9a227",
                              }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted w-10 text-right">
                            {str}%
                          </span>
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
                          <option value="">
                            Faction primary
                            {fac?.defaultSymbolId
                              ? ` (${
                                  campaign.symbols?.find(
                                    (s) => s.id === fac.defaultSymbolId,
                                  )?.name ?? "default"
                                })`
                              : ""}
                          </option>
                          {(fac ? factionSymbolIds(fac) : [])
                            .map((id) =>
                              (campaign.symbols ?? []).find((s) => s.id === id),
                            )
                            .filter(Boolean)
                            .map((s) => (
                              <option key={s!.id} value={s!.id}>
                                {s!.name}
                                {s!.id === fac?.defaultSymbolId
                                  ? " (primary)"
                                  : ""}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className={`hud-btn w-full ${placing ? "hud-btn-active" : ""}`}
                          title={armyMoveBlock ?? undefined}
                          onClick={() => {
                            selectArmy(army.id);
                            setPlacingArmy(placing ? null : army.id);
                          }}
                        >
                          {placing ? "Click map to place…" : "Place on planet"}
                        </button>
                        {movesLeft != null && !armyMoveBlock && (
                          <p className="text-[10px] text-muted leading-snug">
                            Movement {movesLeft}/{ARMY_MOVE_RANGE} hexes left
                          </p>
                        )}
                        {!placing && armyMoveBlock && (
                          <p className="text-[10px] text-brass leading-snug">
                            {armyMoveBlock}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            </>
            )}

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
                      {battle.victoryKind && (
                        <p className="text-[10px] text-brass uppercase tracking-wider">
                          {VICTORY_KIND_LABELS[battle.victoryKind]}
                          {battle.attackerVp != null &&
                          battle.defenderVp != null
                            ? ` · ${battle.attackerVp}–${battle.defenderVp} VP`
                            : ""}
                          {battle.attackerCasualties != null ||
                          battle.defenderCasualties != null
                            ? ` · KIA ${(battle.attackerCasualties ?? 0) + (battle.defenderCasualties ?? 0)}`
                            : ""}
                        </p>
                      )}
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
                Star class (core)
              </label>
              <select
                className={inputClass + " mb-2"}
                value={system.starClass ?? "G"}
                onChange={(e) =>
                  updateSystem(system.id, {
                    starClass: e.target.value as StarClass,
                  })
                }
              >
                {STAR_CLASS_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {STAR_CLASS_LABELS[c]}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-xs text-muted mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(system.dysonSphere)}
                  onChange={(e) =>
                    updateSystem(system.id, {
                      dysonSphere: e.target.checked,
                    })
                  }
                />
                <span>
                  Dyson Sphere megastructure
                  {system.dysonSphere ? " (wraps the core star)" : ""}
                </span>
              </label>
              {system.dysonSphere && (
                <p className="text-[10px] text-brass mb-2 leading-snug">
                  Required to host a warp gate. Feeds the gate through a power
                  tether in system view.
                </p>
              )}

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
                            {p.type === "asteroid_belt"
                              ? PLANET_TYPE_LABELS[p.type]
                              : PLANET_CLASSIFICATION_LABELS[
                                  p.classification
                                ] ?? PLANET_TYPE_LABELS[p.type]}
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
