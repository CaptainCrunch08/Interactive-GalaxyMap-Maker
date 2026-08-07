import type { Fleet, ShipChassis } from "../types/campaign";
import {
  SHIP_CHASSIS_LABELS,
  SHIP_CHASSIS_ORDER,
} from "../types/campaign";
import {
  chassisSummary,
  locationLabel,
  shipCount,
} from "../lib/fleets";
import {
  canDeployFromTransport,
  canLoadTransportCargo,
  canUnloadTransportCargo,
  DETACHMENT_BP_COST,
  fleetCargoBp,
  fleetCargoCapacity,
  shipCargoBp,
  TRANSPORT_BP_CAPACITY,
} from "../lib/buildingPoints";
import { playMoveBlockReason } from "../lib/play";
import { factionSymbolIds } from "../lib/factionSymbols";
import { factionsSortedByName, getFactionById } from "../lib/territory";
import { normalizeCampaignPlay } from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";

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

type FleetInspectorProps = {
  fleet: Fleet;
  onClose: () => void;
};

export function FleetInspector({ fleet, onClose }: FleetInspectorProps) {
  const campaign = useCampaignStore((s) => s.campaign);
  const fleetMoveModeId = useCampaignStore((s) => s.fleetMoveModeId);
  const viewLevel = useCampaignStore((s) => s.viewLevel);
  const updateFleet = useCampaignStore((s) => s.updateFleet);
  const deleteFleet = useCampaignStore((s) => s.deleteFleet);
  const addShip = useCampaignStore((s) => s.addShip);
  const updateShip = useCampaignStore((s) => s.updateShip);
  const deleteShip = useCampaignStore((s) => s.deleteShip);
  const setFleetMoveMode = useCampaignStore((s) => s.setFleetMoveMode);
  const travelThroughWarpGate = useCampaignStore((s) => s.travelThroughWarpGate);
  const loadTransportCargo = useCampaignStore((s) => s.loadTransportCargo);
  const unloadTransportCargo = useCampaignStore((s) => s.unloadTransportCargo);
  const deployFromTransport = useCampaignStore((s) => s.deployFromTransport);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const goBack = useCampaignStore((s) => s.goBack);
  const toggleInspector = useCampaignStore((s) => s.toggleInspector);

  const fac = getFactionById(campaign, fleet.factionId);
  const moving = fleetMoveModeId === fleet.id;
  const moveBlock = playMoveBlockReason(
    campaign,
    fleet.factionId,
    fleet.id,
    "fleet",
  );
  const play = normalizeCampaignPlay(campaign.play);
  const orbitPlanet =
    fleet.location.kind === "orbit"
      ? campaign.planets.find((p) => p.id === fleet.location.planetId)
      : undefined;
  const cargo = fleetCargoBp(fleet);
  const cargoCap = fleetCargoCapacity(fleet);
  const loadCheck =
    orbitPlanet && play.active
      ? canLoadTransportCargo(campaign, fleet, orbitPlanet)
      : null;
  const unloadCheck =
    orbitPlanet && play.active
      ? canUnloadTransportCargo(campaign, fleet, orbitPlanet)
      : null;
  const deployCheck =
    orbitPlanet && play.active
      ? canDeployFromTransport(campaign, fleet, orbitPlanet)
      : null;

  return (
    <>
      <div className="p-4 border-b border-panel-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[10px] text-cyan uppercase tracking-[0.18em]">
            Fleet
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-[10px] text-muted hover:text-cyan"
              onClick={onClose}
            >
              ← Back
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
        <p className="font-display text-sm text-star truncate flex items-center gap-2">
          <FactionSwatch color={fac?.color} />
          {fleet.name}
        </p>
        <p className="text-[10px] text-muted">
          {locationLabel(campaign, fleet.location)} · {shipCount(fleet)} ships
        </p>
        {viewLevel === "galaxy" && (
          <button
            type="button"
            className="hud-btn w-full"
            onClick={() => enterSystem(fleet.location.systemId)}
          >
            Enter system
          </button>
        )}
        {viewLevel !== "galaxy" && viewLevel !== "system" && (
          <button
            type="button"
            className="text-[10px] text-muted hover:text-cyan"
            onClick={goBack}
          >
            ← Up
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <label className="block text-xs text-muted mb-1">Name</label>
          <input
            className={inputClass + " mb-2"}
            value={fleet.name}
            onChange={(e) => updateFleet(fleet.id, { name: e.target.value })}
          />
          <label className="block text-xs text-muted mb-1">Faction</label>
          <div className="flex items-center gap-2 mb-2">
            <FactionSwatch color={fac?.color} />
            <select
              className={inputClass + " flex-1"}
              value={fleet.factionId}
              onChange={(e) =>
                updateFleet(fleet.id, {
                  factionId: e.target.value,
                  symbolId: undefined,
                })
              }
            >
              {factionsSortedByName(campaign.factions).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <label className="block text-xs text-muted mb-1">Symbol</label>
          <select
            className={inputClass + " mb-2"}
            value={fleet.symbolId ?? ""}
            onChange={(e) =>
              updateFleet(fleet.id, {
                symbolId: e.target.value || undefined,
              })
            }
          >
            <option value="">
              Faction primary
              {fac?.defaultSymbolId
                ? ` (${
                    campaign.symbols?.find((s) => s.id === fac.defaultSymbolId)
                      ?.name ?? "default"
                  })`
                : ""}
            </option>
            {(fac ? factionSymbolIds(fac) : [])
              .map((id) => (campaign.symbols ?? []).find((s) => s.id === id))
              .filter(Boolean)
              .map((s) => (
                <option key={s!.id} value={s!.id}>
                  {s!.name}
                  {s!.id === fac?.defaultSymbolId ? " (primary)" : ""}
                </option>
              ))}
          </select>
          <p className="text-[10px] text-muted mb-2">
            {chassisSummary(fleet) || "No ships"}
          </p>
          <button
            type="button"
            className={`hud-btn w-full ${moving ? "hud-btn-active" : ""}`}
            title={moveBlock ?? undefined}
            onClick={() => setFleetMoveMode(moving ? null : fleet.id)}
          >
            {moving
              ? viewLevel === "galaxy"
                ? "Click adjacent star…"
                : "Click star or planet…"
              : "Move fleet"}
          </button>
          {fleet.location.kind === "orbit" &&
            (() => {
              const gate = campaign.planets.find(
                (p) =>
                  p.id === fleet.location.planetId && p.type === "warp_gate",
              );
              if (!gate) return null;
              return (
                <button
                  type="button"
                  className="hud-btn w-full mt-2"
                  disabled={!!moveBlock}
                  title={moveBlock ?? undefined}
                  onClick={() => travelThroughWarpGate(fleet.id)}
                >
                  Travel through warp gate
                </button>
              );
            })()}
          {moveBlock && !moving && (
            <p className="text-[10px] text-brass mt-1.5 leading-snug">
              {moveBlock}
            </p>
          )}
          {moving && (
            <p className="text-[10px] text-cyan mt-1.5 leading-snug">
              {viewLevel === "galaxy"
                ? "On the galaxy map, click a hyperlane-linked system."
                : "In this system, click the star or a planet orbit. Leave the system to jump via hyperlanes from the galaxy map."}
            </p>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase text-muted tracking-wide">
              Ships
            </h3>
            {!normalizeCampaignPlay(campaign.play).active && (
              <select
                className={inputClass}
                style={{ fontSize: "0.7rem", width: "auto" }}
                value=""
                onChange={(e) => {
                  const chassis = e.target.value as ShipChassis;
                  if (!chassis) return;
                  addShip(fleet.id, chassis);
                  e.target.value = "";
                }}
              >
                <option value="">+ Add chassis…</option>
                {SHIP_CHASSIS_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {SHIP_CHASSIS_LABELS[c]}
                  </option>
                ))}
              </select>
            )}
          </div>
          {normalizeCampaignPlay(campaign.play).active && (
            <p className="text-[10px] text-muted mb-2">
              Build ships with building points at an owned Space Port.
            </p>
          )}
          {fleet.ships.length === 0 ? (
            <p className="text-xs text-muted">No ships in this fleet.</p>
          ) : (
            <ul className="space-y-2">
              {fleet.ships.map((ship) => (
                <li
                  key={ship.id}
                  className="rounded border border-panel-border/80 p-2 space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      className={inputClass + " flex-1"}
                      style={{ fontSize: "0.75rem" }}
                      value={ship.name}
                      onChange={(e) =>
                        updateShip(fleet.id, ship.id, {
                          name: e.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className="text-xs text-crimson shrink-0"
                      onClick={() => deleteShip(fleet.id, ship.id)}
                    >
                      ×
                    </button>
                  </div>
                  <select
                    className={inputClass}
                    style={{ fontSize: "0.7rem" }}
                    value={ship.chassis}
                    onChange={(e) =>
                      updateShip(fleet.id, ship.id, {
                        chassis: e.target.value as ShipChassis,
                      })
                    }
                  >
                    {SHIP_CHASSIS_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {SHIP_CHASSIS_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  {ship.chassis === "transport" && (
                    <p className="text-[10px] text-muted">
                      Hold {shipCargoBp(ship)}/{TRANSPORT_BP_CAPACITY} BP
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {cargoCap > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs uppercase text-muted tracking-wide">
              Transport cargo
            </h3>
            <p className="text-xs text-star">
              <span className="text-cyan font-medium">{cargo}</span>
              <span className="text-muted"> / {cargoCap} BP in holds</span>
            </p>
            <p className="text-[10px] text-muted leading-snug">
              Shuttle BP between owned worlds: load from producers, unload onto
              worlds with your cities (for ships/detachments), or spend cargo to
              deploy ({DETACHMENT_BP_COST} BP) without a War Camp.
            </p>
            {play.active && orbitPlanet ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  className="hud-btn w-full"
                  disabled={!loadCheck?.ok}
                  title={
                    loadCheck && !loadCheck.ok ? loadCheck.message : undefined
                  }
                  onClick={() => loadTransportCargo(fleet.id)}
                >
                  Load BP from {orbitPlanet.name}
                </button>
                {!loadCheck?.ok && loadCheck && (
                  <p className="text-[10px] text-brass leading-snug">
                    {loadCheck.message}
                  </p>
                )}
                <button
                  type="button"
                  className="hud-btn w-full"
                  disabled={!unloadCheck?.ok}
                  title={
                    unloadCheck && !unloadCheck.ok
                      ? unloadCheck.message
                      : undefined
                  }
                  onClick={() => unloadTransportCargo(fleet.id)}
                >
                  Unload BP onto {orbitPlanet.name}
                </button>
                {!unloadCheck?.ok && unloadCheck && (
                  <p className="text-[10px] text-brass leading-snug">
                    {unloadCheck.message}
                  </p>
                )}
                <button
                  type="button"
                  className="hud-btn w-full"
                  disabled={!deployCheck?.ok}
                  title={
                    deployCheck && !deployCheck.ok
                      ? deployCheck.message
                      : undefined
                  }
                  onClick={() => deployFromTransport(fleet.id)}
                >
                  Deploy detachment ({DETACHMENT_BP_COST} cargo BP)
                </button>
                {!deployCheck?.ok && deployCheck && (
                  <p className="text-[10px] text-brass leading-snug">
                    {deployCheck.message}
                  </p>
                )}
              </div>
            ) : cargoCap > 0 ? (
              <p className="text-[10px] text-brass leading-snug">
                {play.active
                  ? "Move into orbit to load, unload, or deploy cargo BP"
                  : "Start Play to move BP with transport holds"}
              </p>
            ) : null}
          </section>
        )}

        <section>
          <label className="block text-xs text-muted mb-1">Notes</label>
          <textarea
            className={inputClass + " min-h-20 resize-y"}
            value={fleet.notes}
            onChange={(e) => updateFleet(fleet.id, { notes: e.target.value })}
            placeholder="Orders, composition notes…"
          />
        </section>

        <section>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-crimson/50 text-crimson"
            onClick={() => {
              if (confirm(`Delete fleet ${fleet.name}?`)) {
                deleteFleet(fleet.id);
                onClose();
              }
            }}
          >
            Delete fleet
          </button>
        </section>
      </div>
    </>
  );
}

type FleetListProps = {
  systemId?: string;
  title?: string;
};

/** Compact fleet list for galaxy overview or system panel. */
export function FleetListSection({
  systemId,
  title = "Fleets",
}: FleetListProps) {
  const campaign = useCampaignStore((s) => s.campaign);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const addFleet = useCampaignStore((s) => s.addFleet);

  const fleets = (campaign.fleets ?? []).filter((f) =>
    systemId ? f.location.systemId === systemId : true,
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase text-muted tracking-wide">{title}</h3>
        {systemId &&
          campaign.factions.length > 0 &&
          !normalizeCampaignPlay(campaign.play).active && (
          <select
            className={inputClass}
            style={{ fontSize: "0.7rem", width: "auto" }}
            value=""
            onChange={(e) => {
              const fid = e.target.value;
              if (!fid) return;
              addFleet(systemId, fid);
              e.target.value = "";
            }}
          >
            <option value="">+ Deploy…</option>
            {factionsSortedByName(campaign.factions).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {fleets.length === 0 ? (
        <p className="text-xs text-muted">
          {systemId
            ? normalizeCampaignPlay(campaign.play).active
              ? "No fleets here. Recruit at a Space Port on a planet."
              : "No fleets in this system."
            : "No fleets yet. Open a system to deploy one."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {fleets.map((fleet) => {
            const fac = getFactionById(campaign, fleet.factionId);
            const active = selectedFleetId === fleet.id;
            return (
              <li key={fleet.id}>
                <button
                  type="button"
                  className={`w-full text-left px-2 py-1.5 rounded border text-xs flex items-center gap-2 ${
                    active
                      ? "border-cyan/40 bg-cyan/5 text-text"
                      : "border-transparent hover:bg-panel-border/30 text-muted hover:text-text"
                  }`}
                  onClick={() => selectFleet(fleet.id)}
                >
                  <FactionSwatch color={fac?.color} />
                  <span className="truncate flex-1">{fleet.name}</span>
                  <span className="text-[10px] text-muted shrink-0">
                    {shipCount(fleet)}
                  </span>
                </button>
                <p className="text-[10px] text-muted pl-6 truncate">
                  {locationLabel(campaign, fleet.location)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
