import { useCallback, useMemo, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { GalaxyBounds } from "../galaxy/GalaxyBounds";
import { FactionTerritoryLayer } from "../galaxy/FactionTerritoryLayer";
import { HyperlaneLayer } from "../galaxy/HyperlaneLayer";
import { StarNode } from "../galaxy/StarNode";
import { useMapCamera } from "../../hooks/useMapCamera";
import {
  getDominantFactionForSystem,
  useCampaignStore,
} from "../../store/useCampaignStore";
import { getSystemOwnership } from "../../lib/territory";
import { campaignMapSize } from "../../types/campaign";
import { EditGalaxyContentsInspector } from "./EditGalaxyContentsInspector";
import { SystemView } from "../../views/SystemView";
import { PlanetView } from "../../views/PlanetView";
import { StrategicView } from "../../views/StrategicView";

function ContentsChrome({
  title,
  onBack,
  canUndo,
  onUndo,
}: {
  title: string;
  onBack: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="absolute top-3 left-3 z-20 hud-panel flex flex-wrap items-center gap-2 px-2 py-2">
      <button type="button" className="hud-btn" onClick={onBack}>
        ← Back
      </button>
      <button
        type="button"
        className="hud-btn"
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <span className="text-[10px] uppercase tracking-wider text-muted px-1">
        {title}
      </span>
    </div>
  );
}

export function EditGalaxyContentsPanel() {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [mapScale, setMapScale] = useState(0.4);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);

  const campaign = useCampaignStore((s) => s.campaign);
  const viewLevel = useCampaignStore((s) => s.viewLevel);
  const focusedSystemId = useCampaignStore((s) => s.focusedSystemId);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const selectedSystemId = useCampaignStore((s) => s.selectedSystemId);
  const selectedPlanetId = useCampaignStore((s) => s.selectedPlanetId);
  const tool = useCampaignStore((s) => s.galaxyEditorTool);
  const setGalaxyEditorTool = useCampaignStore((s) => s.setGalaxyEditorTool);
  const selectSystem = useCampaignStore((s) => s.selectSystem);
  const selectPlanet = useCampaignStore((s) => s.selectPlanet);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const goBack = useCampaignStore((s) => s.goBack);
  const moveSystem = useCampaignStore((s) => s.moveSystem);
  const addSystem = useCampaignStore((s) => s.addSystem);
  const addHyperlane = useCampaignStore((s) => s.addHyperlane);
  const removeHyperlane = useCampaignStore((s) => s.removeHyperlane);
  const resetHyperlanesToAuto = useCampaignStore((s) => s.resetHyperlanesToAuto);
  const undoContentsEdit = useCampaignStore((s) => s.undoContentsEdit);
  const canUndo = useCampaignStore((s) => s.contentsUndoStack.length > 0);
  const mapSize = campaignMapSize(campaign);

  const { minScale, maxScale, syncTargetScale } = useMapCamera(
    transformRef,
    true,
    setMapScale,
    mapSize,
  );

  const handleAddAtCenter = useCallback(() => {
    const api = transformRef.current;
    const wrapper = api?.instance?.wrapperComponent;
    if (!wrapper) {
      addSystem(mapSize / 2, mapSize / 2);
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    const state = api.state;
    const x = (rect.width / 2 - state.positionX) / state.scale;
    const y = (rect.height / 2 - state.positionY) / state.scale;
    const id = addSystem(x, y);
    selectSystem(id);
    selectPlanet(null);
  }, [addSystem, mapSize, selectSystem, selectPlanet]);

  const onStarSelect = (systemId: string) => {
    setSelectedLaneId(null);
    if (tool === "connect") {
      if (!connectFromId) {
        setConnectFromId(systemId);
        selectSystem(systemId);
        return;
      }
      if (connectFromId === systemId) {
        setConnectFromId(null);
        return;
      }
      addHyperlane(connectFromId, systemId);
      setConnectFromId(null);
      selectSystem(systemId);
      return;
    }
    selectSystem(systemId);
    selectPlanet(null);
  };

  const manualLanes = Boolean(campaign.hyperlanes);

  const connectHint = useMemo(() => {
    if (tool !== "connect") return null;
    if (!connectFromId) {
      return "Click a star to start a hyperlane · double-click to enter";
    }
    const name =
      campaign.systems.find((s) => s.id === connectFromId)?.name ?? "star";
    return `Click another star to connect from ${name} (or click a lane to delete) · double-click to enter`;
  }, [tool, connectFromId, campaign.systems]);

  const focusedSystem = campaign.systems.find((s) => s.id === focusedSystemId);
  const focusedPlanet = campaign.planets.find((p) => p.id === focusedPlanetId);

  if (viewLevel === "strategic") {
    return (
      <div className="flex-1 min-h-0 relative h-full overflow-hidden">
        <ContentsChrome
          title={focusedPlanet?.name ?? "Strategic"}
          onBack={goBack}
          canUndo={canUndo}
          onUndo={() => undoContentsEdit()}
        />
        <StrategicView />
      </div>
    );
  }

  if (viewLevel === "planet") {
    return (
      <div className="flex-1 min-h-0 relative h-full overflow-hidden">
        <ContentsChrome
          title={focusedPlanet?.name ?? "Planet"}
          onBack={goBack}
          canUndo={canUndo}
          onUndo={() => undoContentsEdit()}
        />
        <PlanetView />
      </div>
    );
  }

  if (viewLevel === "system") {
    return (
      <div className="flex-1 min-h-0 relative h-full overflow-hidden">
        <ContentsChrome
          title={focusedSystem?.name ?? "System"}
          onBack={goBack}
          canUndo={canUndo}
          onUndo={() => undoContentsEdit()}
        />
        <SystemView />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 relative galaxy-bg overflow-hidden">
        <TransformWrapper
          ref={transformRef}
          key={mapSize}
          initialScale={0.4}
          minScale={minScale}
          maxScale={maxScale}
          limitToBounds={false}
          centerOnInit
          wheel={{ disabled: true }}
          panning={{ disabled: tool === "select", velocityDisabled: true }}
          doubleClick={{ disabled: true }}
          onInit={(ref) => {
            syncTargetScale(ref.state.scale);
            setMapScale(ref.state.scale);
          }}
          onTransform={(_ref, state) => setMapScale(state.scale)}
          onPinchStop={(ref) => syncTargetScale(ref.state.scale)}
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
              }}
            >
              <div className="galaxy-nebula pointer-events-none absolute inset-0" />
              <GalaxyBounds size={mapSize} />
              <FactionTerritoryLayer campaign={campaign} />
              <HyperlaneLayer
                systems={campaign.systems}
                mapSize={mapSize}
                campaign={campaign}
                interactive={tool === "connect"}
                selectedLaneId={selectedLaneId}
                onLaneClick={(laneId) => {
                  setSelectedLaneId(laneId);
                  removeHyperlane(laneId);
                  setSelectedLaneId(null);
                }}
              />
              {campaign.systems.map((system) => {
                const ownership = getSystemOwnership(campaign, system.id);
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
                      selectedSystemId === system.id ||
                      connectFromId === system.id
                    }
                    editMode
                    canDrag={tool === "select"}
                    mapScale={mapScale}
                    onSelect={() => onStarSelect(system.id)}
                    onNavigate={() => enterSystem(system.id)}
                    onDrag={(x, y) => moveSystem(system.id, x, y)}
                  />
                );
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>

        <div className="absolute top-3 left-3 z-10 hud-panel flex flex-wrap items-center gap-2 px-2 py-2">
          <button
            type="button"
            className="hud-btn"
            disabled={!canUndo}
            onClick={() => undoContentsEdit()}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className={`hud-btn ${tool === "select" ? "hud-btn-active" : ""}`}
            onClick={() => {
              setGalaxyEditorTool("select");
              setConnectFromId(null);
            }}
          >
            Select / drag
          </button>
          <button
            type="button"
            className={`hud-btn ${tool === "connect" ? "hud-btn-active" : ""}`}
            onClick={() => {
              setGalaxyEditorTool("connect");
              setConnectFromId(null);
            }}
          >
            Connect lanes
          </button>
          <button type="button" className="hud-btn" onClick={handleAddAtCenter}>
            + System
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              if (
                confirm(
                  manualLanes
                    ? "Reset hyperlanes to auto-generated network?"
                    : "Hyperlanes are already automatic.",
                )
              ) {
                resetHyperlanesToAuto();
                setConnectFromId(null);
              }
            }}
            disabled={!manualLanes}
            title={
              manualLanes
                ? "Clear manual lanes and restore auto graph"
                : "Using auto hyperlanes"
            }
          >
            Reset lanes
          </button>
        </div>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hud-panel px-3 py-1.5 text-[11px] text-muted max-w-[90%]">
          {connectHint ??
            (tool === "select"
              ? "Click to select · double-click to enter system · drag to move · Undo / Ctrl+Z"
              : null)}
          {manualLanes && tool === "select" && (
            <span className="text-brass ml-2">Manual hyperlanes</span>
          )}
        </div>
      </div>

      <EditGalaxyContentsInspector
        selectedSystemId={selectedSystemId}
        selectedPlanetId={selectedPlanetId}
      />
    </div>
  );
}
