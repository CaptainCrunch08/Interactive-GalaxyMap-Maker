import { useMemo, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { useRef } from "react";
import { GalaxyBounds } from "./GalaxyBounds";
import { FactionTerritoryLayer } from "./FactionTerritoryLayer";
import { HyperlaneLayer } from "./HyperlaneLayer";
import { StarNode } from "./StarNode";
import { FleetMarker } from "../fleet/FleetMarker";
import { useMapCamera } from "../../hooks/useMapCamera";
import { getDominantFactionForSystem } from "../../store/useCampaignStore";
import { fleetsBySystemId } from "../../lib/fleets";
import { getSystemOwnership } from "../../lib/territory";
import type { Campaign } from "../../types/campaign";
import { campaignMapSize } from "../../types/campaign";

interface GalaxyChronicleMapProps {
  campaign: Campaign;
  className?: string;
}

/** Read-only galaxy map for chronicle timelapse playback. */
export function GalaxyChronicleMap({
  campaign,
  className = "",
}: GalaxyChronicleMapProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [mapScale, setMapScale] = useState(0.4);
  const mapSize = campaignMapSize(campaign);
  const fleets = campaign.fleets ?? [];
  const bySystem = useMemo(() => fleetsBySystemId(fleets), [fleets]);

  const { minScale, maxScale, syncTargetScale } = useMapCamera(
    transformRef,
    true,
    setMapScale,
    mapSize,
  );

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <TransformWrapper
        ref={transformRef}
        key={mapSize}
        initialScale={0.4}
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
                  selected={false}
                  editMode={false}
                  mapScale={mapScale}
                  onSelect={() => undefined}
                  onNavigate={() => undefined}
                  onDrag={() => undefined}
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
                    selected={false}
                    moving={false}
                    mapScale={mapScale}
                    offsetIndex={i}
                    onSelect={() => undefined}
                  />
                );
              });
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
