import {
  PLANET_CLASSIFICATION_LABELS,
  PLANET_CLASSIFICATION_ORDER,
  PLANET_TYPE_LABELS,
  STAR_CLASS_LABELS,
  STAR_CLASS_ORDER,
  STRUCTURE_KIND_LABELS,
  STRUCTURE_KIND_ORDER,
  type PlanetClassification,
  type PlanetType,
  type StarClass,
  type StructureKind,
} from "../../types/campaign";
import { useCampaignStore } from "../../store/useCampaignStore";

const inputClass = "hud-input";

type Props = {
  selectedSystemId: string | null;
  selectedPlanetId: string | null;
};

export function EditGalaxyContentsInspector({
  selectedSystemId,
  selectedPlanetId,
}: Props) {
  const campaign = useCampaignStore((s) => s.campaign);
  const selectSystem = useCampaignStore((s) => s.selectSystem);
  const selectPlanet = useCampaignStore((s) => s.selectPlanet);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const enterPlanet = useCampaignStore((s) => s.enterPlanet);
  const enterStrategic = useCampaignStore((s) => s.enterStrategic);
  const updateSystem = useCampaignStore((s) => s.updateSystem);
  const deleteSystem = useCampaignStore((s) => s.deleteSystem);
  const addPlanet = useCampaignStore((s) => s.addPlanet);
  const updatePlanet = useCampaignStore((s) => s.updatePlanet);
  const deletePlanet = useCampaignStore((s) => s.deletePlanet);
  const setPlanetOwner = useCampaignStore((s) => s.setPlanetOwner);
  const setCityOwner = useCampaignStore((s) => s.setCityOwner);
  const setDistrictOwner = useCampaignStore((s) => s.setDistrictOwner);
  const setStructureOwner = useCampaignStore((s) => s.setStructureOwner);
  const regenerateSettlements = useCampaignStore((s) => s.regenerateSettlements);
  const clearOpenTileClaims = useCampaignStore((s) => s.clearOpenTileClaims);
  const addStructure = useCampaignStore((s) => s.addStructure);
  const updateStructure = useCampaignStore((s) => s.updateStructure);
  const deleteStructure = useCampaignStore((s) => s.deleteStructure);

  const system = campaign.systems.find((s) => s.id === selectedSystemId);
  const planet = campaign.planets.find((p) => p.id === selectedPlanetId);
  const systemPlanets = campaign.planets
    .filter((p) => p.systemId === selectedSystemId)
    .sort((a, b) => a.orbitIndex - b.orbitIndex);

  return (
    <aside className="w-80 shrink-0 border-l border-panel-border bg-[#070d14] flex flex-col min-h-0">
      <div className="px-3 py-3 border-b border-panel-border">
        <h3 className="font-display text-[10px] text-cyan uppercase tracking-[0.16em]">
          Contents
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-sm">
        {!system && !planet && (
          <div className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">
              Select a star on the map to edit the system, planets, structures,
              and open-hex claims. Use Connect lanes to draw or delete
              hyperlanes freely.
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Systems ({campaign.systems.length})
            </p>
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {campaign.systems.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="outliner-item w-full text-left"
                    onClick={() => {
                      selectSystem(s.id);
                      selectPlanet(null);
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {system && !planet && (
          <div className="space-y-3">
            <button
              type="button"
              className="text-[11px] text-muted hover:text-cyan"
              onClick={() => selectSystem(null)}
            >
              ← All systems
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => enterSystem(system.id)}
              >
                Enter system
              </button>
            </div>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              System name
              <input
                className={inputClass + " mt-1"}
                value={system.name}
                onChange={(e) =>
                  updateSystem(system.id, { name: e.target.value })
                }
              />
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Star class
              <select
                className={inputClass + " mt-1"}
                value={system.starClass}
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
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Notes
              <textarea
                className={inputClass + " mt-1 min-h-[4rem]"}
                value={system.notes}
                onChange={(e) =>
                  updateSystem(system.id, { notes: e.target.value })
                }
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => {
                  const id = addPlanet(system.id);
                  selectPlanet(id);
                }}
              >
                + Planet
              </button>
              <button
                type="button"
                className="hud-btn text-crimson"
                onClick={() => {
                  if (confirm(`Delete system “${system.name}”?`)) {
                    deleteSystem(system.id);
                    selectPlanet(null);
                  }
                }}
              >
                Delete
              </button>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted pt-2">
              Planets
            </p>
            <ul className="space-y-1">
              {systemPlanets.length === 0 && (
                <li className="text-xs text-muted">No planets.</li>
              )}
              {systemPlanets.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="outliner-item w-full text-left"
                    onClick={() => selectPlanet(p.id)}
                  >
                    {p.name}
                    <span className="block text-[10px] text-muted">
                      {PLANET_TYPE_LABELS[p.type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {planet && (
          <div className="space-y-3">
            <button
              type="button"
              className="text-[11px] text-muted hover:text-cyan"
              onClick={() => selectPlanet(null)}
            >
              ← {system?.name ?? "System"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => enterPlanet(planet.id)}
              >
                Enter planet
              </button>
              {planet.type !== "asteroid_belt" && (
                <button
                  type="button"
                  className="hud-btn flex-1"
                  onClick={() => enterStrategic(planet.id)}
                >
                  Edit tiles
                </button>
              )}
            </div>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Planet name
              <input
                className={inputClass + " mt-1"}
                value={planet.name}
                onChange={(e) =>
                  updatePlanet(planet.id, { name: e.target.value })
                }
              />
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Type
              <select
                className={inputClass + " mt-1"}
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
            </label>
            {planet.type !== "asteroid_belt" && (
              <label className="block text-[10px] uppercase tracking-wider text-muted">
                Classification
                <select
                  className={inputClass + " mt-1"}
                  value={planet.classification}
                  onChange={(e) =>
                    updatePlanet(planet.id, {
                      classification: e.target.value as PlanetClassification,
                    })
                  }
                >
                  {PLANET_CLASSIFICATION_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {PLANET_CLASSIFICATION_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Owner
              <select
                className={inputClass + " mt-1"}
                value={planet.controllingFactionId ?? ""}
                onChange={(e) =>
                  setPlanetOwner(planet.id, e.target.value || null)
                }
              >
                <option value="">Unowned</option>
                {campaign.factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Notes
              <textarea
                className={inputClass + " mt-1 min-h-[3rem]"}
                value={planet.notes}
                onChange={(e) =>
                  updatePlanet(planet.id, { notes: e.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="hud-btn"
                onClick={() => regenerateSettlements(planet.id)}
              >
                Regenerate surface
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => clearOpenTileClaims(planet.id)}
              >
                Clear open tiles
              </button>
              <button
                type="button"
                className="hud-btn text-crimson"
                onClick={() => {
                  if (confirm(`Delete planet “${planet.name}”?`)) {
                    deletePlanet(planet.id);
                    selectPlanet(null);
                  }
                }}
              >
                Delete planet
              </button>
            </div>

            <section className="space-y-2 pt-2 border-t border-panel-border">
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Cities / districts
              </p>
              {(planet.cities ?? []).length === 0 ? (
                <p className="text-xs text-muted">No cities.</p>
              ) : (
                <ul className="space-y-2">
                  {(planet.cities ?? []).map((city) => (
                    <li
                      key={city.id}
                      className="rounded border border-panel-border/60 p-2 space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs flex-1 truncate">
                          {city.name}
                        </span>
                        <select
                          className={inputClass}
                          style={{ fontSize: "0.7rem", width: "7rem" }}
                          value={city.controllingFactionId ?? ""}
                          onChange={(e) =>
                            setCityOwner(
                              planet.id,
                              city.id,
                              e.target.value || null,
                            )
                          }
                        >
                          <option value="">—</option>
                          {campaign.factions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {city.districts.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center gap-2 pl-2 text-[11px] text-muted"
                        >
                          <span className="flex-1 truncate">{d.name}</span>
                          <select
                            className={inputClass}
                            style={{ fontSize: "0.65rem", width: "6.5rem" }}
                            value={d.controllingFactionId ?? ""}
                            onChange={(e) =>
                              setDistrictOwner(
                                planet.id,
                                city.id,
                                d.id,
                                e.target.value || null,
                              )
                            }
                          >
                            <option value="">—</option>
                            {campaign.factions.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2 pt-2 border-t border-panel-border">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  Structures
                </p>
                <select
                  className={inputClass}
                  style={{ fontSize: "0.7rem", width: "9rem" }}
                  defaultValue=""
                  onChange={(e) => {
                    const kind = e.target.value as StructureKind;
                    if (!kind) return;
                    addStructure(planet.id, kind);
                    e.target.value = "";
                  }}
                >
                  <option value="">+ Add…</option>
                  {STRUCTURE_KIND_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {STRUCTURE_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              {(planet.structures ?? []).length === 0 ? (
                <p className="text-xs text-muted">No structures.</p>
              ) : (
                <ul className="space-y-2">
                  {(planet.structures ?? []).map((st) => (
                    <li
                      key={st.id}
                      className="rounded border border-panel-border/60 p-2 space-y-1"
                    >
                      <input
                        className={inputClass}
                        style={{ fontSize: "0.75rem" }}
                        value={st.name}
                        onChange={(e) =>
                          updateStructure(planet.id, st.id, {
                            name: e.target.value,
                          })
                        }
                      />
                      <div className="flex gap-1">
                        <select
                          className={inputClass + " flex-1"}
                          style={{ fontSize: "0.7rem" }}
                          value={st.kind}
                          onChange={(e) =>
                            updateStructure(planet.id, st.id, {
                              kind: e.target.value as StructureKind,
                            })
                          }
                        >
                          {STRUCTURE_KIND_ORDER.map((k) => (
                            <option key={k} value={k}>
                              {STRUCTURE_KIND_LABELS[k]}
                            </option>
                          ))}
                        </select>
                        <select
                          className={inputClass}
                          style={{ fontSize: "0.7rem", width: "6rem" }}
                          value={st.controllingFactionId ?? ""}
                          onChange={(e) =>
                            setStructureOwner(
                              planet.id,
                              st.id,
                              e.target.value || null,
                            )
                          }
                        >
                          <option value="">—</option>
                          {campaign.factions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="text-crimson text-xs px-1"
                          onClick={() => deleteStructure(planet.id, st.id)}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
