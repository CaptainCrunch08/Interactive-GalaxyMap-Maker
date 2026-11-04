import { useRef, useMemo } from "react";
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
import { resolveFleetSymbolUrl } from "../lib/fleetSymbols";
import { useMapCamera } from "../hooks/useMapCamera";
import { useThrottledMapScale } from "../hooks/useThrottledMapScale";
import { useCampaignStore } from "../store/useCampaignStore";
import {
  adjacentSystemIds,
  fleetsBySystemId,
  shipCount,
} from "../lib/fleets";
import { getCampaignHyperlanes } from "../lib/hyperlanes";
import { getSystemOwnership } from "../lib/territory";
import { campaignMapSize } from "../types/campaign";

export function GalaxyView() {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [mapScale, setMapScale] = useThrottledMapScale(0.45);
  const campaign = useCampaignStore((s) => s.campaign);
  const editMode = useCampaignStore((s) => s.editMode);
  const selectedSystemId = useCampaignStore((s) => s.selectedSystemId);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);
  const fleetMoveModeId = useCampaignStore((s) => s.fleetMoveModeId);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const selectSystem = useCampaignStore((s) => s.selectSystem);
  const moveSystem = useCampaignStore((s) => s.moveSystem);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const moveFleet = useCampaignStore((s) => s.moveFleet);
  const playMoveHint = useCampaignStore((s) => s.playMoveHint);
  const mapSize = campaignMapSize(campaign);
  const fleets = campaign.fleets ?? [];

  const { minScale, maxScale, syncTargetScale } = useMapCamera(
    transformRef,
    true,
    setMapScale,
    mapSize,
  );

  const bySystem = useMemo(() => fleetsBySystemId(fleets), [fleets]);

  /** System to frame when returning from system view (or last selection). */
  const centerSystem = useMemo(() => {
    if (!selectedSystemId) return null;
    return campaign.systems.find((s) => s.id === selectedSystemId) ?? null;
  }, [campaign.systems, selectedSystemId]);

  const movingFleet = fleets.find((f) => f.id === fleetMoveModeId);
  const moveTargets = useMemo(() => {
    if (!movingFleet) return new Set<string>();
    return adjacentSystemIds(
      campaign.systems,
      movingFleet.location.systemId,
      getCampaignHyperlanes(campaign),
    );
  }, [movingFleet, campaign]);

  const ownershipBySystemId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getSystemOwnership>>();
    for (const system of campaign.systems) {
      map.set(system.id, getSystemOwnership(campaign, system.id));
    }
    return map;
  }, [campaign]);

  const starInteractionKey = `${editMode}:${fleetMoveModeId ?? ""}`;

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden">
      <TransformWrapper
        ref={transformRef}
        key={mapSize}
        initialScale={0.45}
        minScale={minScale}
        maxScale={maxScale}
        limitToBounds={false}
        centerOnInit={!centerSystem}
        wheel={{ disabled: true }}
        panning={{ disabled: editMode, velocityDisabled: true }}
        doubleClick={{ disabled: true }}
        onInit={(ref) => {
          syncTargetScale(ref.state.scale);
          setMapScale(ref.state.scale);
          if (!centerSystem) return;
          const wrapper = ref.instance.wrapperComponent;
          if (!wrapper) return;
          const { clientWidth: cw, clientHeight: ch } = wrapper;
          if (cw <= 0 || ch <= 0) return;
          const scale = ref.state.scale;
          ref.setTransform(
            cw / 2 - centerSystem.x * scale,
            ch / 2 - centerSystem.y * scale,
            scale,
            0,
          );
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
            <HyperlaneLayer
              systems={campaign.systems}
              mapSize={mapSize}
              campaign={campaign}
              mapScale={mapScale}
            />
            {campaign.systems.length === 0 && (
              <div
                className="absolute inset-0 flex items-center justify-center text-muted text-center px-8"
                style={{ pointerEvents: "none" }}
              >
                <p className="hud-panel px-6 py-4 text-sm">
                  No star systems yet. Add them in{" "}
                  <strong className="text-cyan">Maps → Edit Galaxy</strong>.
                </p>
              </div>
            )}
            {campaign.systems.map((system) => {
              const ownership = ownershipBySystemId.get(system.id);
              const validTarget = Boolean(
                fleetMoveModeId && moveTargets.has(system.id),
              );
              return (
                <StarNode
                  key={system.id}
                  system={system}
                  faction={
                    ownership?.status === "owned" ||
                    ownership?.status === "contested"
                      ? ownership.factions[0]
                      : undefined
                  }
                  contested={ownership?.status === "contested"}
                  contestedFactions={
                    ownership?.status === "contested"
                      ? ownership.factions
                      : undefined
                  }
                  selected={
                    selectedSystemId === system.id || validTarget
                  }
                  editMode={editMode}
                  mapScale={mapScale}
                  interactionKey={starInteractionKey}
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
            {(campaign.fleets ?? []).map((fleet) => {
              const system = campaign.systems.find(
                (s) => s.id === fleet.location.systemId,
              );
              if (!system) return null;
              const systemFleets = bySystem.get(system.id) ?? [];
              const i = systemFleets.findIndex((f) => f.id === fleet.id);
              if (i < 0) return null;
              const fac = campaign.factions.find(
                (f) => f.id === fleet.factionId,
              );
              return (
                <FleetMarker
                  key={fleet.id}
                  fleet={fleet}
                  color={fac?.color ?? "#4fd2ff"}
                  symbolUrl={resolveFleetSymbolUrl(
                    fleet,
                    fac,
                    campaign.symbols,
                  )}
                  x={system.x + 22}
                  y={system.y - 28}
                  selected={selectedFleetId === fleet.id}
                  moving={fleetMoveModeId === fleet.id}
                  mapScale={mapScale}
                  offsetIndex={i}
                  stackCount={systemFleets.length}
                  onSelect={() => selectFleet(fleet.id)}
                />
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div className="absolute bottom-0 inset-x-0 z-10 pointer-events-none flex justify-center pb-3 px-3">
        <div className="pointer-events-auto hud-panel flex items-center gap-2 px-3 py-2 max-w-full">
          <span className="flex items-center gap-3 text-[11px] text-muted px-1">
            {playMoveHint ? (
              <span className="text-brass">{playMoveHint}</span>
            ) : fleetMoveModeId ? (
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
                <span>
                  <kbd className="hud-kbd">Drag</kbd> move
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      {fleetMoveModeId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 hud-panel px-3 py-1.5 text-xs text-cyan">
          Fleet move — click an adjacent system
        </div>
      )}
    </div>
  );
}
