import { useCallback, useMemo, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { GalaxyBounds } from "../galaxy/GalaxyBounds";
import { FactionTerritoryLayer } from "../galaxy/FactionTerritoryLayer";
import { HyperlaneLayer } from "../galaxy/HyperlaneLayer";
import { hasHyperlaneEdits } from "../../lib/hyperlanes";
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

type MarqueeRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

function normalizeRect(r: MarqueeRect): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const left = Math.min(r.x0, r.x1);
  const right = Math.max(r.x0, r.x1);
  const top = Math.min(r.y0, r.y1);
  const bottom = Math.max(r.y0, r.y1);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function pointInRect(
  x: number,
  y: number,
  rect: ReturnType<typeof normalizeRect>,
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

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
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
    null,
  );
  const drawingRef = useRef(false);
  const marqueeRef = useRef<MarqueeRect | null>(null);

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
  const deleteSystems = useCampaignStore((s) => s.deleteSystems);
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

  const clientToMap = useCallback(
    (clientX: number, clientY: number, mapEl: HTMLElement) => {
      const rect = mapEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = ((clientX - rect.left) / rect.width) * mapSize;
      const y = ((clientY - rect.top) / rect.height) * mapSize;
      return {
        x: Math.min(mapSize, Math.max(0, x)),
        y: Math.min(mapSize, Math.max(0, y)),
      };
    },
    [mapSize],
  );

  const placeSystemAtClient = useCallback(
    (clientX: number, clientY: number, mapEl: HTMLElement) => {
      const pt = clientToMap(clientX, clientY, mapEl);
      if (!pt) return;
      const id = addSystem(pt.x, pt.y);
      selectSystem(id);
      selectPlanet(null);
    },
    [addSystem, clientToMap, selectSystem, selectPlanet],
  );

  const marqueeNorm = marquee ? normalizeRect(marquee) : null;
  const marqueeHitIds = useMemo(() => {
    if (!marqueeNorm || (marqueeNorm.width < 4 && marqueeNorm.height < 4)) {
      return new Set<string>();
    }
    const hits = new Set<string>();
    for (const sys of campaign.systems) {
      if (pointInRect(sys.x, sys.y, marqueeNorm)) hits.add(sys.id);
    }
    return hits;
  }, [campaign.systems, marqueeNorm]);

  const pendingDeleteCount = pendingDeleteIds?.length ?? 0;
  const pendingPlanetCount = useMemo(() => {
    if (!pendingDeleteIds?.length) return 0;
    const ids = new Set(pendingDeleteIds);
    return campaign.planets.filter((p) => ids.has(p.systemId)).length;
  }, [campaign.planets, pendingDeleteIds]);

  const onStarSelect = (systemId: string) => {
    setSelectedLaneId(null);
    if (tool === "mass_delete") return;
    if (tool === "place") {
      // Stars already exist here — select instead of stacking
      selectSystem(systemId);
      selectPlanet(null);
      return;
    }
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

  const laneEdits = hasHyperlaneEdits(campaign);

  const placeHint = useMemo(() => {
    if (tool !== "place") return null;
    return "Click empty space to place a star · click an existing star to select it · toggle Place star off when done";
  }, [tool]);

  const connectHint = useMemo(() => {
    if (tool !== "connect") return null;
    if (!connectFromId) {
      return "Click a star to start a hyperlane · double-click to enter";
    }
    const name =
      campaign.systems.find((s) => s.id === connectFromId)?.name ?? "star";
    return `Click another star to connect from ${name} (or click a lane to delete) · double-click to enter`;
  }, [tool, connectFromId, campaign.systems]);

  const massDeleteHint = useMemo(() => {
    if (tool !== "mass_delete") return null;
    if (marqueeHitIds.size > 0) {
      return `Selecting ${marqueeHitIds.size} system${marqueeHitIds.size === 1 ? "" : "s"}… release to confirm`;
    }
    return "Drag a box around stars to mass-delete · release to confirm · toggle tool to cancel";
  }, [tool, marqueeHitIds]);

  const clearMassDeleteGesture = () => {
    drawingRef.current = false;
    marqueeRef.current = null;
    setMarquee(null);
    setPendingDeleteIds(null);
  };

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
          panning={{
            disabled:
              tool === "select" ||
              tool === "place" ||
              tool === "mass_delete",
            velocityDisabled: true,
          }}
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
                cursor:
                  tool === "place" || tool === "mass_delete"
                    ? "crosshair"
                    : undefined,
              }}
              onClick={(e) => {
                if (tool !== "place") return;
                placeSystemAtClient(e.clientX, e.clientY, e.currentTarget);
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
                const inMassSelect = marqueeHitIds.has(system.id);
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
                      connectFromId === system.id ||
                      inMassSelect
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
              {tool === "mass_delete" && (
                <div
                  className="absolute inset-0 z-30 touch-none"
                  style={{ cursor: "crosshair" }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (pendingDeleteIds) return;
                    const pt = clientToMap(
                      e.clientX,
                      e.clientY,
                      e.currentTarget,
                    );
                    if (!pt) return;
                    drawingRef.current = true;
                    const next = {
                      x0: pt.x,
                      y0: pt.y,
                      x1: pt.x,
                      y1: pt.y,
                    };
                    marqueeRef.current = next;
                    setMarquee(next);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!drawingRef.current) return;
                    const pt = clientToMap(
                      e.clientX,
                      e.clientY,
                      e.currentTarget,
                    );
                    if (!pt) return;
                    setMarquee((prev) => {
                      const base = prev ?? marqueeRef.current;
                      if (!base) {
                        const next = {
                          x0: pt.x,
                          y0: pt.y,
                          x1: pt.x,
                          y1: pt.y,
                        };
                        marqueeRef.current = next;
                        return next;
                      }
                      const next = { ...base, x1: pt.x, y1: pt.y };
                      marqueeRef.current = next;
                      return next;
                    });
                  }}
                  onPointerUp={(e) => {
                    if (!drawingRef.current) return;
                    drawingRef.current = false;
                    try {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    } catch {
                      /* already released */
                    }
                    const pt = clientToMap(
                      e.clientX,
                      e.clientY,
                      e.currentTarget,
                    );
                    const draft = marqueeRef.current;
                    const finalRect = normalizeRect(
                      pt && draft
                        ? { ...draft, x1: pt.x, y1: pt.y }
                        : draft ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
                    );
                    marqueeRef.current = null;
                    setMarquee(null);
                    if (finalRect.width < 8 && finalRect.height < 8) return;
                    const ids = campaign.systems
                      .filter((sys) => pointInRect(sys.x, sys.y, finalRect))
                      .map((sys) => sys.id);
                    if (ids.length === 0) return;
                    setPendingDeleteIds(ids);
                  }}
                  onPointerCancel={() => {
                    drawingRef.current = false;
                    marqueeRef.current = null;
                    setMarquee(null);
                  }}
                >
                  {marqueeNorm &&
                    (marqueeNorm.width > 0 || marqueeNorm.height > 0) && (
                      <div
                        className="pointer-events-none absolute border border-dashed border-rose-400/90 bg-rose-500/15"
                        style={{
                          left: marqueeNorm.left,
                          top: marqueeNorm.top,
                          width: Math.max(1, marqueeNorm.width),
                          height: Math.max(1, marqueeNorm.height),
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.35) inset",
                        }}
                      />
                    )}
                </div>
              )}
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
              clearMassDeleteGesture();
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
              clearMassDeleteGesture();
            }}
          >
            Connect lanes
          </button>
          <button
            type="button"
            className={`hud-btn ${tool === "place" ? "hud-btn-active" : ""}`}
            onClick={() => {
              setGalaxyEditorTool(tool === "place" ? "select" : "place");
              setConnectFromId(null);
              clearMassDeleteGesture();
            }}
            title={
              tool === "place"
                ? "Place star on — click map to spawn (click again to turn off)"
                : "Place star — click anywhere on the map to spawn"
            }
          >
            Place star
          </button>
          <button
            type="button"
            className={`hud-btn ${tool === "mass_delete" ? "hud-btn-active" : ""}`}
            onClick={() => {
              const next = tool === "mass_delete" ? "select" : "mass_delete";
              setGalaxyEditorTool(next);
              setConnectFromId(null);
              clearMassDeleteGesture();
            }}
            title="Draw a box to delete every star system inside it"
          >
            Mass delete
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              if (
                confirm(
                  laneEdits
                    ? "Rebuild hyperlanes from current star positions? Manual lane edits will be cleared."
                    : "Hyperlanes are already fully automatic.",
                )
              ) {
                resetHyperlanesToAuto();
                setConnectFromId(null);
              }
            }}
            disabled={!laneEdits}
            title={
              laneEdits
                ? "Rebuild the lane network from current star positions"
                : "Lanes already match the live auto network"
            }
          >
            Reset lanes
          </button>
        </div>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hud-panel px-3 py-1.5 text-[11px] text-muted max-w-[90%]">
          {placeHint ??
            connectHint ??
            massDeleteHint ??
            (tool === "select"
              ? "Click to select · double-click to enter system · drag to move · Undo / Ctrl+Z"
              : null)}
          {laneEdits && (
            <span className="text-brass ml-2">Sticky lanes · Reset to rebuild</span>
          )}
        </div>

        {pendingDeleteIds && pendingDeleteIds.length > 0 && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/70 px-4">
            <div
              className="hud-panel max-w-md w-full border border-rose-400/40 px-4 py-4 shadow-lg shadow-black/50"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mass-delete-title"
            >
              <h2
                id="mass-delete-title"
                className="font-display text-sm uppercase tracking-wider text-rose-300"
              >
                Delete systems?
              </h2>
              <p className="mt-2 text-xs text-fog/90 leading-relaxed">
                Remove{" "}
                <span className="text-cyan font-medium">
                  {pendingDeleteCount} star system
                  {pendingDeleteCount === 1 ? "" : "s"}
                </span>
                {pendingPlanetCount > 0 ? (
                  <>
                    {" "}
                    and{" "}
                    <span className="text-cyan font-medium">
                      {pendingPlanetCount} planet
                      {pendingPlanetCount === 1 ? "" : "s"}
                    </span>
                  </>
                ) : null}
                , plus fleets and hyperlanes tied to them. You can Undo
                afterward.
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="hud-btn"
                  onClick={() => setPendingDeleteIds(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="hud-btn border-rose-400/50 text-rose-200"
                  onClick={() => {
                    deleteSystems(pendingDeleteIds);
                    setPendingDeleteIds(null);
                    setMarquee(null);
                  }}
                >
                  Delete {pendingDeleteCount}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <EditGalaxyContentsInspector
        selectedSystemId={selectedSystemId}
        selectedPlanetId={selectedPlanetId}
      />
    </div>
  );
}
