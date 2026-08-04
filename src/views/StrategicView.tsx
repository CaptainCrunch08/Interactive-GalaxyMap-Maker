import { useEffect, useState } from "react";
import {
  DISTRICT_KIND_LABELS,
  DISTRICT_KIND_ORDER,
  PLANET_CLASSIFICATION_LABELS,
  PLANET_TYPE_LABELS,
  STRUCTURE_KIND_LABELS,
  STRUCTURE_KIND_ORDER,
} from "../types/campaign";
import {
  legendSwatch,
  TERRAIN_KIND_ERASE,
  TERRAIN_KIND_LABELS,
  TERRAIN_KIND_ORDER,
  terrainLegend,
  type TerrainKind,
} from "../lib/planetTerrain";
import {
  HexPlanet,
  TERRAIN_PAINT_ERASE,
} from "../components/strategic/HexPlanet";
import { useCampaignStore } from "../store/useCampaignStore";
import { playMoveBlockReason } from "../lib/play";
import { normalizeCampaignPlay } from "../types/campaign";
import { VICTORY_KIND_LABELS } from "../lib/battleResolve";

export function StrategicView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const selectedPlanetId = useCampaignStore((s) => s.selectedPlanetId);
  const focusedSystemId = useCampaignStore((s) => s.focusedSystemId);
  const selectedCityId = useCampaignStore((s) => s.selectedCityId);
  const selectedDistrictId = useCampaignStore((s) => s.selectedDistrictId);
  const selectedStructureId = useCampaignStore((s) => s.selectedStructureId);
  const selectedArmyId = useCampaignStore((s) => s.selectedArmyId);
  const placingArmyId = useCampaignStore((s) => s.placingArmyId);
  const terrainPaintFactionId = useCampaignStore(
    (s) => s.terrainPaintFactionId,
  );
  const terrainPaintKind = useCampaignStore((s) => s.terrainPaintKind);
  const surfacePlaceMode = useCampaignStore((s) => s.surfacePlaceMode);
  const playBuildMode = useCampaignStore((s) => s.playBuildMode);
  const playMoveHint = useCampaignStore((s) => s.playMoveHint);
  const galaxyEditorOpen = useCampaignStore((s) => s.galaxyEditorOpen);
  const galaxyEditorTab = useCampaignStore((s) => s.galaxyEditorTab);
  const selectSettlement = useCampaignStore((s) => s.selectSettlement);
  const selectStructure = useCampaignStore((s) => s.selectStructure);
  const selectArmy = useCampaignStore((s) => s.selectArmy);
  const moveArmy = useCampaignStore((s) => s.moveArmy);
  const openBattleResolve = useCampaignStore((s) => s.openBattleResolve);
  const setPlacingArmy = useCampaignStore((s) => s.setPlacingArmy);
  const setTileClaims = useCampaignStore((s) => s.setTileClaims);
  const setTileTerrain = useCampaignStore((s) => s.setTileTerrain);
  const clearTileTerrain = useCampaignStore((s) => s.clearTileTerrain);
  const setTerrainPaintKind = useCampaignStore((s) => s.setTerrainPaintKind);
  const setTerrainPaintFaction = useCampaignStore(
    (s) => s.setTerrainPaintFaction,
  );
  const setSurfacePlaceMode = useCampaignStore((s) => s.setSurfacePlaceMode);
  const addCityAtTile = useCampaignStore((s) => s.addCityAtTile);
  const addDistrictAtTile = useCampaignStore((s) => s.addDistrictAtTile);
  const addStructureAtTile = useCampaignStore((s) => s.addStructureAtTile);
  const buildManufactorumAtTile = useCampaignStore(
    (s) => s.buildManufactorumAtTile,
  );
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const setViewLevel = useCampaignStore((s) => s.setViewLevel);
  const [selectedFamousBattleId, setSelectedFamousBattleId] = useState<
    string | null
  >(null);

  const editTerrain =
    galaxyEditorOpen && galaxyEditorTab === "contents";

  const planetId = focusedPlanetId ?? selectedPlanetId;
  const planet = planetId
    ? campaign.planets.find((p) => p.id === planetId)
    : undefined;
  const system = planet
    ? campaign.systems.find((s) => s.id === planet.systemId)
    : undefined;
  const faction = planet?.controllingFactionId
    ? campaign.factions.find((f) => f.id === planet.controllingFactionId)
    : undefined;

  useEffect(() => {
    setSelectedFamousBattleId(null);
  }, [planet?.id]);

  useEffect(() => {
    if (planet) return;
    if (focusedSystemId && campaign.systems.some((s) => s.id === focusedSystemId)) {
      enterSystem(focusedSystemId);
    } else {
      setViewLevel("galaxy");
    }
  }, [
    planet,
    focusedSystemId,
    campaign.systems,
    enterSystem,
    setViewLevel,
  ]);

  if (!planet) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Returning to map…
      </div>
    );
  }

  const accent = faction?.color ?? "#4fd2ff";
  const legend = terrainLegend(planet.classification, planet.type);
  const cities = planet.cities ?? [];
  const structures = planet.structures ?? [];
  const tileClaims = planet.tileClaims ?? {};
  const tileTerrain = planet.tileTerrain ?? {};
  const armies = planet.armies ?? [];
  const famousBattleSites = planet.famousBattleSites ?? [];
  const selectedFamousBattle =
    famousBattleSites.find((s) => s.id === selectedFamousBattleId) ?? null;
  const engageArmyId = (() => {
    if (!normalizeCampaignPlay(campaign.play).active || !selectedArmyId) {
      return null;
    }
    const army = armies.find((a) => a.id === selectedArmyId);
    if (!army) return null;
    if (playMoveBlockReason(campaign, army.factionId, army.id, "army")) {
      return null;
    }
    return army.id;
  })();
  const districtCount = cities.reduce((n, c) => n + c.districts.length, 0);
  const paintFaction =
    terrainPaintFactionId && terrainPaintFactionId !== TERRAIN_PAINT_ERASE
      ? campaign.factions.find((f) => f.id === terrainPaintFactionId)
      : undefined;

  const districtParentId =
    surfacePlaceMode?.kind === "district"
      ? (surfacePlaceMode.cityId ?? selectedCityId)
      : selectedCityId;
  const districtParent = districtParentId
    ? cities.find((c) => c.id === districtParentId)
    : undefined;

  let hint =
    "Drag to rotate · right-click drag armies · click cities, districts, or structures";
  if (playMoveHint) hint = playMoveHint;
  else if (playBuildMode?.kind === "manufactorum")
    hint = "Click a free hex next to the selected city to build a manufactorum";
  else if (placingArmyId) hint = "Click a hex to place the army";
  else if (engageArmyId) {
    hint =
      "Red hexes are valid fights — click a highlighted hex or rival to open the battle report · Detachments move up to 3 hexes per turn";
  } else if (surfacePlaceMode?.kind === "city")
    hint = "Click a free hex to place a city";
  else if (surfacePlaceMode?.kind === "district") {
    hint = districtParent
      ? `Click a free hex to place ${DISTRICT_KIND_LABELS[surfacePlaceMode.districtKind]} for ${districtParent.name}`
      : "Select a parent city, then click a free hex";
  } else if (surfacePlaceMode?.kind === "structure")
    hint = `Click a free hex to place ${STRUCTURE_KIND_LABELS[surfacePlaceMode.structureKind]}`;
  else if (terrainPaintKind === TERRAIN_KIND_ERASE)
    hint = "Paint hexes to restore procedural terrain";
  else if (terrainPaintKind)
    hint = `Paint hexes as ${TERRAIN_KIND_LABELS[terrainPaintKind as TerrainKind] ?? terrainPaintKind}`;
  else if (terrainPaintFactionId === TERRAIN_PAINT_ERASE)
    hint = "Paint open hexes to clear claims";
  else if (terrainPaintFactionId)
    hint = `Paint open hexes for ${paintFaction?.name ?? "faction"}`;

  const placeCityActive = surfacePlaceMode?.kind === "city";
  const placeDistrictKind =
    surfacePlaceMode?.kind === "district"
      ? surfacePlaceMode.districtKind
      : null;
  const placeStructureKind =
    surfacePlaceMode?.kind === "structure"
      ? surfacePlaceMode.structureKind
      : null;

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden flex flex-col">
      <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-50" />

      <div className="relative z-[1] shrink-0 px-4 pt-3 pb-1 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted">
          High orbit survey
          {system ? ` · ${system.name}` : ""}
          {editTerrain ? " · Edit tiles" : ""}
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

      <div className="relative z-[1] flex-1 min-h-0 px-2 pb-2">
        <HexPlanet
          planetId={planet.id}
          planetType={planet.type}
          classification={planet.classification}
          accentColor={accent}
          cities={cities}
          structures={structures}
          tileClaims={tileClaims}
          tileTerrain={tileTerrain}
          armies={armies}
          famousBattleSites={famousBattleSites}
          symbols={campaign.symbols ?? []}
          factions={campaign.factions}
          selectedCityId={selectedCityId}
          selectedDistrictId={selectedDistrictId}
          selectedStructureId={selectedStructureId}
          selectedArmyId={selectedArmyId}
          selectedFamousBattleId={selectedFamousBattleId}
          placingArmyId={placingArmyId}
          engageArmyId={engageArmyId}
          terrainPaintFactionId={terrainPaintFactionId}
          terrainPaintKind={terrainPaintKind}
          surfacePlaceActive={
            surfacePlaceMode != null || playBuildMode != null
          }
          onSelectSettlement={(cityId, districtId) => {
            setSelectedFamousBattleId(null);
            selectSettlement(cityId, districtId);
          }}
          onSelectStructure={(structureId) => {
            setSelectedFamousBattleId(null);
            selectStructure(structureId);
          }}
          onSelectArmy={(armyId) => {
            setSelectedFamousBattleId(null);
            selectArmy(armyId);
          }}
          onSelectFamousBattle={(siteId) => setSelectedFamousBattleId(siteId)}
          onPlaceArmy={(dir) => {
            if (!placingArmyId) return;
            moveArmy(planet.id, placingArmyId, dir);
            setPlacingArmy(null);
          }}
          onMoveArmy={(armyId, dir) => {
            return moveArmy(planet.id, armyId, dir);
          }}
          onEngageArmy={(attackerArmyId, defenderArmyId) => {
            setSelectedFamousBattleId(null);
            openBattleResolve(planet.id, attackerArmyId, defenderArmyId);
          }}
          onClaimTiles={(claims) => {
            setTileClaims(planet.id, claims);
          }}
          onPaintTerrain={(patches) => {
            setTileTerrain(planet.id, patches);
          }}
          onPlaceAtTile={(tileIndex) => {
            if (playBuildMode?.kind === "manufactorum") {
              buildManufactorumAtTile(
                playBuildMode.planetId,
                playBuildMode.cityId,
                tileIndex,
              );
              return;
            }
            if (!surfacePlaceMode) return;
            if (surfacePlaceMode.kind === "city") {
              addCityAtTile(planet.id, tileIndex);
              return;
            }
            if (surfacePlaceMode.kind === "district") {
              const cityId =
                surfacePlaceMode.cityId ?? selectedCityId ?? cities[0]?.id;
              if (!cityId) return;
              addDistrictAtTile(
                planet.id,
                cityId,
                tileIndex,
                surfacePlaceMode.districtKind,
              );
              return;
            }
            addStructureAtTile(
              planet.id,
              tileIndex,
              surfacePlaceMode.structureKind,
            );
          }}
        />
      </div>

      {selectedFamousBattle && (
        <div className="absolute left-1/2 top-[4.5rem] z-[3] w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 pointer-events-auto">
          <div className="hud-panel border border-brass/40 bg-void/95 px-4 py-3 shadow-lg shadow-black/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[10px] uppercase tracking-[0.2em] text-brass">
                  Site of a Famous Battle
                </p>
                <h2 className="font-display mt-1 text-sm uppercase tracking-wider text-cyan">
                  {VICTORY_KIND_LABELS[selectedFamousBattle.tier]}
                </h2>
              </div>
              <button
                type="button"
                className="hud-btn shrink-0 text-[10px]"
                onClick={() => setSelectedFamousBattleId(null)}
                aria-label="Close battle plaque"
              >
                Close
              </button>
            </div>
            <dl className="mt-3 space-y-1.5 text-[11px] text-fog/90">
              <div className="flex justify-between gap-3">
                <dt className="text-brass/80">Date</dt>
                <dd className="text-right text-fog">
                  {selectedFamousBattle.date}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brass/80">Victor</dt>
                <dd className="text-right text-fog">
                  {selectedFamousBattle.victorLabel}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brass/80">Commanders</dt>
                <dd className="text-right text-fog">
                  {selectedFamousBattle.attackerCommander} vs{" "}
                  {selectedFamousBattle.defenderCommander}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brass/80">Forces deployed</dt>
                <dd className="text-right text-fog">
                  STR {selectedFamousBattle.attackerForceStrength} vs{" "}
                  {selectedFamousBattle.defenderForceStrength}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brass/80">Victory points</dt>
                <dd className="text-right text-fog">
                  {selectedFamousBattle.attackerVp} –{" "}
                  {selectedFamousBattle.defenderVp}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-brass/20 pt-2 text-[10px] leading-relaxed text-brass/70">
              A lasting monument to a battle won against the odds on{" "}
              {planet.name}.
            </p>
          </div>
        </div>
      )}

      {/* Right rail: place / paint / legend stacked so they never overlap. */}
      <div className="absolute top-16 bottom-3 right-4 z-[2] flex w-[18rem] flex-col gap-2 pointer-events-none">
        {editTerrain && (
          <div className="hud-panel pointer-events-auto min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[10px] space-y-2">
            <p className="font-display uppercase tracking-wider text-cyan">
              Place on surface
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={`hud-btn ${surfacePlaceMode == null ? "hud-btn-active" : ""}`}
                onClick={() => setSurfacePlaceMode(null)}
              >
                Off
              </button>
              <button
                type="button"
                className={`hud-btn ${placeCityActive ? "hud-btn-active" : ""}`}
                onClick={() => setSurfacePlaceMode({ kind: "city" })}
              >
                City
              </button>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-white/10">
              <p className="uppercase tracking-wider text-muted">District</p>
              {cities.length === 0 ? (
                <p className="text-muted">Place a city first</p>
              ) : (
                <>
                  <label className="flex flex-col gap-0.5 text-muted">
                    Parent city
                    <select
                      className="hud-btn w-full text-left"
                      value={districtParentId ?? ""}
                      onChange={(e) => {
                        const cityId = e.target.value || null;
                        const kind =
                          placeDistrictKind ?? DISTRICT_KIND_ORDER[0];
                        setSurfacePlaceMode({
                          kind: "district",
                          districtKind: kind,
                          cityId,
                        });
                      }}
                    >
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {DISTRICT_KIND_ORDER.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={`hud-btn ${
                          placeDistrictKind === kind ? "hud-btn-active" : ""
                        }`}
                        onClick={() =>
                          setSurfacePlaceMode({
                            kind: "district",
                            districtKind: kind,
                            cityId:
                              districtParentId ??
                              selectedCityId ??
                              cities[0]?.id ??
                              null,
                          })
                        }
                        title={DISTRICT_KIND_LABELS[kind]}
                      >
                        {DISTRICT_KIND_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1.5 pt-1 border-t border-white/10">
              <p className="uppercase tracking-wider text-muted">Structure</p>
              <div className="flex flex-wrap gap-1">
                {STRUCTURE_KIND_ORDER.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`hud-btn ${
                      placeStructureKind === kind ? "hud-btn-active" : ""
                    }`}
                    onClick={() =>
                      setSurfacePlaceMode({
                        kind: "structure",
                        structureKind: kind,
                      })
                    }
                    title={STRUCTURE_KIND_LABELS[kind]}
                  >
                    {STRUCTURE_KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {editTerrain && (
          <div className="hud-panel pointer-events-auto shrink-0 px-3 py-2 text-[10px] space-y-2 max-h-[38%] overflow-y-auto">
            <p className="font-display uppercase tracking-wider text-cyan">
              Paint tile type
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={`hud-btn ${terrainPaintKind == null && surfacePlaceMode == null ? "hud-btn-active" : ""}`}
                onClick={() => {
                  setTerrainPaintKind(null);
                  setSurfacePlaceMode(null);
                }}
              >
                Off
              </button>
              <button
                type="button"
                className={`hud-btn ${terrainPaintKind === TERRAIN_KIND_ERASE ? "hud-btn-active" : ""}`}
                onClick={() => {
                  setTerrainPaintFaction(null);
                  setTerrainPaintKind(TERRAIN_KIND_ERASE);
                }}
              >
                Erase
              </button>
              {Object.keys(tileTerrain).length > 0 && (
                <button
                  type="button"
                  className="hud-btn text-crimson"
                  onClick={() => clearTileTerrain(planet.id)}
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {TERRAIN_KIND_ORDER.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`hud-btn flex items-center gap-1.5 ${
                    terrainPaintKind === kind ? "hud-btn-active" : ""
                  }`}
                  onClick={() => {
                    setTerrainPaintFaction(null);
                    setTerrainPaintKind(kind);
                  }}
                  title={TERRAIN_KIND_LABELS[kind]}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm border border-white/20"
                    style={{
                      background: legendSwatch(kind, planet.classification),
                    }}
                  />
                  {TERRAIN_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="hud-panel pointer-events-auto shrink-0 px-3 py-2 text-[10px] space-y-1 min-w-[9rem] self-end">
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

      <div className="absolute bottom-3 left-4 z-[2] pointer-events-none">
        <div className="hud-panel px-3 py-1.5 text-[11px] text-muted max-w-[min(28rem,calc(100vw-20rem))]">
          {hint}
        </div>
      </div>
    </div>
  );
}
