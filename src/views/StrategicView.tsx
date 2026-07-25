import { PLANET_CLASSIFICATION_LABELS, PLANET_TYPE_LABELS } from "../types/campaign";
import { legendSwatch, terrainLegend } from "../lib/planetTerrain";
import {
  HexPlanet,
  TERRAIN_PAINT_ERASE,
} from "../components/strategic/HexPlanet";
import { useCampaignStore } from "../store/useCampaignStore";

export function StrategicView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const selectedCityId = useCampaignStore((s) => s.selectedCityId);
  const selectedDistrictId = useCampaignStore((s) => s.selectedDistrictId);
  const selectedStructureId = useCampaignStore((s) => s.selectedStructureId);
  const selectedArmyId = useCampaignStore((s) => s.selectedArmyId);
  const placingArmyId = useCampaignStore((s) => s.placingArmyId);
  const terrainPaintFactionId = useCampaignStore(
    (s) => s.terrainPaintFactionId,
  );
  const selectSettlement = useCampaignStore((s) => s.selectSettlement);
  const selectStructure = useCampaignStore((s) => s.selectStructure);
  const selectArmy = useCampaignStore((s) => s.selectArmy);
  const moveArmy = useCampaignStore((s) => s.moveArmy);
  const setPlacingArmy = useCampaignStore((s) => s.setPlacingArmy);
  const setTileClaims = useCampaignStore((s) => s.setTileClaims);

  const planet = campaign.planets.find((p) => p.id === focusedPlanetId);
  const system = planet
    ? campaign.systems.find((s) => s.id === planet.systemId)
    : undefined;
  const faction = planet?.controllingFactionId
    ? campaign.factions.find((f) => f.id === planet.controllingFactionId)
    : undefined;

  if (!planet) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Planet not found.
      </div>
    );
  }

  const accent = faction?.color ?? "#4fd2ff";
  const legend = terrainLegend(planet.classification, planet.type);
  const cities = planet.cities ?? [];
  const structures = planet.structures ?? [];
  const tileClaims = planet.tileClaims ?? {};
  const armies = planet.armies ?? [];
  const districtCount = cities.reduce((n, c) => n + c.districts.length, 0);
  const paintFaction =
    terrainPaintFactionId && terrainPaintFactionId !== TERRAIN_PAINT_ERASE
      ? campaign.factions.find((f) => f.id === terrainPaintFactionId)
      : undefined;

  let hint =
    "Drag to rotate · right-click drag armies · click cities, districts, or structures";
  if (placingArmyId) hint = "Click a hex to place the army";
  else if (terrainPaintFactionId === TERRAIN_PAINT_ERASE)
    hint = "Paint open hexes to clear claims";
  else if (terrainPaintFactionId)
    hint = `Paint open hexes for ${paintFaction?.name ?? "faction"}`;

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden flex flex-col">
      <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-50" />

      <div className="relative z-[1] shrink-0 px-4 pt-3 pb-1 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted">
          High orbit survey
          {system ? ` · ${system.name}` : ""}
        </p>
        <h1
          className="font-display text-xl text-star"
          style={{ color: accent }}
        >
          {planet.name}
        </h1>
        <p className="text-xs text-brass mt-0.5">
          {PLANET_TYPE_LABELS[planet.type]} ·{" "}
          {PLANET_CLASSIFICATION_LABELS[planet.classification] ??
            PLANET_CLASSIFICATION_LABELS.earthlike}
          {faction ? ` · ${faction.name}` : " · Contested surface"}
          {` · ${cities.length} cities · ${districtCount} districts · ${structures.length} structures · ${armies.length} armies`}
        </p>
      </div>

      <div className="relative z-[1] flex-1 min-h-0 px-2">
        <HexPlanet
          planetId={planet.id}
          planetType={planet.type}
          classification={planet.classification}
          accentColor={accent}
          cities={cities}
          structures={structures}
          tileClaims={tileClaims}
          armies={armies}
          symbols={campaign.symbols ?? []}
          factions={campaign.factions}
          selectedCityId={selectedCityId}
          selectedDistrictId={selectedDistrictId}
          selectedStructureId={selectedStructureId}
          selectedArmyId={selectedArmyId}
          placingArmyId={placingArmyId}
          terrainPaintFactionId={terrainPaintFactionId}
          onSelectSettlement={(cityId, districtId) =>
            selectSettlement(cityId, districtId)
          }
          onSelectStructure={(structureId) => selectStructure(structureId)}
          onSelectArmy={(armyId) => selectArmy(armyId)}
          onPlaceArmy={(dir) => {
            if (!placingArmyId) return;
            moveArmy(planet.id, placingArmyId, dir);
            setPlacingArmy(null);
          }}
          onMoveArmy={(armyId, dir) => {
            moveArmy(planet.id, armyId, dir);
          }}
          onClaimTiles={(claims) => {
            setTileClaims(planet.id, claims);
          }}
        />
      </div>

      <div className="relative z-[1] shrink-0 flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pointer-events-none">
        <div className="hud-panel px-3 py-1.5 text-[11px] text-muted">
          {hint}
        </div>
        <div className="hud-panel px-3 py-2 text-[10px] space-y-1 min-w-[9rem]">
          <p className="font-display uppercase tracking-wider text-cyan mb-1">
            Terrain
          </p>
          {legend.map((item) => (
            <div key={item.kind} className="flex items-center gap-2 text-muted">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                style={{
                  background: legendSwatch(item.kind, planet.classification),
                }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
