import { useRef } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { OrbitRing } from "../components/system/OrbitRing";
import { PlanetNode } from "../components/system/PlanetNode";
import { AsteroidBeltRing } from "../components/system/AsteroidBeltRing";
import { WarpGateNode } from "../components/system/WarpGateNode";
import { SystemStar } from "../components/system/SystemStar";
import { FleetMarker } from "../components/fleet/FleetMarker";
import { resolveFleetSymbolUrl } from "../lib/fleetSymbols";
import { useMapCamera } from "../hooks/useMapCamera";
import { useThrottledMapScale } from "../hooks/useThrottledMapScale";
import {
  SYSTEM_VIEW_SIZE,
  maxOrbitRadius,
  orbitFleetAnchor,
  orbitPosition,
  orbitRadiusForIndex,
  STAR_FLEET_OFFSET,
} from "../lib/systemLayout";
import {
  fleetsAtSystemStar,
  fleetsInOrbit,
  fleetsInSystem,
} from "../lib/fleets";
import { isBlackHoleBomb, normalizeStarClass, starAppearance, starSystemLabel } from "../lib/stars";
import { useCampaignStore } from "../store/useCampaignStore";

const INITIAL_SCALE = 0.85;

export function SystemView() {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [mapScale, setMapScale] = useThrottledMapScale(INITIAL_SCALE);
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedSystemId = useCampaignStore((s) => s.focusedSystemId);
  const selectedPlanetId = useCampaignStore((s) => s.selectedPlanetId);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);
  const fleetMoveModeId = useCampaignStore((s) => s.fleetMoveModeId);
  const enterPlanet = useCampaignStore((s) => s.enterPlanet);
  const selectPlanet = useCampaignStore((s) => s.selectPlanet);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const moveFleet = useCampaignStore((s) => s.moveFleet);
  const playMoveHint = useCampaignStore((s) => s.playMoveHint);

  const { minScale, maxScale, syncTargetScale } = useMapCamera(
    transformRef,
    true,
    setMapScale,
    SYSTEM_VIEW_SIZE,
  );

  const system = campaign.systems.find((s) => s.id === focusedSystemId);
  const planets = campaign.planets
    .filter((p) => p.systemId === focusedSystemId)
    .sort((a, b) => a.orbitIndex - b.orbitIndex);
  const fleets = campaign.fleets ?? [];
  const movingFleet = fleets.find((f) => f.id === fleetMoveModeId);
  const canIntraMove =
    Boolean(movingFleet) && movingFleet!.location.systemId === focusedSystemId;

  if (!system) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        System not found.
      </div>
    );
  }

  const center = SYSTEM_VIEW_SIZE / 2;
  const outermost = maxOrbitRadius(planets.length);
  const starClass = normalizeStarClass(system.starClass);
  const starSize = starAppearance(starClass).systemSize;
  const hasDyson = Boolean(system.dysonSphere);
  const isBomb = isBlackHoleBomb(system);
  const displayStarSize = isBomb
    ? starSize * 2.75
    : hasDyson
      ? starSize * 1.85
      : starSize;
  const starFleets = fleetsAtSystemStar(fleets, system.id);
  const warpGates = planets.filter((p) => p.type === "warp_gate");

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden">
      <TransformWrapper
        ref={transformRef}
        initialScale={INITIAL_SCALE}
        minScale={minScale}
        maxScale={maxScale}
        limitToBounds={false}
        centerOnInit
        wheel={{ disabled: true }}
        panning={{ velocityDisabled: true }}
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
              width: SYSTEM_VIEW_SIZE,
              height: SYSTEM_VIEW_SIZE,
            }}
          >
            <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-70" />

            {planets.map((planet, index) => {
              const orbitIndex =
                typeof planet.orbitIndex === "number"
                  ? planet.orbitIndex
                  : index;
              if (planet.type === "asteroid_belt") return null;
              return (
                <OrbitRing
                  key={`orbit-${planet.id}`}
                  radius={orbitRadiusForIndex(orbitIndex)}
                  center={center}
                />
              );
            })}

            {planets.length === 0 && (
              <OrbitRing radius={outermost} center={center} />
            )}

            {/* Power tethers from megastructure core to warp gates */}
            {hasDyson && warpGates.length > 0 && (
              <svg
                className="absolute inset-0 z-[9] pointer-events-none overflow-visible"
                width={SYSTEM_VIEW_SIZE}
                height={SYSTEM_VIEW_SIZE}
                aria-hidden
              >
                <defs>
                  <linearGradient
                    id="warp-power-beam"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    {isBomb ? (
                      <>
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.2" />
                        <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#f0abfc" stopOpacity="0.85" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor="#e8c547" stopOpacity="0.15" />
                        <stop offset="45%" stopColor="#4fd2ff" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#e8c547" stopOpacity="0.85" />
                      </>
                    )}
                  </linearGradient>
                </defs>
                {warpGates.map((gate, index) => {
                  const orbitIndex =
                    typeof gate.orbitIndex === "number"
                      ? gate.orbitIndex
                      : planets.findIndex((p) => p.id === gate.id);
                  const pos = orbitPosition(
                    orbitIndex >= 0 ? orbitIndex : index,
                  );
                  const x2 = center + pos.x;
                  const y2 = center + pos.y;
                  return (
                    <g key={`beam-${gate.id}`}>
                      <line
                        x1={center}
                        y1={center}
                        x2={x2}
                        y2={y2}
                        stroke={
                          isBomb
                            ? "rgba(167, 139, 250, 0.28)"
                            : "rgba(232, 197, 71, 0.25)"
                        }
                        strokeWidth={6}
                        strokeLinecap="round"
                      />
                      <line
                        x1={center}
                        y1={center}
                        x2={x2}
                        y2={y2}
                        stroke="url(#warp-power-beam)"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        className="dyson-power-beam"
                        strokeDasharray="14 10"
                      />
                      <circle
                        cx={x2}
                        cy={y2}
                        r={3.5}
                        fill={isBomb ? "#67e8f9" : "#e8c547"}
                        fillOpacity="0.85"
                        className="dyson-power-node"
                      />
                      <circle
                        cx={x2}
                        cy={y2}
                        r={7}
                        fill="none"
                        stroke={isBomb ? "#f0abfc" : "#4fd2ff"}
                        strokeOpacity="0.45"
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}
              </svg>
            )}

            <div
              className="absolute z-10"
              style={{
                left: center,
                top: center,
                width: displayStarSize,
                height: displayStarSize,
                transform: "translate(-50%, -50%)",
              }}
            >
              <SystemStar
                starClass={starClass}
                size={starSize}
                seed={system.id}
                dysonSphere={hasDyson}
                selected={
                  canIntraMove && movingFleet?.location.kind !== "system"
                }
                title={starSystemLabel(system)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canIntraMove && fleetMoveModeId) {
                    moveFleet(fleetMoveModeId, {
                      kind: "system",
                      systemId: system.id,
                    });
                  }
                }}
              />
            </div>

            <h2
              className="absolute font-display tracking-wide text-star pointer-events-none text-center"
              style={{
                left: center,
                top: center - outermost - 48,
                transform: "translate(-50%, -50%)",
                fontSize: mapScale < 0.55 ? 14 : 18,
              }}
            >
              {system.name}
              <span className="block text-[11px] text-muted font-body tracking-wider uppercase mt-1">
                {starSystemLabel(system)}
              </span>
            </h2>

            {planets.length === 0 && (
              <p
                className="absolute text-muted text-sm text-center pointer-events-none"
                style={{
                  left: center,
                  top: center + 64,
                  transform: "translate(-50%, 0)",
                }}
              >
                No planets in this system. Add one from the inspector.
              </p>
            )}

            {planets.map((planet, index) => {
              const orbitIndex =
                typeof planet.orbitIndex === "number"
                  ? planet.orbitIndex
                  : index;
              const pos = orbitPosition(orbitIndex);
              const faction = campaign.factions.find(
                (f) => f.id === planet.controllingFactionId,
              );
              const px = center + pos.x;
              const py = center + pos.y;
              const selected =
                selectedPlanetId === planet.id ||
                (canIntraMove &&
                  !(
                    movingFleet?.location.kind === "orbit" &&
                    movingFleet.location.planetId === planet.id
                  ));
              const onNavigate = () => {
                if (canIntraMove && fleetMoveModeId) {
                  moveFleet(fleetMoveModeId, {
                    kind: "orbit",
                    systemId: system.id,
                    planetId: planet.id,
                  });
                  return;
                }
                selectPlanet(planet.id);
                enterPlanet(planet.id);
              };

              return (
                <div key={planet.id}>
                  {planet.type === "asteroid_belt" ? (
                    <AsteroidBeltRing
                      planet={planet}
                      radius={orbitRadiusForIndex(orbitIndex)}
                      center={center}
                      faction={faction}
                      selected={selected}
                      mapScale={mapScale}
                      onNavigate={onNavigate}
                    />
                  ) : planet.type === "warp_gate" ? (
                    <WarpGateNode
                      planet={planet}
                      x={px}
                      y={py}
                      faceTowardX={center}
                      faceTowardY={center}
                      faction={faction}
                      selected={selected}
                      mapScale={mapScale}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <PlanetNode
                      planet={planet}
                      x={px}
                      y={py}
                      faction={faction}
                      selected={selected}
                      mapScale={mapScale}
                      onNavigate={onNavigate}
                    />
                  )}
                </div>
              );
            })}

            {fleetsInSystem(fleets, system.id).map((fleet) => {
              let ax: number;
              let ay: number;
              let peers: typeof fleets;
              if (fleet.location.kind === "orbit") {
                const planetId = fleet.location.planetId;
                const planet = planets.find((p) => p.id === planetId);
                if (!planet) return null;
                const orbitIndex =
                  typeof planet.orbitIndex === "number"
                    ? planet.orbitIndex
                    : planets.findIndex((p) => p.id === planet.id);
                const anchor = orbitFleetAnchor(Math.max(0, orbitIndex), center);
                ax = anchor.x;
                ay = anchor.y;
                peers = fleetsInOrbit(fleets, system.id, planetId);
              } else {
                ax = center + STAR_FLEET_OFFSET.x;
                ay = center + STAR_FLEET_OFFSET.y;
                peers = starFleets;
              }
              const i = peers.findIndex((f) => f.id === fleet.id);
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
                  x={ax}
                  y={ay}
                  selected={selectedFleetId === fleet.id}
                  moving={fleetMoveModeId === fleet.id}
                  mapScale={mapScale}
                  offsetIndex={i}
                  stackCount={peers.length}
                  appearance="ship"
                  onSelect={() => selectFleet(fleet.id)}
                />
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div className="absolute bottom-0 inset-x-0 z-10 pointer-events-none flex justify-center pb-3 px-3">
        <div className="pointer-events-auto hud-panel flex items-center gap-3 px-3 py-2 text-[11px] text-muted">
          {playMoveHint ? (
            <span className="text-brass">{playMoveHint}</span>
          ) : fleetMoveModeId && canIntraMove ? (
            <span className="text-cyan">
              Click the star or a planet to relocate {movingFleet?.name}
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
                <kbd className="hud-kbd">Click</kbd> enter planet
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
