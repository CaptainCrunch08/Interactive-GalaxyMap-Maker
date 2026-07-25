import { useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { OrbitRing } from "../components/system/OrbitRing";
import { PlanetNode } from "../components/system/PlanetNode";
import { FleetMarker } from "../components/fleet/FleetMarker";
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

            <button
              type="button"
              className="absolute rounded-full border-0 p-0 cursor-pointer z-10"
              style={{
                left: center,
                top: center,
                width: 48,
                height: 48,
                transform: "translate(-50%, -50%)",
                background:
                  "radial-gradient(circle at 35% 35%, #fff8e7, #f59e0b 40%, #c2410c 100%)",
                boxShadow:
                  canIntraMove && movingFleet?.location.kind !== "system"
                    ? "0 0 40px #4fd2ff, 0 0 90px #ea580c33"
                    : "0 0 40px #f59e0b66, 0 0 90px #ea580c33",
                outline:
                  canIntraMove && movingFleet?.location.kind !== "system"
                    ? "2px solid #4fd2ff"
                    : undefined,
              }}
              title="System star"
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

            <h2
              className="absolute font-display tracking-wide text-star pointer-events-none"
              style={{
                left: center,
                top: center - outermost - 48,
                transform: "translate(-50%, -50%)",
                fontSize: mapScale < 0.55 ? 14 : 18,
              }}
            >
              {system.name}
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
              return (
                <div key={planet.id}>
                  <PlanetNode
                    planet={planet}
                    x={px}
                    y={py}
                    faction={faction}
                    selected={
                      selectedPlanetId === planet.id ||
                      (canIntraMove &&
                        !(
                          movingFleet?.location.kind === "orbit" &&
                          movingFleet.location.planetId === planet.id
                        ))
                    }
                    mapScale={mapScale}
                    onNavigate={() => {
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
                    }}
                  />
                  {orbitFleets.map((fleet, i) => {
                    const fac = campaign.factions.find(
                      (f) => f.id === fleet.factionId,
                    );
                    return (
                      <FleetMarker
                        key={fleet.id}
                        fleet={fleet}
                        color={fac?.color ?? "#4fd2ff"}
                        x={px + 20}
                        y={py - 12}
                        selected={selectedFleetId === fleet.id}
                        moving={fleetMoveModeId === fleet.id}
                        mapScale={mapScale}
                        offsetIndex={i}
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
                  y={center - 20}
                  selected={selectedFleetId === fleet.id}
                  moving={fleetMoveModeId === fleet.id}
                  mapScale={mapScale}
                  offsetIndex={i}
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
