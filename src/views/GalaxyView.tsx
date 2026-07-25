import { useRef, useCallback, useMemo, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { GalaxyBounds } from "../components/galaxy/GalaxyBounds";
import { FactionTerritoryLayer } from "../components/galaxy/FactionTerritoryLayer";
import { HyperlaneLayer } from "../components/galaxy/HyperlaneLayer";
import { StarNode } from "../components/galaxy/StarNode";
import { FleetMarker } from "../components/fleet/FleetMarker";
import { useMapCamera } from "../hooks/useMapCamera";
import {
  getDominantFactionForSystem,
  useCampaignStore,
} from "../store/useCampaignStore";
import {
  adjacentSystemIds,
  fleetsBySystemId,
  shipCount,
} from "../lib/fleets";
import { getSystemOwnership } from "../lib/territory";
import { campaignMapSize } from "../types/campaign";

export function GalaxyView() {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [mapScale, setMapScale] = useState(0.45);
  const campaign = useCampaignStore((s) => s.campaign);
  const editMode = useCampaignStore((s) => s.editMode);
  const selectedSystemId = useCampaignStore((s) => s.selectedSystemId);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);
  const fleetMoveModeId = useCampaignStore((s) => s.fleetMoveModeId);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const selectSystem = useCampaignStore((s) => s.selectSystem);
  const moveSystem = useCampaignStore((s) => s.moveSystem);
  const addSystem = useCampaignStore((s) => s.addSystem);
  const toggleEditMode = useCampaignStore((s) => s.toggleEditMode);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const moveFleet = useCampaignStore((s) => s.moveFleet);
  const mapSize = campaignMapSize(campaign);
  const fleets = campaign.fleets ?? [];

  const { minScale, maxScale, syncTargetScale } = useMapCamera(
    transformRef,
    true,
    setMapScale,
    mapSize,
  );

  const bySystem = useMemo(() => fleetsBySystemId(fleets), [fleets]);

  const movingFleet = fleets.find((f) => f.id === fleetMoveModeId);
  const moveTargets = useMemo(() => {
    if (!movingFleet) return new Set<string>();
    return adjacentSystemIds(campaign.systems, movingFleet.location.systemId);
  }, [movingFleet, campaign.systems]);

  const handleAddAtCenter = useCallback(() => {
    const api = transformRef.current;
    const wrapper = api?.instance?.wrapperComponent;
    if (!wrapper) {
      addSystem(mapSize / 2, mapSize / 2);
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    const state = api.state;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const x = (cx - state.positionX) / state.scale;
    const y = (cy - state.positionY) / state.scale;
    addSystem(x, y);
  }, [addSystem, mapSize]);

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden">
      <TransformWrapper
        ref={transformRef}
        key={mapSize}
        initialScale={0.45}
        minScale={minScale}
        maxScale={maxScale}
        limitToBounds={false}
        centerOnInit
        wheel={{ disabled: true }}
        panning={{ disabled: editMode, velocityDisabled: true }}
        doubleClick={{ disabled: true }}
        onInit={(ref) => {
          syncTargetScale(ref.state.scale);
          setMapScale(ref.state.scale);
        }}
        onTransform={(_ref, state) => {
          setMapScale(state.scale);
        }}
        onPinchStop={(ref) => {
          syncTargetScale(ref.state.scale);
        }}
      >
        <TransformComponent
          wrapperClass="!w-full !h-full"
          contentClass="!block !w-fit !h-fit"
        >
          <div
            className="relative shrink-0"
            style={{
              width: mapSize,
              height: mapSize,
              aspectRatio: "1 / 1",
              flexShrink: 0,
            }}
          >
            <div className="galaxy-nebula pointer-events-none absolute inset-0" />
            <GalaxyBounds size={mapSize} />
            <FactionTerritoryLayer campaign={campaign} />
            <HyperlaneLayer systems={campaign.systems} mapSize={mapSize} />
            {campaign.systems.length === 0 && (
              <div
                className="absolute inset-0 flex items-center justify-center text-muted text-center px-8"
                style={{ pointerEvents: "none" }}
              >
                <p className="hud-panel px-6 py-4 text-sm">
                  No star systems yet. Use{" "}
                  <strong className="text-cyan">Add system</strong> below.
                </p>
              </div>
            )}
            {campaign.systems.map((system) => {
              const ownership = getSystemOwnership(campaign, system.id);
              const validTarget = Boolean(
                fleetMoveModeId && moveTargets.has(system.id),
              );
              return (
                <StarNode
                  key={system.id}
                  system={system}
                  faction={getDominantFactionForSystem(campaign, system.id)}
                  contested={ownership.status === "contested"}
                  contestedFactions={
                    ownership.status === "contested"
                      ? ownership.factions
                      : undefined
                  }
                  selected={
                    selectedSystemId === system.id || validTarget
                  }
                  editMode={editMode}
                  mapScale={mapScale}
                  onSelect={() => {
                    if (fleetMoveModeId && validTarget) {
                      moveFleet(fleetMoveModeId, {
                        kind: "system",
                        systemId: system.id,
                      });
                      return;
                    }
                    selectSystem(system.id);
                  }}
                  onNavigate={() => {
                    if (fleetMoveModeId) {
                      if (validTarget) {
                        moveFleet(fleetMoveModeId, {
                          kind: "system",
                          systemId: system.id,
                        });
                      }
                      return;
                    }
                    enterSystem(system.id);
                  }}
                  onDrag={(x, y) => moveSystem(system.id, x, y)}
                />
              );
            })}
            {campaign.systems.map((system) => {
              const systemFleets = bySystem.get(system.id) ?? [];
              if (systemFleets.length === 0) return null;
              return systemFleets.map((fleet, i) => {
                const fac = campaign.factions.find(
                  (f) => f.id === fleet.factionId,
                );
                return (
                  <FleetMarker
                    key={fleet.id}
                    fleet={fleet}
                    color={fac?.color ?? "#4fd2ff"}
                    x={system.x + 18}
                    y={system.y - 14}
                    selected={selectedFleetId === fleet.id}
                    moving={fleetMoveModeId === fleet.id}
                    mapScale={mapScale}
                    offsetIndex={i}
                    onSelect={() => selectFleet(fleet.id)}
                  />
                );
              });
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div className="absolute bottom-0 inset-x-0 z-10 pointer-events-none flex justify-center pb-3 px-3">
        <div className="pointer-events-auto hud-panel flex items-center gap-2 px-3 py-2 max-w-full">
          <button
            type="button"
            className={`hud-btn ${editMode ? "hud-btn-active" : ""}`}
            onClick={toggleEditMode}
            title="Toggle edit mode (E)"
          >
            {editMode ? "Edit" : "Navigate"}
          </button>
          <span className="hud-divider" />
          <button
            type="button"
            className="hud-btn"
            onClick={handleAddAtCenter}
          >
            + System
          </button>
          <span className="hud-divider hidden sm:block" />
          <span className="hidden sm:flex items-center gap-3 text-[11px] text-muted px-1">
            {fleetMoveModeId ? (
              <span className="text-cyan">
                Click a hyperlane-adjacent star to move{" "}
                {movingFleet?.name ?? "fleet"} (
                {movingFleet ? shipCount(movingFleet) : 0} ships)
              </span>
            ) : (
              <>
                <span>
                  <kbd className="hud-kbd">WASD</kbd> pan
                </span>
                <span>
                  <kbd className="hud-kbd">Scroll</kbd> zoom
                </span>
                {!editMode && (
                  <span>
                    <kbd className="hud-kbd">Drag</kbd> move
                  </span>
                )}
                {editMode && (
                  <span>
                    <kbd className="hud-kbd">Drag</kbd> stars
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      </div>

      {editMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 hud-panel px-3 py-1.5 text-xs text-cyan">
          Edit mode — drag stars to reposition
        </div>
      )}
      {fleetMoveModeId && !editMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 hud-panel px-3 py-1.5 text-xs text-cyan">
          Fleet move — click an adjacent system
        </div>
      )}
    </div>
  );
}
