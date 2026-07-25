import { useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { OrbitRing } from "../components/system/OrbitRing";
import { PlanetNode } from "../components/system/PlanetNode";
import { AsteroidBeltRing } from "../components/system/AsteroidBeltRing";
import { FleetMarker } from "../components/fleet/FleetMarker";
import {
  PulsarJets,
  pulsarJetAngle,
} from "../components/galaxy/PulsarJets";
import { useMapCamera } from "../hooks/useMapCamera";
import {
  SYSTEM_VIEW_SIZE,
  maxOrbitRadius,
  orbitPosition,
  orbitRadiusForIndex,
} from "../lib/systemLayout";
import {
  fleetsAtSystemStar,
  fleetsInOrbit,
} from "../lib/fleets";
import {
  normalizeStarClass,
  starAppearance,
  starBodyGradient,
} from "../lib/stars";
import { STAR_CLASS_LABELS } from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";

const INITIAL_SCALE = 0.85;

export function SystemView() {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [mapScale, setMapScale] = useState(INITIAL_SCALE);
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedSystemId = useCampaignStore((s) => s.focusedSystemId);
  const selectedPlanetId = useCampaignStore((s) => s.selectedPlanetId);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);
  const fleetMoveModeId = useCampaignStore((s) => s.fleetMoveModeId);
  const enterPlanet = useCampaignStore((s) => s.enterPlanet);
  const selectPlanet = useCampaignStore((s) => s.selectPlanet);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const moveFleet = useCampaignStore((s) => s.moveFleet);

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
  const starLook = starAppearance(starClass);
  const starSize = starLook.systemSize;
  const starFleets = fleetsAtSystemStar(fleets, system.id);

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

            <div
              className="absolute z-10"
              style={{
                left: center,
                top: center,
                width: starSize,
                height: starSize,
                transform: "translate(-50%, -50%)",
              }}
            >
              {starClass === "pulsar" && (
                <PulsarJets
                  length={starSize * 2.8}
                  baseWidth={Math.max(10, starSize * 0.55)}
                  color={starLook.color}
                  highlight={starLook.highlight}
                  angleDeg={pulsarJetAngle(system.id)}
                />
              )}
              <button
                type="button"
                className="absolute inset-0 rounded-full border-0 p-0 cursor-pointer"
                style={{
                  background: starBodyGradient(starClass),
                  boxShadow:
                    canIntraMove && movingFleet?.location.kind !== "system"
                      ? `0 0 40px #4fd2ff, 0 0 90px ${starLook.corona}44`
                      : `0 0 40px ${starLook.color}88, 0 0 90px ${starLook.corona}44`,
                  outline:
                    canIntraMove && movingFleet?.location.kind !== "system"
                      ? "2px solid #4fd2ff"
                      : undefined,
                }}
                title={STAR_CLASS_LABELS[starClass]}
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
                {STAR_CLASS_LABELS[starClass]}
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
              const orbitFleets = fleetsInOrbit(fleets, system.id, planet.id);
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
                  {orbitFleets.map((fleet, i) => {
                    const fac = campaign.factions.find(
                      (f) => f.id === fleet.factionId,
                    );
                    return (
                      <FleetMarker
                        key={fleet.id}
                        fleet={fleet}
                        color={fac?.color ?? "#4fd2ff"}
                        x={px + 22}
                        y={py - 26}
                        selected={selectedFleetId === fleet.id}
                        moving={fleetMoveModeId === fleet.id}
                        mapScale={mapScale}
                        offsetIndex={i}
                        stackCount={orbitFleets.length}
                        onSelect={() => selectFleet(fleet.id)}
                      />
                    );
                  })}
                </div>
              );
            })}

            {starFleets.map((fleet, i) => {
              const fac = campaign.factions.find(
                (f) => f.id === fleet.factionId,
              );
              return (
                <FleetMarker
                  key={fleet.id}
                  fleet={fleet}
                  color={fac?.color ?? "#4fd2ff"}
                  x={center + 28}
                  y={center - 28}
                  selected={selectedFleetId === fleet.id}
                  moving={fleetMoveModeId === fleet.id}
                  mapScale={mapScale}
                  offsetIndex={i}
                  stackCount={starFleets.length}
                  onSelect={() => selectFleet(fleet.id)}
                />
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div className="absolute bottom-0 inset-x-0 z-10 pointer-events-none flex justify-center pb-3 px-3">
        <div className="pointer-events-auto hud-panel flex items-center gap-3 px-3 py-2 text-[11px] text-muted">
          {fleetMoveModeId && canIntraMove ? (
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
