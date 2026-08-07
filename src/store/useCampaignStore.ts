import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDemoCampaign, createEmptyCampaign } from "../lib/seed";
import {
  generateGalaxyCampaign,
  type GalaxySize,
} from "../lib/generateGalaxy";
import {
  assignAllDistricts,
  assignAllStructures,
  assignAllTileClaims,
  createCityAtTile,
  createDistrictAtTile,
  createStructureAtTile,
  createStructureOnFreeHex,
  ensurePlanetCities,
  featureAtTileIndex,
  generatePlanetSurface,
  planetOwnerFromCities,
  preferredDetachmentSpawnDir,
  reassignDistrictsToCities,
  scrubTileClaims,
  settlementTileSet,
} from "../lib/settlements";
import { normalizeStructureKind } from "../lib/structureMeshes";
import {
  campaignWithHyperlaneAdded,
  campaignWithHyperlaneRemoved,
  campaignWithHyperlanesReset,
  campaignWithSystemHyperlanesPruned,
  campaignWithSystemsHyperlanesPruned,
  campaignWithSystemPlaced,
} from "../lib/hyperlanes";
import {
  getSystemOwnership,
  syncSystemOwnerInSystems,
  deriveSystemOwnerId,
} from "../lib/territory";
import { normalizeStarClass, pickRandomStarClass } from "../lib/stars";
import {
  normalizePlanetClassification,
  pickRandomClassification,
  supportsStrategicSurface,
} from "../lib/planetClass";
import {
  pickPlanetVisualModel,
  resolvePlanetVisualModelId,
} from "../lib/planetModels";
import { prefetchPlanetTextures } from "../lib/planetTexture";
import {
  enforceUniqueSymbolOwnership,
  factionSymbolIds,
  withPrimarySymbol,
  withSymbolAssigned,
  withSymbolUnassigned,
} from "../lib/factionSymbols";
import type {
  Army,
  ArmySymbol,
  BattleEntry,
  Campaign,
  CampaignCharacter,
  City,
  District,
  DistrictKind,
  Faction,
  FamousBattleSite,
  Fleet,
  FleetLocation,
  Planet,
  PlanetClassification,
  PlanetStructure,
  PlanetType,
  Ship,
  ShipChassis,
  SphereDir,
  StarSystem,
  StructureKind,
  TimelineEvent,
  ViewLevel,
} from "../types/campaign";
import {
  campaignMapSize,
  GALAXY_EDGE_PADDING,
  GALAXY_SIZE_LEGACY,
  GALAXY_WIDTH,
  normalizeCampaignPlay,
} from "../types/campaign";
import { createShip, isValidFleetMove, normalizeShipChassis, normalizeShipCargo } from "../lib/fleets";
import {
  applyWarCampHeals,
  mergeArmiesInto,
  playAfterArmyMoved,
} from "../lib/armyActions";
import { scrubCharacterPlacements } from "../lib/characterLocation";
import {
  applyStrengthLoss,
  armiesAreAdjacent,
  armyStrength,
  buildBattleRecord,
  classifyBattleVictory,
  classifyVictory,
  commanderLabel,
  battleMonumentDir,
  eligibleSupportArmies,
  isArmyDestroyed,
  pruneDestroyedArmies,
  stationArmiesAreAdjacent,
  type BattleResolveInput,
  type BattleResolvePending,
} from "../lib/battleResolve";
import { combinedForceStrengthWithFortifications } from "../lib/fortificationBonus";
import { SETTLEMENT_HEX_FREQUENCY } from "../lib/settlements";
import { withHistoryCapture } from "../lib/galaxyHistory";
import {
  applyTurnIncome,
  BASTION_BP_COST,
  canBuildBastion,
  canBuildDomedHabitat,
  canBuildManufactorum,
  canBuildOutpost,
  canBuildSpire,
  canBuildUnderhive,
  canBuildOreMine,
  canBuildTrenchLine,
  canDemolishAtTile,
  canPlaceCityAdjacentDistrictAtTile,
  canPlaceOreMineAtTile,
  canPlaceTrenchLineAtTile,
  canRecruitDetachment,
  canRecruitShip,
  canDeployFromTransport,
  canLoadTransportCargo,
  canUnloadTransportCargo,
  creditBuildingPoints,
  DETACHMENT_BP_COST,
  DOMED_HABITAT_BP_COST,
  getBuildingPoints,
  MANUFACTORUM_BP_COST,
  ORE_MINE_BP_COST,
  OUTPOST_BP_COST,
  ownedCamps,
  shipBpCost,
  spendBuildingPoints,
  spendFleetCargo,
  addFleetCargo,
  fleetCargoBp,
  SPIRE_BP_COST,
  TRENCH_LINE_BP_COST,
  UNDERHIVE_BP_COST,
} from "../lib/buildingPoints";
import {
  canPlaceSpireAtTile,
  canPlaceUnderhiveAtTile,
  districtPlacementWarnings,
} from "../lib/activation";
import {
  ARMY_MOVE_RANGE,
  armyMovementRemaining,
  armyMovementUsed,
  playMoveBlockReason,
  turnLabel,
  withPlay,
} from "../lib/play";
import {
  buildHexSphere,
  hexTileDistance,
  nearestTileIndex,
} from "../lib/hexSphere";
import {
  nearestStationTile,
  stationTileDistance,
} from "../lib/stationHex";
import { buildStationMaze } from "../lib/stationMaze";
import {
  applyWarpGateOwnership,
  fleetAtWarpGate,
  linkedWarpGate,
  linkWarpGates,
  placeArmyOnStationTile,
  randomOtherSystemId,
  RELAY_CROWN_KIND,
  stationDockTiles,
  unlinkWarpGate,
  warpGatePlacementBlockedReason,
  warpTravelBlockedReason,
} from "../lib/warpGates";

function buildPlayCityDistrict(
  get: () => { campaign: Campaign },
  set: (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void,
  args: {
    planetId: string;
    cityId: string;
    tileIndex: number;
    kind: "manufactorum" | "bastion" | "outpost" | "spire" | "underhive" | "domed_habitat";
    cost: number;
    label: string;
    canBuild: typeof canBuildManufactorum;
  },
): string | null {
  const state = get();
  const play = normalizeCampaignPlay(state.campaign.play);
  const factionId = play.activeFactionId;
  if (!factionId) {
    set({ playMoveHint: "No active faction" });
    return null;
  }
  const planet = state.campaign.planets.find((p) => p.id === args.planetId);
  if (!planet) return null;
  const check = args.canBuild(
    state.campaign,
    planet,
    factionId,
    args.cityId,
  );
  if (!check.ok) {
    set({ playMoveHint: check.message });
    return null;
  }
  const placeErr = canPlaceCityAdjacentDistrictAtTile(
    planet,
    check.city,
    args.tileIndex,
    args.label,
  );
  if (placeErr) {
    set({ playMoveHint: placeErr });
    return null;
  }
  if (args.kind === "spire") {
    const err = canPlaceSpireAtTile(planet, args.tileIndex);
    if (err) {
      set({ playMoveHint: err });
      return null;
    }
  }
  if (args.kind === "underhive") {
    const err = canPlaceUnderhiveAtTile(planet, args.tileIndex);
    if (err) {
      set({ playMoveHint: err });
      return null;
    }
  }
  const result = createDistrictAtTile(
    planet,
    args.cityId,
    args.tileIndex,
    args.kind,
    { controllingFactionId: factionId },
  );
  if (!result) {
    set({ playMoveHint: `Could not place ${args.label.toLowerCase()}` });
    return null;
  }
  const newDistrict = result.district;
  const parentCity =
    result.cities.find((c) =>
      c.districts.some((d) => d.id === newDistrict.id),
    ) ?? null;
  set((s) => {
    const planets = s.campaign.planets.map((p: Planet) => {
      if (p.id !== args.planetId) return p;
      const spent = spendBuildingPoints(
        {
          ...p,
          cities: result.cities,
          independentDistricts: result.independentDistricts,
        },
        factionId,
        args.cost,
      );
      const tileClaims = scrubTileClaims(
        spent.tileClaims,
        result.cities,
        spent.structures ?? [],
        result.independentDistricts,
      );
      return {
        ...spent,
        cities: result.cities,
        independentDistricts: result.independentDistricts,
        tileClaims,
        controllingFactionId: planetOwnerFromCities(
          result.cities,
          tileClaims,
          spent.structures ?? [],
          result.independentDistricts,
        ),
      };
    });
    const touched = planets.find((p) => p.id === args.planetId);
    const systems = touched
      ? syncSystemOwnerInSystems(
          s.campaign.systems,
          planets,
          touched.systemId,
        )
      : s.campaign.systems;
    return {
      ...withCampaign(
        s,
        withHistoryCapture({
          ...s.campaign,
          planets,
          systems,
        }),
      ),
      selectedCityId: parentCity?.id ?? null,
      selectedDistrictId: newDistrict.id,
      selectedStructureId: null,
      playBuildMode: null,
      playMoveHint: null,
      inspectorOpen: true,
    };
  });
  return newDistrict.id;
}

function createInitialMaps() {
  const id = crypto.randomUUID();
  const campaign = createDemoCampaign();
  return {
    maps: { [id]: campaign } as Record<string, Campaign>,
    mapOrder: [id],
    activeMapId: id,
    campaign,
  };
}

function clearNavigationState() {
  return {
    viewLevel: "galaxy" as ViewLevel,
    focusedSystemId: null,
    focusedPlanetId: null,
    selectedSystemId: null,
    selectedPlanetId: null,
    selectedCityId: null,
    selectedDistrictId: null,
    selectedStructureId: null,
    selectedArmyId: null,
    placingArmyId: null,
    selectedFleetId: null,
    fleetMoveModeId: null,
    terrainPaintFactionId: null,
    terrainPaintKind: null,
    surfacePlaceMode: null as SurfacePlaceMode,
    playBuildMode: null as PlayBuildMode,
    editMode: false,
  };
}

function withCampaign(
  state: CampaignState,
  campaign: Campaign,
  options?: {
    dirty?: boolean;
    /** When set, consecutive edits with the same key share one undo entry (e.g. star drag). */
    coalesceKey?: string;
    skipUndo?: boolean;
  },
) {
  const base = {
    campaign,
    maps: { ...state.maps, [state.activeMapId]: campaign },
    isDirty: options?.dirty ?? true,
  };

  const trackUndo =
    !options?.skipUndo &&
    state.galaxyEditorOpen &&
    state.galaxyEditorTab === "contents";

  if (!trackUndo) {
    return {
      ...base,
      contentsUndoCoalesceKey: null as string | null,
    };
  }

  const key = options?.coalesceKey ?? null;
  if (key != null && key === state.contentsUndoCoalesceKey) {
    return {
      ...base,
      contentsUndoCoalesceKey: key,
    };
  }

  return {
    ...base,
    contentsUndoStack: [
      ...state.contentsUndoStack.slice(-(MAX_CONTENTS_UNDO - 1)),
      structuredClone(state.campaign) as Campaign,
    ],
    contentsUndoCoalesceKey: key,
  };
}

const MAX_CONTENTS_UNDO = 50;

function ensureCampaignSettlements(campaign: Campaign): Campaign {
  const rivalFor = (planet: Planet) =>
    campaign.factions.find((f) => f.id !== planet.controllingFactionId)?.id;
  return {
    ...campaign,
    symbols: campaign.symbols ?? [],
    fleets: (campaign.fleets ?? []).map((f) => ({
      ...f,
      ships: (f.ships ?? []).map((s) =>
        normalizeShipCargo({
          ...s,
          chassis: normalizeShipChassis(s.chassis),
        }),
      ),
    })),
    characters: campaign.characters ?? [],
    hyperlanes: campaign.hyperlanes,
    hyperlaneEdits: campaign.hyperlaneEdits,
    factions: enforceUniqueSymbolOwnership(campaign.factions),
    timeline: {
      frames: campaign.timeline?.frames ?? [],
      events: campaign.timeline?.events ?? [],
    },
    play: normalizeCampaignPlay(campaign.play),
    systems: campaign.systems.map((s) => ({
      ...s,
      starClass: normalizeStarClass(s.starClass),
    })),
    planets: campaign.planets.map((p) =>
      ensurePlanetCities(
        {
          ...p,
          classification: normalizePlanetClassification(p.classification),
          visualModelId: resolvePlanetVisualModelId(
            p.classification,
            p.visualModelId,
            p.id,
          ),
          cities: p.cities ?? [],
          independentDistricts: p.independentDistricts ?? [],
          structures: (p.structures ?? []).map((st) => ({
            ...st,
            kind: normalizeStructureKind(st.kind),
          })),
          armies: pruneDestroyedArmies(
            (p.armies ?? []).map((a) => ({
              ...a,
              strengthPercent: armyStrength(a),
            })),
          ),
          famousBattleSites: p.famousBattleSites ?? [],
          buildingPoints: p.buildingPoints ?? {},
        },
        {
          defaultFactionId: p.controllingFactionId,
          rivalFactionId: rivalFor(p),
          contestedRate: rivalFor(p) ? 0.3 : 0,
        },
      ),
    ),
  };
}

/** Click-to-place tool for strategic planet editing. */
export type SurfacePlaceMode =
  | null
  | { kind: "city" }
  | { kind: "district"; districtKind: DistrictKind; cityId: string | null }
  | { kind: "structure"; structureKind: StructureKind }
  | { kind: "erase" };

/** Play-mode click-to-build / demolish. */
export type PlayBuildMode =
  | null
  | { kind: "manufactorum"; planetId: string; cityId: string }
  | { kind: "bastion"; planetId: string; cityId: string }
  | { kind: "outpost"; planetId: string; cityId: string }
  | { kind: "spire"; planetId: string; cityId: string }
  | { kind: "underhive"; planetId: string; cityId: string }
  | { kind: "domed_habitat"; planetId: string; cityId: string }
  | { kind: "trench_line"; planetId: string }
  | { kind: "ore_mine"; planetId: string }
  | { kind: "demolish"; planetId: string };

interface CampaignState {
  campaign: Campaign;
  maps: Record<string, Campaign>;
  mapOrder: string[];
  activeMapId: string;
  sideMenuOpen: boolean;
  inspectorOpen: boolean;
  viewLevel: ViewLevel;
  focusedSystemId: string | null;
  focusedPlanetId: string | null;
  selectedSystemId: string | null;
  selectedPlanetId: string | null;
  selectedCityId: string | null;
  selectedDistrictId: string | null;
  selectedStructureId: string | null;
  selectedArmyId: string | null;
  /** When set, next surface click moves this army. */
  placingArmyId: string | null;
  selectedFleetId: string | null;
  /** When set, next valid map click moves this fleet. */
  fleetMoveModeId: string | null;
  /**
   * Open-hex paint brush: faction id, "__erase__" to clear, or null when off.
   */
  terrainPaintFactionId: string | null;
  /**
   * Biome paint brush: TerrainKind, "__erase_terrain__", or null when off.
   */
  terrainPaintKind: string | null;
  /**
   * Click-to-place brush on the strategic map (Edit Galaxy).
   */
  surfacePlaceMode: SurfacePlaceMode;
  /** Play-mode build placement (manufactorum, …). */
  playBuildMode: PlayBuildMode;
  editMode: boolean;
  /** True when the active galaxy has changes since last Save. */
  isDirty: boolean;
  /** Ephemeral hint when a Play-mode unit move is blocked. */
  playMoveHint: string | null;
  /** Pending tabletop battle resolve dialog (Play mode). */
  battleResolve: BattleResolvePending | null;
  /** Full-screen Edit Galaxy overlay. */
  galaxyEditorOpen: boolean;
  galaxyEditorTab: "factions" | "contents" | "events";
  /** Full-screen Galactic Overview overlay. */
  galaxyOverviewOpen: boolean;
  galaxyOverviewTab: "strategic" | "factions" | "planets" | "characters";
  /** Contents editor tool: select/drag stars, draw hyperlanes, place, or mass-delete. */
  galaxyEditorTool: "select" | "connect" | "place" | "mass_delete";
  /** First endpoint when drawing a hyperlane. */
  hyperlaneConnectFromId: string | null;
  /** Snapshots for Ctrl+Z / Undo in Galaxy Contents. */
  contentsUndoStack: Campaign[];
  /** Coalesce key for the open undo gesture (e.g. dragging one star). */
  contentsUndoCoalesceKey: string | null;

  toggleSideMenu: () => void;
  toggleInspector: () => void;
  createMap: (options?: {
    kind: "empty" | "generated";
    size?: GalaxySize;
  }) => void;
  switchMap: (mapId: string) => void;
  deleteMap: (mapId: string) => void;
  /** Download active galaxy JSON and clear dirty flag. */
  saveGalaxy: () => void;
  markSaved: () => void;

  setCampaignName: (name: string) => void;
  importCampaign: (campaign: Campaign) => void;
  resetToDemo: () => void;

  setViewLevel: (level: ViewLevel) => void;
  enterSystem: (systemId: string) => void;
  enterPlanet: (planetId: string) => void;
  enterStrategic: (planetId: string) => void;
  enterTimeline: () => void;
  goBack: () => void;
  setEditMode: (edit: boolean) => void;
  toggleEditMode: () => void;
  openGalaxyEditor: (tab?: "factions" | "contents" | "events") => void;
  closeGalaxyEditor: () => void;
  setGalaxyEditorTab: (tab: "factions" | "contents" | "events") => void;
  openGalaxyOverview: (
    tab?: "strategic" | "factions" | "planets" | "characters",
  ) => void;
  closeGalaxyOverview: () => void;
  setGalaxyOverviewTab: (
    tab: "strategic" | "factions" | "planets" | "characters",
  ) => void;
  setGalaxyEditorTool: (
    tool: "select" | "connect" | "place" | "mass_delete",
  ) => void;
  ensureManualHyperlanes: () => void;
  addHyperlane: (a: string, b: string) => boolean;
  removeHyperlane: (laneId: string) => void;
  resetHyperlanesToAuto: () => void;
  /** Restore the previous Galaxy Contents edit (Ctrl+Z). */
  undoContentsEdit: () => boolean;

  selectSystem: (systemId: string | null) => void;
  selectPlanet: (planetId: string | null) => void;
  selectSettlement: (
    cityId: string | null,
    districtId?: string | null,
  ) => void;
  selectStructure: (structureId: string | null) => void;

  addSystem: (x: number, y: number) => string;
  updateSystem: (id: string, patch: Partial<StarSystem>) => void;
  moveSystem: (id: string, x: number, y: number) => void;
  deleteSystem: (id: string) => void;
  /** Delete many systems in one undoable step (planets, fleets, lanes pruned). */
  deleteSystems: (ids: string[]) => number;
  /** Assign a whole system (and all its planets) to a faction, or clear. */
  setSystemOwner: (systemId: string, factionId: string | null) => void;

  addPlanet: (systemId: string) => string;
  updatePlanet: (id: string, patch: Partial<Planet>) => void;
  /** Bidirectionally pair two warp gates (edit / setup). */
  linkWarpGates: (gateAId: string, gateBId: string) => boolean;
  /** Clear a warp gate's partner link. */
  unlinkWarpGate: (gateId: string) => void;
  deletePlanet: (id: string) => void;
  setPlanetOwner: (planetId: string, factionId: string | null) => void;
  setCityOwner: (
    planetId: string,
    cityId: string,
    factionId: string | null,
  ) => void;
  setDistrictOwner: (
    planetId: string,
    cityId: string | null,
    districtId: string,
    factionId: string | null,
  ) => void;
  setStructureOwner: (
    planetId: string,
    structureId: string,
    factionId: string | null,
  ) => void;
  setTileClaims: (
    planetId: string,
    claims: Record<number, string | null>,
  ) => void;
  clearOpenTileClaims: (planetId: string) => void;
  /** Paint biome overrides (null = restore procedural). */
  setTileTerrain: (
    planetId: string,
    patches: Record<number, string | null>,
  ) => void;
  /** Replace all biome overrides (full-world paint / regenerate). */
  replaceTileTerrain: (
    planetId: string,
    tileTerrain: Record<string, string>,
  ) => void;
  clearTileTerrain: (planetId: string) => void;
  setTerrainPaintFaction: (factionId: string | null) => void;
  /** Biome brush: terrain kind, TERRAIN_KIND_ERASE, or null. */
  setTerrainPaintKind: (kind: string | null) => void;
  setSurfacePlaceMode: (mode: SurfacePlaceMode) => void;
  setPlayBuildMode: (mode: PlayBuildMode) => void;
  /** Spend BP to place a manufactorum adjacent to an owned city. */
  buildManufactorumAtTile: (
    planetId: string,
    cityId: string,
    tileIndex: number,
  ) => string | null;
  buildBastionAtTile: (
    planetId: string,
    cityId: string,
    tileIndex: number,
  ) => string | null;
  buildOutpostAtTile: (
    planetId: string,
    cityId: string,
    tileIndex: number,
  ) => string | null;
  buildSpireAtTile: (
    planetId: string,
    cityId: string,
    tileIndex: number,
  ) => string | null;
  buildUnderhiveAtTile: (
    planetId: string,
    cityId: string,
    tileIndex: number,
  ) => string | null;
  buildDomedHabitatAtTile: (
    planetId: string,
    cityId: string,
    tileIndex: number,
  ) => string | null;
  buildTrenchLineAtTile: (
    planetId: string,
    tileIndex: number,
  ) => string | null;
  buildOreMineAtTile: (
    planetId: string,
    tileIndex: number,
  ) => string | null;
  /** Spend half build-cost BP to remove an owned priced district/structure. */
  demolishSurfaceAtTile: (
    planetId: string,
    tileIndex: number,
  ) => boolean;
  updateCity: (
    planetId: string,
    cityId: string,
    patch: Partial<City>,
  ) => void;
  updateDistrict: (
    planetId: string,
    cityId: string | null,
    districtId: string,
    patch: Partial<District>,
  ) => void;
  addCityAtTile: (planetId: string, tileIndex: number) => string | null;
  addDistrictAtTile: (
    planetId: string,
    cityId: string,
    tileIndex: number,
    districtKind: DistrictKind,
  ) => string | null;
  addStructureAtTile: (
    planetId: string,
    tileIndex: number,
    structureKind: StructureKind,
  ) => string | null;
  /** Remove the city, district, or structure occupying a hex (edit erase tool). */
  removeSurfaceAtTile: (planetId: string, tileIndex: number) => boolean;
  regenerateSettlements: (planetId: string) => void;
  addStructure: (planetId: string, kind: StructureKind) => string | null;
  updateStructure: (
    planetId: string,
    structureId: string,
    patch: Partial<PlanetStructure>,
  ) => void;
  deleteStructure: (planetId: string, structureId: string) => void;

  addSymbol: (name: string, imageDataUrl: string) => string;
  updateSymbol: (id: string, patch: Partial<ArmySymbol>) => void;
  deleteSymbol: (id: string) => void;
  /** Assign a library symbol to a faction (exclusive ownership). */
  assignFactionSymbol: (
    factionId: string,
    symbolId: string,
    asPrimary?: boolean,
  ) => void;
  unassignFactionSymbol: (factionId: string, symbolId: string) => void;
  setFactionPrimarySymbol: (
    factionId: string,
    symbolId: string | undefined,
  ) => void;

  addArmy: (planetId: string, factionId: string) => string;
  updateArmy: (
    planetId: string,
    armyId: string,
    patch: Partial<Army>,
  ) => void;
  deleteArmy: (planetId: string, armyId: string) => void;
  moveArmy: (planetId: string, armyId: string, dir: SphereDir) => boolean;
  /** Open the post-tabletop battle result dialog (Play mode). */
  openBattleResolve: (
    planetId: string,
    attackerArmyId: string,
    defenderArmyId: string,
  ) => void;
  closeBattleResolve: () => void;
  /** Commit VP / casualties / strength losses after a real-life game. */
  resolveBattle: (
    input: Omit<
      BattleResolveInput,
      "planetId" | "attackerArmyId" | "defenderArmyId"
    >,
  ) => boolean;
  selectArmy: (armyId: string | null) => void;
  setPlacingArmy: (armyId: string | null) => void;

  addFleet: (systemId: string, factionId: string) => string;
  updateFleet: (fleetId: string, patch: Partial<Omit<Fleet, "id" | "ships">>) => void;
  deleteFleet: (fleetId: string) => void;
  addShip: (fleetId: string, chassis: ShipChassis) => string;
  updateShip: (
    fleetId: string,
    shipId: string,
    patch: Partial<Ship>,
  ) => void;
  deleteShip: (fleetId: string, shipId: string) => void;
  moveFleet: (fleetId: string, location: FleetLocation) => boolean;
  /** Transit a warp gate the fleet is orbiting (linked or random). */
  travelThroughWarpGate: (fleetId: string) => boolean;
  /** Seize the relay crown with a detachment standing on it. */
  seizeRelayCrown: (planetId: string, armyId: string) => boolean;
  /** Deploy a boarding detachment onto a warp-gate station from orbit. */
  boardWarpGate: (planetId: string) => string | null;
  /** Load planet BP into orbiting transport holds. */
  loadTransportCargo: (fleetId: string, amount?: number) => number;
  /** Unload transport cargo BP onto an orbit world with an owned city. */
  unloadTransportCargo: (fleetId: string, amount?: number) => number;
  /**
   * Spend transport cargo BP to deploy a detachment onto the orbit world
   * (planet or warp gate) — no War Camp / district required.
   */
  deployFromTransport: (fleetId: string) => string | null;
  selectFleet: (fleetId: string | null) => void;
  setFleetMoveMode: (fleetId: string | null) => void;

  captureTimelineFrame: (label?: string) => string;
  clearTimelineFrames: () => void;
  addTimelineEvent: () => string;
  updateTimelineEvent: (
    eventId: string,
    patch: Partial<TimelineEvent>,
  ) => void;
  deleteTimelineEvent: (eventId: string) => void;

  addFaction: () => string;
  updateFaction: (id: string, patch: Partial<Faction>) => void;
  deleteFaction: (id: string) => void;

  addCharacter: (seed?: Partial<CampaignCharacter>) => string;
  updateCharacter: (id: string, patch: Partial<CampaignCharacter>) => void;
  deleteCharacter: (id: string) => void;

  addBattle: (planetId: string) => string;
  updateBattle: (
    planetId: string,
    battleId: string,
    patch: Partial<BattleEntry>,
  ) => void;
  deleteBattle: (planetId: string, battleId: string) => void;

  /** Start hotseat Play mode (returns false if no factions). */
  startPlayCampaign: (order?: string[]) => boolean;
  stopPlayCampaign: () => void;
  endTurn: () => void;
  clearPlayMoveHint: () => void;
  /** Spend planet BP at an owned War Camp to spawn a detachment. */
  recruitDetachment: (planetId: string) => string | null;
  /** Merge source detachment into an adjacent target (costs 1 movement in Play). */
  mergeArmies: (
    planetId: string,
    sourceArmyId: string,
    targetArmyId: string,
  ) => boolean;
  /** Spend planet BP at an owned Space Port to build a ship (new or existing orbit fleet). */
  recruitShip: (planetId: string, chassis: ShipChassis) => string | null;
}

function clampGalaxyCoord(value: number, max: number) {
  return Math.max(
    GALAXY_EDGE_PADDING,
    Math.min(max - GALAXY_EDGE_PADDING, value),
  );
}

function recenterSystemsFromLegacy(campaign: Campaign): Campaign {
  const offset = (GALAXY_WIDTH - GALAXY_SIZE_LEGACY) / 2;
  const allInsideLegacy = campaign.systems.every(
    (s) =>
      s.x >= 0 &&
      s.x <= GALAXY_SIZE_LEGACY &&
      s.y >= 0 &&
      s.y <= GALAXY_SIZE_LEGACY,
  );
  if (!allInsideLegacy || campaign.systems.length === 0) {
    return ensureCampaignSettlements(campaign);
  }
  return ensureCampaignSettlements({
    ...campaign,
    systems: campaign.systems.map((s) => ({
      ...s,
      x: s.x + offset,
      y: s.y + offset,
    })),
  });
}

function migrateMapsToExpandedGalaxy(
  maps: Record<string, Campaign>,
): Record<string, Campaign> {
  const next: Record<string, Campaign> = {};
  for (const [id, campaign] of Object.entries(maps)) {
    next[id] = recenterSystemsFromLegacy(campaign);
  }
  return next;
}

type PersistedMaps = {
  maps?: Record<string, Campaign>;
  mapOrder?: string[];
  activeMapId?: string;
  campaign?: Campaign;
};

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set, get) => ({
      ...createInitialMaps(),
      sideMenuOpen: false,
      inspectorOpen: true,
      viewLevel: "galaxy",
      focusedSystemId: null,
      focusedPlanetId: null,
      selectedSystemId: null,
      selectedPlanetId: null,
      selectedCityId: null,
      selectedDistrictId: null,
      selectedStructureId: null,
      selectedArmyId: null,
      placingArmyId: null,
      selectedFleetId: null,
      fleetMoveModeId: null,
      terrainPaintFactionId: null,
      terrainPaintKind: null,
      surfacePlaceMode: null,
      playBuildMode: null,
      editMode: false,
      isDirty: false,
      playMoveHint: null,
      battleResolve: null,
      galaxyEditorOpen: false,
      galaxyEditorTab: "factions",
      galaxyOverviewOpen: false,
      galaxyOverviewTab: "strategic",
      galaxyEditorTool: "select",
      hyperlaneConnectFromId: null,
      contentsUndoStack: [],
      contentsUndoCoalesceKey: null,

      toggleSideMenu: () => set((s) => ({ sideMenuOpen: !s.sideMenuOpen })),
      toggleInspector: () =>
        set((s) => ({ inspectorOpen: !s.inspectorOpen })),

      createMap: (options) => {
        const id = crypto.randomUUID();
        const name = `Galaxy ${get().mapOrder.length + 1}`;
        const campaign =
          options?.kind === "generated"
            ? generateGalaxyCampaign(options.size ?? "medium", name)
            : { ...createEmptyCampaign(), name };
        set((s) => ({
          maps: { ...withCampaign(s, s.campaign, { dirty: false, skipUndo: true }).maps, [id]: campaign },
          mapOrder: [...s.mapOrder, id],
          activeMapId: id,
          campaign,
          isDirty: false,
          ...clearNavigationState(),
        }));
      },

      switchMap: (mapId) => {
        const state = get();
        if (mapId === state.activeMapId || !state.maps[mapId]) return;
        const maps = withCampaign(state, state.campaign, {
          dirty: false,
          skipUndo: true,
        }).maps;
        set({
          maps,
          activeMapId: mapId,
          campaign: maps[mapId],
          isDirty: false,
          ...clearNavigationState(),
        });
      },

      deleteMap: (mapId) => {
        const state = get();
        if (state.mapOrder.length <= 1 || !state.maps[mapId]) return;
        const maps = {
          ...withCampaign(state, state.campaign, {
            dirty: false,
            skipUndo: true,
          }).maps,
        };
        delete maps[mapId];
        const mapOrder = state.mapOrder.filter((id) => id !== mapId);
        if (state.activeMapId === mapId) {
          const activeMapId = mapOrder[mapOrder.length - 1]!;
          set({
            maps,
            mapOrder,
            activeMapId,
            campaign: maps[activeMapId],
            isDirty: false,
            ...clearNavigationState(),
          });
        } else {
          set({ maps, mapOrder });
        }
      },

      saveGalaxy: () => {
        const campaign = get().campaign;
        void import("../lib/io").then(({ downloadCampaign }) => {
          downloadCampaign(campaign);
          get().markSaved();
        });
      },

      markSaved: () => set({ isDirty: false }),

      setCampaignName: (name) =>
        set((s) => withCampaign(s, { ...s.campaign, name })),

      importCampaign: (campaign) =>
        set((s) => ({
          ...withCampaign(s, ensureCampaignSettlements(campaign), {
            dirty: false,
            skipUndo: true,
          }),
          ...clearNavigationState(),
        })),

      resetToDemo: () =>
        set((s) => ({
          ...withCampaign(s, createDemoCampaign(), {
            dirty: false,
            skipUndo: true,
          }),
          ...clearNavigationState(),
        })),

      setViewLevel: (level) => {
        if (level === "galaxy") {
          set({
            viewLevel: "galaxy",
            focusedSystemId: null,
            focusedPlanetId: null,
            selectedPlanetId: null,
          });
        } else if (level === "system") {
          set({
            viewLevel: "system",
            focusedPlanetId: null,
            selectedPlanetId: null,
          });
        } else if (level === "planet") {
          const planetId = get().focusedPlanetId ?? get().selectedPlanetId;
          const planet = planetId
            ? get().campaign.planets.find((p) => p.id === planetId)
            : undefined;
          if (!planet) {
            const systemId = get().focusedSystemId;
            if (systemId) {
              set({
                viewLevel: "system",
                focusedPlanetId: null,
                selectedPlanetId: null,
              });
            } else {
              set({
                viewLevel: "galaxy",
                focusedSystemId: null,
                focusedPlanetId: null,
                selectedPlanetId: null,
              });
            }
            return;
          }
          set({
            viewLevel: "planet",
            focusedPlanetId: planet.id,
            focusedSystemId: planet.systemId,
            selectedPlanetId: planet.id,
          });
        } else {
          set({ viewLevel: level });
        }
      },

      enterSystem: (systemId) =>
        set({
          viewLevel: "system",
          focusedSystemId: systemId,
          focusedPlanetId: null,
          selectedSystemId: systemId,
          selectedPlanetId: null,
        }),

      enterPlanet: (planetId) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return;
        if (planet.type !== "asteroid_belt") {
          const modelId = resolvePlanetVisualModelId(
            planet.classification,
            planet.visualModelId,
            planet.id,
          );
          prefetchPlanetTextures(planet.classification, modelId);
        }
        if (planet.type === "asteroid_belt") {
          set({
            viewLevel: "planet",
            focusedSystemId: planet.systemId,
            focusedPlanetId: planetId,
            selectedPlanetId: planetId,
            selectedCityId: null,
            selectedDistrictId: null,
          selectedStructureId: null,
            selectedArmyId: null,
            placingArmyId: null,
            terrainPaintFactionId: null,
            terrainPaintKind: null,
            fleetMoveModeId: null,
            inspectorOpen: true,
          });
          return;
        }
        set((s) => {
          const ensured = ensurePlanetCities(planet, {
            defaultFactionId: planet.controllingFactionId,
            rivalFactionId: s.campaign.factions.find(
              (f) => f.id !== planet.controllingFactionId,
            )?.id,
            contestedRate: 0.3,
          });
          const planets = s.campaign.planets.map((p) =>
            p.id === planetId ? ensured : p,
          );
          return {
            ...withCampaign(s, { ...s.campaign, planets }),
            viewLevel: "planet",
            focusedSystemId: ensured.systemId,
            focusedPlanetId: planetId,
            selectedPlanetId: planetId,
            selectedCityId: null,
            selectedDistrictId: null,
          selectedStructureId: null,
            selectedArmyId: null,
            placingArmyId: null,
            terrainPaintFactionId: null,
            inspectorOpen: true,
          };
        });
      },

      enterStrategic: (planetId) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet || !supportsStrategicSurface(planet)) return;
        set((s) => {
          const ensured =
            planet.type === "warp_gate"
              ? ensurePlanetCities(planet)
              : ensurePlanetCities(planet, {
                  defaultFactionId: planet.controllingFactionId,
                  rivalFactionId: s.campaign.factions.find(
                    (f) => f.id !== planet.controllingFactionId,
                  )?.id,
                  contestedRate: 0.3,
                });
          const planets = s.campaign.planets.map((p) =>
            p.id === planetId ? ensured : p,
          );
          return {
            ...withCampaign(s, { ...s.campaign, planets }),
            viewLevel: "strategic",
            focusedSystemId: ensured.systemId,
            focusedPlanetId: planetId,
            selectedPlanetId: planetId,
            inspectorOpen: true,
          };
        });
      },

      enterTimeline: () =>
        set({
          viewLevel: "timeline",
          focusedSystemId: null,
          focusedPlanetId: null,
          selectedSystemId: null,
          selectedPlanetId: null,
          selectedFleetId: null,
          fleetMoveModeId: null,
          inspectorOpen: true,
        }),

      goBack: () => {
        const { viewLevel } = get();
        if (viewLevel === "timeline") {
          set({ viewLevel: "galaxy" });
        } else if (viewLevel === "strategic") {
          set({
            viewLevel: "planet",
            selectedCityId: null,
            selectedDistrictId: null,
          selectedStructureId: null,
            placingArmyId: null,
            terrainPaintFactionId: null,
          });
        } else if (viewLevel === "planet") {
          set({
            viewLevel: "system",
            focusedPlanetId: null,
            selectedPlanetId: null,
            selectedCityId: null,
            selectedDistrictId: null,
          selectedStructureId: null,
            selectedArmyId: null,
            placingArmyId: null,
            terrainPaintFactionId: null,
          });
        } else if (viewLevel === "system") {
          set({
            viewLevel: "galaxy",
            focusedSystemId: null,
            focusedPlanetId: null,
            selectedSystemId: null,
            selectedPlanetId: null,
            selectedCityId: null,
            selectedDistrictId: null,
          selectedStructureId: null,
            selectedArmyId: null,
            placingArmyId: null,
            terrainPaintFactionId: null,
          });
        }
      },

      setEditMode: (editMode) => set({ editMode }),
      toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),

      openGalaxyEditor: (tab = "factions") =>
        set({
          galaxyOverviewOpen: false,
          galaxyEditorOpen: true,
          galaxyEditorTab: tab,
          editMode: tab === "contents",
          galaxyEditorTool: "select",
          hyperlaneConnectFromId: null,
          contentsUndoStack: [],
          contentsUndoCoalesceKey: null,
          surfacePlaceMode: null,
          terrainPaintKind: null,
          viewLevel: "galaxy",
          focusedSystemId: null,
          focusedPlanetId: null,
        }),

      closeGalaxyEditor: () =>
        set({
          galaxyEditorOpen: false,
          editMode: false,
          galaxyEditorTool: "select",
          hyperlaneConnectFromId: null,
          contentsUndoStack: [],
          contentsUndoCoalesceKey: null,
          terrainPaintKind: null,
          surfacePlaceMode: null,
          viewLevel: "galaxy",
          focusedSystemId: null,
          focusedPlanetId: null,
        }),

      setGalaxyEditorTab: (tab) =>
        set({
          galaxyEditorTab: tab,
          editMode: tab === "contents",
          galaxyEditorTool: "select",
          hyperlaneConnectFromId: null,
          surfacePlaceMode: null,
          terrainPaintKind: null,
        }),

      openGalaxyOverview: (tab = "strategic") =>
        set({
          galaxyEditorOpen: false,
          editMode: false,
          galaxyOverviewOpen: true,
          galaxyOverviewTab: tab,
          viewLevel: "galaxy",
          focusedSystemId: null,
          focusedPlanetId: null,
        }),

      closeGalaxyOverview: () =>
        set({
          galaxyOverviewOpen: false,
        }),

      setGalaxyOverviewTab: (tab) =>
        set({
          galaxyOverviewTab: tab,
        }),

      setGalaxyEditorTool: (tool) =>
        set({
          galaxyEditorTool: tool,
          hyperlaneConnectFromId: null,
          contentsUndoCoalesceKey: null,
        }),

      ensureManualHyperlanes: () => {
        // No-op: lanes are sticky when baked; place/connect bake as needed.
      },

      addHyperlane: (a, b) => {
        const state = get();
        const next = campaignWithHyperlaneAdded(state.campaign, a, b);
        if (!next) return false;
        set((s) => withCampaign(s, next));
        return true;
      },

      removeHyperlane: (laneId) => {
        set((s) =>
          withCampaign(s, campaignWithHyperlaneRemoved(s.campaign, laneId)),
        );
      },

      resetHyperlanesToAuto: () =>
        set((s) => ({
          ...withCampaign(s, campaignWithHyperlanesReset(s.campaign)),
          hyperlaneConnectFromId: null,
        })),

      undoContentsEdit: () => {
        const state = get();
        if (state.contentsUndoStack.length === 0) return false;
        const stack = [...state.contentsUndoStack];
        const previous = stack.pop()!;
        set({
          ...withCampaign(state, previous, { skipUndo: true }),
          contentsUndoStack: stack,
          contentsUndoCoalesceKey: null,
          hyperlaneConnectFromId: null,
        });
        return true;
      },

      selectSystem: (systemId) =>
        set({
          selectedSystemId: systemId,
          selectedPlanetId: null,
          selectedCityId: null,
          selectedDistrictId: null,
          selectedStructureId: null,
        }),

      selectPlanet: (planetId) => set({ selectedPlanetId: planetId }),

      selectSettlement: (cityId, districtId = null) =>
        set({
          selectedCityId: cityId,
          selectedDistrictId: districtId ?? null,
          selectedStructureId: null,
          selectedArmyId: null,
          inspectorOpen: true,
        }),

      selectStructure: (structureId) =>
        set({
          selectedStructureId: structureId,
          selectedCityId: null,
          selectedDistrictId: null,
          selectedArmyId: null,
          inspectorOpen: true,
        }),

      addSystem: (x, y) => {
        const id = crypto.randomUUID();
        const count = get().campaign.systems.length;
        const size = campaignMapSize(get().campaign);
        const system: StarSystem = {
          id,
          name: `System ${count + 1}`,
          x: clampGalaxyCoord(x, size),
          y: clampGalaxyCoord(y, size),
          notes: "",
          starClass: pickRandomStarClass(),
        };
        set((s) => ({
          ...withCampaign(s, campaignWithSystemPlaced(s.campaign, system)),
          selectedSystemId: id,
        }));
        return id;
      },

      updateSystem: (id, patch) => {
        const state = get();
        if (patch.dysonSphere === false) {
          const hasGate = state.campaign.planets.some(
            (p) => p.systemId === id && p.type === "warp_gate",
          );
          if (hasGate) {
            set({
              playMoveHint:
                "Cannot remove the power megastructure while a warp gate remains in this system",
            });
            return;
          }
        }
        set((s) =>
          withCampaign(
            s,
            {
              ...s.campaign,
              systems: s.campaign.systems.map((sys) =>
                sys.id === id ? { ...sys, ...patch } : sys,
              ),
            },
            { coalesceKey: `sys:${id}` },
          ),
        );
      },

      moveSystem: (id, x, y) => {
        const size = campaignMapSize(get().campaign);
        const nx = clampGalaxyCoord(x, size);
        const ny = clampGalaxyCoord(y, size);
        set((s) =>
          withCampaign(
            s,
            {
              ...s.campaign,
              systems: s.campaign.systems.map((sys) =>
                sys.id === id ? { ...sys, x: nx, y: ny } : sys,
              ),
            },
            { coalesceKey: `move:${id}` },
          ),
        );
      },

      deleteSystem: (id) =>
        set((s) => {
          const pruned = campaignWithSystemHyperlanesPruned(s.campaign, id);
          const nextCampaign = {
            ...pruned,
            systems: pruned.systems.filter((sys) => sys.id !== id),
            planets: pruned.planets.filter((p) => p.systemId !== id),
            fleets: (pruned.fleets ?? []).filter(
              (f) => f.location.systemId !== id,
            ),
          };
          return {
            ...withCampaign(s, {
              ...nextCampaign,
              characters: scrubCharacterPlacements(
                s.campaign.characters ?? [],
                nextCampaign,
              ),
            }),
            focusedSystemId:
              s.focusedSystemId === id ? null : s.focusedSystemId,
            selectedSystemId:
              s.selectedSystemId === id ? null : s.selectedSystemId,
            selectedFleetId: (() => {
              const fleet = (s.campaign.fleets ?? []).find(
                (f) => f.id === s.selectedFleetId,
              );
              return fleet && fleet.location.systemId === id
                ? null
                : s.selectedFleetId;
            })(),
            fleetMoveModeId: (() => {
              const fleet = (s.campaign.fleets ?? []).find(
                (f) => f.id === s.fleetMoveModeId,
              );
              return fleet && fleet.location.systemId === id
                ? null
                : s.fleetMoveModeId;
            })(),
            hyperlaneConnectFromId:
              s.hyperlaneConnectFromId === id ? null : s.hyperlaneConnectFromId,
            viewLevel:
              s.focusedSystemId === id && s.viewLevel !== "galaxy"
                ? "galaxy"
                : s.viewLevel,
          };
        }),

      deleteSystems: (ids) => {
        const idSet = new Set(ids.filter((id) => typeof id === "string" && id));
        if (idSet.size === 0) return 0;
        set((s) => {
          const pruned = campaignWithSystemsHyperlanesPruned(
            s.campaign,
            idSet,
          );
          const nextCampaign = {
            ...pruned,
            systems: pruned.systems.filter((sys) => !idSet.has(sys.id)),
            planets: pruned.planets.filter((p) => !idSet.has(p.systemId)),
            fleets: (pruned.fleets ?? []).filter(
              (f) => !idSet.has(f.location.systemId),
            ),
          };
          const focusedGone =
            s.focusedSystemId != null && idSet.has(s.focusedSystemId);
          const selectedFleet = (s.campaign.fleets ?? []).find(
            (f) => f.id === s.selectedFleetId,
          );
          const movingFleet = (s.campaign.fleets ?? []).find(
            (f) => f.id === s.fleetMoveModeId,
          );
          return {
            ...withCampaign(s, {
              ...nextCampaign,
              characters: scrubCharacterPlacements(
                s.campaign.characters ?? [],
                nextCampaign,
              ),
            }),
            focusedSystemId: focusedGone ? null : s.focusedSystemId,
            selectedSystemId:
              s.selectedSystemId != null && idSet.has(s.selectedSystemId)
                ? null
                : s.selectedSystemId,
            selectedPlanetId:
              s.selectedPlanetId != null &&
              nextCampaign.planets.some((p) => p.id === s.selectedPlanetId)
                ? s.selectedPlanetId
                : null,
            selectedFleetId:
              selectedFleet && idSet.has(selectedFleet.location.systemId)
                ? null
                : s.selectedFleetId,
            fleetMoveModeId:
              movingFleet && idSet.has(movingFleet.location.systemId)
                ? null
                : s.fleetMoveModeId,
            hyperlaneConnectFromId:
              s.hyperlaneConnectFromId != null &&
              idSet.has(s.hyperlaneConnectFromId)
                ? null
                : s.hyperlaneConnectFromId,
            viewLevel:
              focusedGone && s.viewLevel !== "galaxy" ? "galaxy" : s.viewLevel,
          };
        });
        return idSet.size;
      },

      setSystemOwner: (systemId, factionId) =>
        set((s) => {
          const owner = factionId || undefined;
          const planets = s.campaign.planets.map((p) => {
            if (p.systemId !== systemId) return p;
            const assigned = assignAllDistricts(
              p.cities ?? [],
              owner ?? null,
              p.independentDistricts ?? [],
            );
            const structures = assignAllStructures(
              p.structures ?? [],
              owner ?? null,
            );
            const tileClaims = assignAllTileClaims(
              p.tileClaims,
              owner ?? null,
            );
            return {
              ...p,
              controllingFactionId: owner,
              cities: assigned.cities,
              independentDistricts: assigned.independentDistricts,
              structures,
              tileClaims,
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              systems: s.campaign.systems.map((sys) =>
                sys.id === systemId
                  ? { ...sys, controllingFactionId: owner }
                  : sys,
              ),
              planets,
            }),
          );
        }),

      addPlanet: (systemId) => {
        const id = crypto.randomUUID();
        const existing = get().campaign.planets.filter(
          (p) => p.systemId === systemId,
        );
        const system = get().campaign.systems.find((s) => s.id === systemId);
        const classification =
          pickRandomClassification() as PlanetClassification;
        const { cities, structures, independentDistricts } =
          generatePlanetSurface(id, "custom", {
            defaultFactionId: system?.controllingFactionId,
            classification,
          });
        const planet: Planet = {
          id,
          systemId,
          name: `Planet ${existing.length + 1}`,
          orbitIndex: existing.length,
          type: "custom" as PlanetType,
          classification,
          visualModelId: pickPlanetVisualModel(classification),
          controllingFactionId:
            planetOwnerFromCities(
              cities,
              undefined,
              structures,
              independentDistricts,
            ) ?? system?.controllingFactionId,
          notes: "",
          battles: [],
          cities,
          independentDistricts,
          structures,
          armies: [],
        };
        set((s) => ({
          ...withCampaign(s, {
            ...s.campaign,
            planets: [...s.campaign.planets, planet],
          }),
          selectedPlanetId: id,
        }));
        return id;
      },

      updatePlanet: (id, patch) =>
        set((s) => {
          const current = s.campaign.planets.find((p) => p.id === id);
          if (
            current &&
            patch.type === "warp_gate" &&
            current.type !== "warp_gate"
          ) {
            const blocked = warpGatePlacementBlockedReason(
              s.campaign,
              current.systemId,
              id,
            );
            if (blocked) {
              return { ...s, playMoveHint: blocked };
            }
          }
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== id) return p;
            const next = { ...p, ...patch };
            if (
              patch.classification &&
              patch.classification !== p.classification &&
              patch.visualModelId === undefined
            ) {
              next.visualModelId = pickPlanetVisualModel(next.classification);
            }
            // Gas giants cannot have surface settlements.
            if (
              normalizePlanetClassification(next.classification) ===
                "gas_giant" &&
              normalizePlanetClassification(p.classification) !== "gas_giant"
            ) {
              next.cities = [];
              next.independentDistricts = [];
              next.structures = [];
              next.tileClaims = scrubTileClaims(
                next.tileClaims,
                [],
                [],
                [],
              );
            }
            return next;
          });
          const planet = planets.find((p) => p.id === id);
          let systems = s.campaign.systems;
          if (planet && "controllingFactionId" in patch) {
            systems = syncSystemOwnerInSystems(
              s.campaign.systems,
              planets,
              planet.systemId,
            );
          }
          // Warp gates require a Dyson Sphere megastructure in their system.
          if (planet && patch.type === "warp_gate") {
            systems = systems.map((sys) =>
              sys.id === planet.systemId ? { ...sys, dysonSphere: true } : sys,
            );
          }
          const nextPlanets =
            planet && patch.type === "warp_gate"
              ? planets.map((p) =>
                  p.id === id ? ensurePlanetCities(p) : p,
                )
              : planet &&
                  patch.type &&
                  patch.type !== "warp_gate" &&
                  current?.type === "warp_gate"
                ? unlinkWarpGate(planets, id)
                : planets;
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets: nextPlanets,
              systems,
            }),
            { coalesceKey: `planet:${id}` },
          );
        }),

      linkWarpGates: (gateAId, gateBId) => {
        const state = get();
        const next = linkWarpGates(state.campaign.planets, gateAId, gateBId);
        if (!next) {
          set({
            playMoveHint: "Select two different warp gates to link",
          });
          return false;
        }
        const a = next.find((p) => p.id === gateAId);
        const b = next.find((p) => p.id === gateBId);
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets: next }),
          ),
          playMoveHint: a && b ? `Linked ${a.name} ↔ ${b.name}` : null,
        }));
        return true;
      },

      unlinkWarpGate: (gateId) => {
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets: unlinkWarpGate(s.campaign.planets, gateId),
            }),
          ),
          playMoveHint: "Warp gate link cleared",
        }));
      },

      setPlanetOwner: (planetId, factionId) => {
        const owner = factionId || undefined;
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return;
        const assigned = assignAllDistricts(
          planet.cities ?? [],
          factionId,
          planet.independentDistricts ?? [],
        );
        get().updatePlanet(planetId, {
          controllingFactionId: owner,
          cities: assigned.cities,
          independentDistricts: assigned.independentDistricts,
          structures: assignAllStructures(planet.structures ?? [], factionId),
          tileClaims: assignAllTileClaims(planet.tileClaims, factionId),
        });
      },

      setCityOwner: (planetId, cityId, factionId) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const cities = p.cities.map((c) =>
              c.id === cityId
                ? {
                    ...c,
                    controllingFactionId: factionId || undefined,
                  }
                : c,
            );
            return {
              ...p,
              cities,
              controllingFactionId: planetOwnerFromCities(
                cities,
                p.tileClaims,
                p.structures ?? [],
                p.independentDistricts ?? [],
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets,
              systems: syncSystemOwnerInSystems(
                s.campaign.systems,
                planets,
                planet.systemId,
              ),
            }),
          );
        }),

      setDistrictOwner: (planetId, _cityId, districtId, factionId) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const owner = factionId || undefined;
            const cities = p.cities.map((c) => ({
              ...c,
              districts: c.districts.map((d) =>
                d.id === districtId
                  ? { ...d, controllingFactionId: owner }
                  : d,
              ),
            }));
            const independentDistricts = (p.independentDistricts ?? []).map(
              (d) =>
                d.id === districtId
                  ? { ...d, controllingFactionId: owner }
                  : d,
            );
            return {
              ...p,
              cities,
              independentDistricts,
              controllingFactionId: planetOwnerFromCities(
                cities,
                p.tileClaims,
                p.structures ?? [],
                independentDistricts,
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets,
              systems: syncSystemOwnerInSystems(
                s.campaign.systems,
                planets,
                planet.systemId,
              ),
            }),
          );
        }),

      setStructureOwner: (planetId, structureId, factionId) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const structures = (p.structures ?? []).map((st) =>
              st.id === structureId
                ? {
                    ...st,
                    controllingFactionId: factionId || undefined,
                  }
                : st,
            );
            return {
              ...p,
              structures,
              controllingFactionId: planetOwnerFromCities(
                p.cities ?? [],
                p.tileClaims,
                structures,
                p.independentDistricts ?? [],
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets,
              systems: syncSystemOwnerInSystems(
                s.campaign.systems,
                planets,
                planet.systemId,
              ),
            }),
          );
        }),

      setTileClaims: (planetId, claims) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            let cities = p.cities ?? [];
            let independentDistricts = p.independentDistricts ?? [];
            let structures = p.structures ?? [];
            const nextClaims = { ...(p.tileClaims ?? {}) };

            for (const [key, factionId] of Object.entries(claims)) {
              const tileIndex = Number(key);
              if (Number.isNaN(tileIndex)) continue;
              const owner = factionId || undefined;
              const feature = featureAtTileIndex(
                tileIndex,
                cities,
                structures,
                independentDistricts,
              );
              if (feature?.kind === "city") {
                cities = cities.map((c) =>
                  c.id === feature.cityId
                    ? { ...c, controllingFactionId: owner }
                    : c,
                );
                continue;
              }
              if (feature?.kind === "district") {
                if (feature.cityId) {
                  cities = cities.map((c) =>
                    c.id === feature.cityId
                      ? {
                          ...c,
                          districts: c.districts.map((d) =>
                            d.id === feature.districtId
                              ? { ...d, controllingFactionId: owner }
                              : d,
                          ),
                        }
                      : c,
                  );
                } else {
                  independentDistricts = independentDistricts.map((d) =>
                    d.id === feature.districtId
                      ? { ...d, controllingFactionId: owner }
                      : d,
                  );
                }
                continue;
              }
              if (feature?.kind === "structure") {
                structures = structures.map((st) =>
                  st.id === feature.structureId
                    ? { ...st, controllingFactionId: owner }
                    : st,
                );
                continue;
              }
              // Empty hex — open territory paint only.
              if (factionId) nextClaims[String(tileIndex)] = factionId;
              else delete nextClaims[String(tileIndex)];
            }

            const tileClaims = scrubTileClaims(
              nextClaims,
              cities,
              structures,
              independentDistricts,
            );
            return {
              ...p,
              cities,
              independentDistricts,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                cities,
                tileClaims,
                structures,
                independentDistricts,
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets,
              systems: syncSystemOwnerInSystems(
                s.campaign.systems,
                planets,
                planet.systemId,
              ),
            }),
          );
        }),

      clearOpenTileClaims: (planetId) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            return {
              ...p,
              tileClaims: {},
              controllingFactionId: planetOwnerFromCities(
                p.cities ?? [],
                {},
                p.structures ?? [],
                p.independentDistricts ?? [],
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets,
              systems: syncSystemOwnerInSystems(
                s.campaign.systems,
                planets,
                planet.systemId,
              ),
            }),
          );
        }),

      setTileTerrain: (planetId, patches) =>
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const next = { ...(p.tileTerrain ?? {}) };
            for (const [key, kind] of Object.entries(patches)) {
              const tileIndex = Number(key);
              if (Number.isNaN(tileIndex)) continue;
              if (kind) next[String(tileIndex)] = kind;
              else delete next[String(tileIndex)];
            }
            return { ...p, tileTerrain: next };
          });
          return withCampaign(s, { ...s.campaign, planets });
        }),

      replaceTileTerrain: (planetId, tileTerrain) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId ? { ...p, tileTerrain: { ...tileTerrain } } : p,
            ),
          }),
        ),

      clearTileTerrain: (planetId) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId ? { ...p, tileTerrain: {} } : p,
            ),
          }),
        ),

      setTerrainPaintFaction: (factionId) =>
        set((s) => ({
          terrainPaintFactionId: factionId,
          terrainPaintKind: factionId != null ? null : s.terrainPaintKind,
          surfacePlaceMode: factionId != null ? null : s.surfacePlaceMode,
          placingArmyId: factionId != null ? null : s.placingArmyId,
        })),

      setTerrainPaintKind: (kind) =>
        set((s) => ({
          terrainPaintKind: kind,
          terrainPaintFactionId: kind != null ? null : s.terrainPaintFactionId,
          surfacePlaceMode: kind != null ? null : s.surfacePlaceMode,
          placingArmyId: kind != null ? null : s.placingArmyId,
        })),

      setSurfacePlaceMode: (mode) =>
        set((s) => ({
          surfacePlaceMode: mode,
          playBuildMode: mode != null ? null : s.playBuildMode,
          terrainPaintKind: mode != null ? null : s.terrainPaintKind,
          terrainPaintFactionId: mode != null ? null : s.terrainPaintFactionId,
          placingArmyId: mode != null ? null : s.placingArmyId,
        })),

      setPlayBuildMode: (mode) =>
        set((s) => ({
          playBuildMode: mode,
          surfacePlaceMode: mode != null ? null : s.surfacePlaceMode,
          terrainPaintKind: mode != null ? null : s.terrainPaintKind,
          terrainPaintFactionId: mode != null ? null : s.terrainPaintFactionId,
          placingArmyId: mode != null ? null : s.placingArmyId,
        })),

      buildManufactorumAtTile: (planetId, cityId, tileIndex) =>
        buildPlayCityDistrict(get, set, {
          planetId,
          cityId,
          tileIndex,
          kind: "manufactorum",
          cost: MANUFACTORUM_BP_COST,
          label: "Manufactorum",
          canBuild: canBuildManufactorum,
        }),

      buildBastionAtTile: (planetId, cityId, tileIndex) =>
        buildPlayCityDistrict(get, set, {
          planetId,
          cityId,
          tileIndex,
          kind: "bastion",
          cost: BASTION_BP_COST,
          label: "Bastion",
          canBuild: canBuildBastion,
        }),

      buildOutpostAtTile: (planetId, cityId, tileIndex) =>
        buildPlayCityDistrict(get, set, {
          planetId,
          cityId,
          tileIndex,
          kind: "outpost",
          cost: OUTPOST_BP_COST,
          label: "Outpost",
          canBuild: canBuildOutpost,
        }),

      buildSpireAtTile: (planetId, cityId, tileIndex) =>
        buildPlayCityDistrict(get, set, {
          planetId,
          cityId,
          tileIndex,
          kind: "spire",
          cost: SPIRE_BP_COST,
          label: "Hive Spire",
          canBuild: canBuildSpire,
        }),

      buildUnderhiveAtTile: (planetId, cityId, tileIndex) =>
        buildPlayCityDistrict(get, set, {
          planetId,
          cityId,
          tileIndex,
          kind: "underhive",
          cost: UNDERHIVE_BP_COST,
          label: "Underhive",
          canBuild: canBuildUnderhive,
        }),

      buildDomedHabitatAtTile: (planetId, cityId, tileIndex) =>
        buildPlayCityDistrict(get, set, {
          planetId,
          cityId,
          tileIndex,
          kind: "domed_habitat",
          cost: DOMED_HABITAT_BP_COST,
          label: "Domed Habitat",
          canBuild: canBuildDomedHabitat,
        }),

      buildTrenchLineAtTile: (planetId, tileIndex) => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        const factionId = play.activeFactionId;
        if (!factionId) {
          set({ playMoveHint: "No active faction" });
          return null;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const check = canBuildTrenchLine(state.campaign, planet, factionId);
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return null;
        }
        const placeErr = canPlaceTrenchLineAtTile(planet, tileIndex);
        if (placeErr) {
          set({ playMoveHint: placeErr });
          return null;
        }
        const structure = createStructureAtTile(
          planet,
          tileIndex,
          "trench_line",
          { controllingFactionId: factionId },
        );
        if (!structure) {
          set({ playMoveHint: "Could not place trench line" });
          return null;
        }
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const structures = [...(p.structures ?? []), structure];
            const spent = spendBuildingPoints(
              { ...p, structures },
              factionId,
              TRENCH_LINE_BP_COST,
            );
            const tileClaims = scrubTileClaims(
              spent.tileClaims,
              spent.cities ?? [],
              structures,
              spent.independentDistricts ?? [],
            );
            return {
              ...spent,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                spent.cities ?? [],
                tileClaims,
                structures,
                spent.independentDistricts ?? [],
              ),
            };
          });
          const touched = planets.find((p) => p.id === planetId);
          return {
            ...withCampaign(
              s,
              withHistoryCapture({
                ...s.campaign,
                planets,
                systems: touched
                  ? syncSystemOwnerInSystems(
                      s.campaign.systems,
                      planets,
                      touched.systemId,
                    )
                  : s.campaign.systems,
              }),
            ),
            selectedStructureId: structure.id,
            selectedCityId: null,
            selectedDistrictId: null,
            playBuildMode: null,
            playMoveHint: null,
            inspectorOpen: true,
          };
        });
        return structure.id;
      },

      buildOreMineAtTile: (planetId, tileIndex) => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        const factionId = play.activeFactionId;
        if (!factionId) {
          set({ playMoveHint: "No active faction" });
          return null;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const check = canBuildOreMine(state.campaign, planet, factionId);
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return null;
        }
        const placeErr = canPlaceOreMineAtTile(planet, tileIndex);
        if (placeErr) {
          set({ playMoveHint: placeErr });
          return null;
        }
        const structure = createStructureAtTile(
          planet,
          tileIndex,
          "ore_mine",
          { controllingFactionId: factionId },
        );
        if (!structure) {
          set({ playMoveHint: "Could not place ore mine" });
          return null;
        }
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const structures = [...(p.structures ?? []), structure];
            const spent = spendBuildingPoints(
              { ...p, structures },
              factionId,
              ORE_MINE_BP_COST,
            );
            const tileClaims = scrubTileClaims(
              spent.tileClaims,
              spent.cities ?? [],
              structures,
              spent.independentDistricts ?? [],
            );
            return {
              ...spent,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                spent.cities ?? [],
                tileClaims,
                structures,
                spent.independentDistricts ?? [],
              ),
            };
          });
          const touched = planets.find((p) => p.id === planetId);
          return {
            ...withCampaign(
              s,
              withHistoryCapture({
                ...s.campaign,
                planets,
                systems: touched
                  ? syncSystemOwnerInSystems(
                      s.campaign.systems,
                      planets,
                      touched.systemId,
                    )
                  : s.campaign.systems,
              }),
            ),
            selectedStructureId: structure.id,
            selectedCityId: null,
            selectedDistrictId: null,
            playBuildMode: null,
            playMoveHint: null,
            inspectorOpen: true,
          };
        });
        return structure.id;
      },

      demolishSurfaceAtTile: (planetId, tileIndex) => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        const factionId = play.activeFactionId;
        if (!factionId) {
          set({ playMoveHint: "No active faction" });
          return false;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet) return false;
        const check = canDemolishAtTile(
          state.campaign,
          planet,
          factionId,
          tileIndex,
        );
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return false;
        }
        const { target } = check;
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            let cities = p.cities ?? [];
            let independentDistricts = p.independentDistricts ?? [];
            let structures = p.structures ?? [];
            if (target.kind === "district") {
              if (target.cityId) {
                cities = cities.map((c) =>
                  c.id === target.cityId
                    ? {
                        ...c,
                        districts: c.districts.filter(
                          (d) => d.id !== target.district.id,
                        ),
                      }
                    : c,
                );
              } else {
                independentDistricts = independentDistricts.filter(
                  (d) => d.id !== target.district.id,
                );
              }
            } else {
              structures = structures.filter(
                (st) => st.id !== target.structure.id,
              );
            }
            const spent = spendBuildingPoints(
              { ...p, cities, independentDistricts, structures },
              factionId,
              target.cost,
            );
            const tileClaims = scrubTileClaims(
              spent.tileClaims,
              cities,
              structures,
              independentDistricts,
            );
            return {
              ...spent,
              cities,
              independentDistricts,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                cities,
                tileClaims,
                structures,
                independentDistricts,
              ),
            };
          });
          const touched = planets.find((p) => p.id === planetId);
          return {
            ...withCampaign(
              s,
              withHistoryCapture({
                ...s.campaign,
                planets,
                systems: touched
                  ? syncSystemOwnerInSystems(
                      s.campaign.systems,
                      planets,
                      touched.systemId,
                    )
                  : s.campaign.systems,
              }),
            ),
            selectedDistrictId:
              target.kind === "district" &&
              s.selectedDistrictId === target.district.id
                ? null
                : s.selectedDistrictId,
            selectedStructureId:
              target.kind === "structure" &&
              s.selectedStructureId === target.structure.id
                ? null
                : s.selectedStructureId,
            playBuildMode: null,
            playMoveHint: `Demolished for ${target.cost} BP`,
          };
        });
        return true;
      },

      addCityAtTile: (planetId, tileIndex) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const city = createCityAtTile(planet, tileIndex);
        if (!city) return null;
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const assigned = reassignDistrictsToCities(
              [...(p.cities ?? []), city],
              p.independentDistricts ?? [],
            );
            const tileClaims = scrubTileClaims(
              p.tileClaims,
              assigned.cities,
              p.structures ?? [],
              assigned.independentDistricts,
            );
            return {
              ...p,
              cities: assigned.cities,
              independentDistricts: assigned.independentDistricts,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                assigned.cities,
                tileClaims,
                p.structures ?? [],
                assigned.independentDistricts,
              ),
            };
          });
          const touched = planets.find((p) => p.id === planetId);
          return {
            ...withCampaign(s, {
              ...s.campaign,
              planets,
              systems: touched
                ? syncSystemOwnerInSystems(
                    s.campaign.systems,
                    planets,
                    touched.systemId,
                  )
                : s.campaign.systems,
            }),
            selectedCityId: city.id,
            selectedDistrictId: null,
            selectedStructureId: null,
          };
        });
        return city.id;
      },

      addDistrictAtTile: (planetId, cityId, tileIndex, districtKind) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const play = normalizeCampaignPlay(get().campaign.play);
        if (play.active) {
          if (districtKind === "spire") {
            const err = canPlaceSpireAtTile(planet, tileIndex);
            if (err) {
              set({ playMoveHint: err });
              return null;
            }
          }
          if (districtKind === "underhive") {
            const err = canPlaceUnderhiveAtTile(planet, tileIndex);
            if (err) {
              set({ playMoveHint: err });
              return null;
            }
          }
        }
        const warnings = districtPlacementWarnings(
          planet,
          districtKind,
          tileIndex,
        );
        const result = createDistrictAtTile(
          planet,
          cityId,
          tileIndex,
          districtKind,
        );
        if (!result) return null;
        const newDistrict = result.district;
        const parentCity =
          result.cities.find((c) =>
            c.districts.some((d) => d.id === newDistrict.id),
          ) ?? null;
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const tileClaims = scrubTileClaims(
              p.tileClaims,
              result.cities,
              p.structures ?? [],
              result.independentDistricts,
            );
            return {
              ...p,
              cities: result.cities,
              independentDistricts: result.independentDistricts,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                result.cities,
                tileClaims,
                p.structures ?? [],
                result.independentDistricts,
              ),
            };
          });
          const touched = planets.find((p) => p.id === planetId);
          return {
            ...withCampaign(s, {
              ...s.campaign,
              planets,
              systems: touched
                ? syncSystemOwnerInSystems(
                    s.campaign.systems,
                    planets,
                    touched.systemId,
                  )
                : s.campaign.systems,
            }),
            selectedCityId: parentCity?.id ?? null,
            selectedDistrictId: newDistrict.id,
            selectedStructureId: null,
            playMoveHint:
              !play.active && warnings.length > 0
                ? warnings.join(" · ")
                : s.playMoveHint,
          };
        });
        return newDistrict.id;
      },

      addStructureAtTile: (planetId, tileIndex, structureKind) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const structure = createStructureAtTile(
          planet,
          tileIndex,
          structureKind,
        );
        if (!structure) return null;
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const structures = [...(p.structures ?? []), structure];
            const tileClaims = scrubTileClaims(
              p.tileClaims,
              p.cities ?? [],
              structures,
              p.independentDistricts ?? [],
            );
            return {
              ...p,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                p.cities ?? [],
                tileClaims,
                structures,
                p.independentDistricts ?? [],
              ),
            };
          });
          const touched = planets.find((p) => p.id === planetId);
          return {
            ...withCampaign(s, {
              ...s.campaign,
              planets,
              systems: touched
                ? syncSystemOwnerInSystems(
                    s.campaign.systems,
                    planets,
                    touched.systemId,
                  )
                : s.campaign.systems,
            }),
            selectedStructureId: structure.id,
            selectedCityId: null,
            selectedDistrictId: null,
          };
        });
        return structure.id;
      },

      removeSurfaceAtTile: (planetId, tileIndex) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return false;

        const cityHit = (planet.cities ?? []).find(
          (c) => c.tileIndex === tileIndex,
        );
        if (cityHit) {
          set((s) => {
            const remainingCities = (planet.cities ?? []).filter(
              (c) => c.id !== cityHit.id,
            );
            const assigned = reassignDistrictsToCities(
              remainingCities,
              [
                ...(planet.independentDistricts ?? []),
                ...cityHit.districts,
              ],
            );
            const structures = planet.structures ?? [];
            const tileClaims = scrubTileClaims(
              planet.tileClaims,
              assigned.cities,
              structures,
              assigned.independentDistricts,
            );
            const nextPlanet: Planet = {
              ...planet,
              cities: assigned.cities,
              independentDistricts: assigned.independentDistricts,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                assigned.cities,
                tileClaims,
                structures,
                assigned.independentDistricts,
              ),
            };
            const planets = s.campaign.planets.map((p) =>
              p.id === planetId ? nextPlanet : p,
            );
            return {
              ...withCampaign(s, {
                ...s.campaign,
                planets,
                systems: syncSystemOwnerInSystems(
                  s.campaign.systems,
                  planets,
                  planet.systemId,
                ),
              }),
              selectedCityId:
                s.selectedCityId === cityHit.id ? null : s.selectedCityId,
              selectedDistrictId:
                s.selectedCityId === cityHit.id ? null : s.selectedDistrictId,
            };
          });
          return true;
        }

        let districtCityId: string | null = null;
        let districtId: string | null = null;
        for (const city of planet.cities ?? []) {
          const d = city.districts.find((x) => x.tileIndex === tileIndex);
          if (d) {
            districtCityId = city.id;
            districtId = d.id;
            break;
          }
        }
        if (!districtId) {
          const ind = (planet.independentDistricts ?? []).find(
            (d) => d.tileIndex === tileIndex,
          );
          if (ind) districtId = ind.id;
        }
        if (districtId) {
          const removedDistrictId = districtId;
          const parentCityId = districtCityId;
          set((s) => {
            const cities = (planet.cities ?? []).map((c) =>
              parentCityId && c.id === parentCityId
                ? {
                    ...c,
                    districts: c.districts.filter(
                      (d) => d.id !== removedDistrictId,
                    ),
                  }
                : c,
            );
            const independentDistricts = (
              planet.independentDistricts ?? []
            ).filter((d) => d.id !== removedDistrictId);
            const structures = planet.structures ?? [];
            const tileClaims = scrubTileClaims(
              planet.tileClaims,
              cities,
              structures,
              independentDistricts,
            );
            const nextPlanet: Planet = {
              ...planet,
              cities,
              independentDistricts,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                cities,
                tileClaims,
                structures,
                independentDistricts,
              ),
            };
            const planets = s.campaign.planets.map((p) =>
              p.id === planetId ? nextPlanet : p,
            );
            return {
              ...withCampaign(s, {
                ...s.campaign,
                planets,
                systems: syncSystemOwnerInSystems(
                  s.campaign.systems,
                  planets,
                  planet.systemId,
                ),
              }),
              selectedDistrictId:
                s.selectedDistrictId === removedDistrictId
                  ? null
                  : s.selectedDistrictId,
            };
          });
          return true;
        }

        const structureHit = (planet.structures ?? []).find(
          (st) => st.tileIndex === tileIndex,
        );
        if (structureHit) {
          set((s) => {
            const cities = planet.cities ?? [];
            const independentDistricts = planet.independentDistricts ?? [];
            const structures = (planet.structures ?? []).filter(
              (st) => st.id !== structureHit.id,
            );
            const tileClaims = scrubTileClaims(
              planet.tileClaims,
              cities,
              structures,
              independentDistricts,
            );
            const nextPlanet: Planet = {
              ...planet,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                cities,
                tileClaims,
                structures,
                independentDistricts,
              ),
            };
            const planets = s.campaign.planets.map((p) =>
              p.id === planetId ? nextPlanet : p,
            );
            return {
              ...withCampaign(s, {
                ...s.campaign,
                planets,
                systems: syncSystemOwnerInSystems(
                  s.campaign.systems,
                  planets,
                  planet.systemId,
                ),
              }),
              selectedStructureId:
                s.selectedStructureId === structureHit.id
                  ? null
                  : s.selectedStructureId,
            };
          });
          return true;
        }

        return false;
      },

      regenerateSettlements: (planetId) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          // Fresh layout is unowned — do not inherit planet owner, rival
          // districts, or leftover open-hex paint.
          const { cities, structures, independentDistricts } =
            generatePlanetSurface(planet.id, planet.type, {
              classification: planet.classification,
            });
          const planets = s.campaign.planets.map((p) =>
            p.id === planetId
              ? {
                  ...p,
                  cities,
                  independentDistricts,
                  structures,
                  tileClaims: {},
                  controllingFactionId: undefined,
                }
              : p,
          );
          return {
            ...withCampaign(s, {
              ...s.campaign,
              planets,
              systems: syncSystemOwnerInSystems(
                s.campaign.systems,
                planets,
                planet.systemId,
              ),
            }),
            selectedCityId: null,
            selectedDistrictId: null,
            selectedStructureId: null,
          };
        }),

      addStructure: (planetId, kind) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const structure = createStructureOnFreeHex(planet, kind);
        if (!structure) return null;
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const structures = [...(p.structures ?? []), structure];
            const tileClaims = scrubTileClaims(
              p.tileClaims,
              p.cities ?? [],
              structures,
              p.independentDistricts ?? [],
            );
            return {
              ...p,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                p.cities ?? [],
                tileClaims,
                structures,
                p.independentDistricts ?? [],
              ),
            };
          });
          return withCampaign(s, {
            ...s.campaign,
            planets,
            systems: syncSystemOwnerInSystems(
              s.campaign.systems,
              planets,
              planet.systemId,
            ),
          });
        });
        return structure.id;
      },

      updateCity: (planetId, cityId, patch) =>
        set((s) =>
          withCampaign(
            s,
            {
              ...s.campaign,
              planets: s.campaign.planets.map((p) =>
                p.id === planetId
                  ? {
                      ...p,
                      cities: (p.cities ?? []).map((c) =>
                        c.id === cityId ? { ...c, ...patch } : c,
                      ),
                    }
                  : p,
              ),
            },
            { coalesceKey: `city:${cityId}` },
          ),
        ),

      updateDistrict: (planetId, cityId, districtId, patch) =>
        set((s) =>
          withCampaign(
            s,
            {
              ...s.campaign,
              planets: s.campaign.planets.map((p) => {
                if (p.id !== planetId) return p;
                if (cityId) {
                  return {
                    ...p,
                    cities: (p.cities ?? []).map((c) =>
                      c.id === cityId
                        ? {
                            ...c,
                            districts: c.districts.map((d) =>
                              d.id === districtId ? { ...d, ...patch } : d,
                            ),
                          }
                        : c,
                    ),
                  };
                }
                return {
                  ...p,
                  independentDistricts: (p.independentDistricts ?? []).map(
                    (d) => (d.id === districtId ? { ...d, ...patch } : d),
                  ),
                };
              }),
            },
            { coalesceKey: `district:${districtId}` },
          ),
        ),

      updateStructure: (planetId, structureId, patch) =>
        set((s) =>
          withCampaign(
            s,
            {
              ...s.campaign,
              planets: s.campaign.planets.map((p) =>
                p.id === planetId
                  ? {
                      ...p,
                      structures: (p.structures ?? []).map((st) =>
                        st.id === structureId ? { ...st, ...patch } : st,
                      ),
                    }
                  : p,
              ),
            },
            { coalesceKey: `structure:${structureId}` },
          ),
        ),

      deleteStructure: (planetId, structureId) =>
        set((s) => ({
          ...withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    structures: (p.structures ?? []).filter(
                      (st) => st.id !== structureId,
                    ),
                  }
                : p,
            ),
          }),
          selectedStructureId:
            s.selectedStructureId === structureId
              ? null
              : s.selectedStructureId,
        })),

      addSymbol: (name, imageDataUrl) => {
        const id = crypto.randomUUID();
        const symbol: ArmySymbol = { id, name, imageDataUrl };
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            symbols: [...(s.campaign.symbols ?? []), symbol],
          }),
        );
        return id;
      },

      updateSymbol: (id, patch) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            symbols: (s.campaign.symbols ?? []).map((sym) =>
              sym.id === id ? { ...sym, ...patch } : sym,
            ),
          }),
        ),

      deleteSymbol: (id) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            symbols: (s.campaign.symbols ?? []).filter((sym) => sym.id !== id),
            factions: enforceUniqueSymbolOwnership(
              s.campaign.factions.map((f) => ({
                ...f,
                symbolIds: (f.symbolIds ?? []).filter((sid) => sid !== id),
                defaultSymbolId:
                  f.defaultSymbolId === id ? undefined : f.defaultSymbolId,
              })),
            ),
            planets: s.campaign.planets.map((p) => ({
              ...p,
              armies: (p.armies ?? []).map((a) =>
                a.symbolId === id ? { ...a, symbolId: undefined } : a,
              ),
            })),
            fleets: (s.campaign.fleets ?? []).map((fl) =>
              fl.symbolId === id ? { ...fl, symbolId: undefined } : fl,
            ),
          }),
        ),

      assignFactionSymbol: (factionId, symbolId, asPrimary = false) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            factions: withSymbolAssigned(
              s.campaign.factions,
              factionId,
              symbolId,
              asPrimary,
            ),
          }),
        ),

      unassignFactionSymbol: (factionId, symbolId) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            factions: withSymbolUnassigned(
              s.campaign.factions,
              factionId,
              symbolId,
            ),
          }),
        ),

      setFactionPrimarySymbol: (factionId, symbolId) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            factions: withPrimarySymbol(
              s.campaign.factions,
              factionId,
              symbolId,
            ),
          }),
        ),

      addArmy: (planetId, factionId) => {
        if (normalizeCampaignPlay(get().campaign.play).active) {
          set({
            playMoveHint:
              "In Play mode, recruit detachments with building points at a War Camp",
          });
          return "";
        }
        const id = crypto.randomUUID();
        const faction = get().campaign.factions.find((f) => f.id === factionId);
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        const army: Army = {
          id,
          name: `${faction?.name ?? "Army"} Detachment`,
          factionId,
          symbolId: faction?.defaultSymbolId,
          dir: preferredDetachmentSpawnDir(planet ?? { cities: [] }, factionId),
          notes: "",
          strengthPercent: 100,
        };
        set((s) => ({
          ...withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? { ...p, armies: [...(p.armies ?? []), army] }
                : p,
            ),
          }),
          selectedArmyId: id,
          placingArmyId: id,
          inspectorOpen: true,
        }));
        return id;
      },

      updateArmy: (planetId, armyId, patch) =>
        set((s) => {
          const nextCampaign = {
            ...s.campaign,
            planets: s.campaign.planets.map((p) => {
              if (p.id !== planetId) return p;
              const armies = (p.armies ?? [])
                .map((a) => {
                  if (a.id !== armyId) return a;
                  const next = { ...a, ...patch };
                  if (patch.factionId && patch.factionId !== a.factionId) {
                    const fac = s.campaign.factions.find(
                      (f) => f.id === patch.factionId,
                    );
                    const ids = fac ? factionSymbolIds(fac) : [];
                    if (next.symbolId && !ids.includes(next.symbolId)) {
                      next.symbolId = fac?.defaultSymbolId;
                    }
                  }
                  if ("strengthPercent" in patch) {
                    next.strengthPercent = armyStrength(next);
                  }
                  return next;
                })
                .filter((a) => !isArmyDestroyed(a));
              return { ...p, armies };
            }),
          };
          const stillExists = nextCampaign.planets
            .find((p) => p.id === planetId)
            ?.armies?.some((a) => a.id === armyId);
          return {
            ...withCampaign(s, nextCampaign),
            selectedArmyId:
              !stillExists && s.selectedArmyId === armyId
                ? null
                : s.selectedArmyId,
            placingArmyId:
              !stillExists && s.placingArmyId === armyId
                ? null
                : s.placingArmyId,
          };
        }),

      deleteArmy: (planetId, armyId) =>
        set((s) => {
          const nextCampaign = {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    armies: (p.armies ?? []).filter((a) => a.id !== armyId),
                  }
                : p,
            ),
          };
          return {
            ...withCampaign(s, {
              ...nextCampaign,
              characters: scrubCharacterPlacements(
                s.campaign.characters ?? [],
                nextCampaign,
              ),
            }),
            selectedArmyId:
              s.selectedArmyId === armyId ? null : s.selectedArmyId,
            placingArmyId:
              s.placingArmyId === armyId ? null : s.placingArmyId,
          };
        }),

      moveArmy: (planetId, armyId, dir) => {
        const state = get();
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        const army = planet?.armies?.find((a) => a.id === armyId);
        if (!army) return false;
        const block = playMoveBlockReason(
          state.campaign,
          army.factionId,
          armyId,
          "army",
        );
        if (block) {
          set({ playMoveHint: block });
          return false;
        }
        const play = normalizeCampaignPlay(state.campaign.play);
        const isGate = planet.type === "warp_gate";
        let distance: number;
        if (isGate) {
          const maze = buildStationMaze(planet.id);
          const fromTile = nearestStationTile(army.dir, undefined, maze.walkable);
          const toTile = nearestStationTile(dir, undefined, maze.walkable);
          if (!maze.walkable.has(toTile)) {
            set({ playMoveHint: "That bulkhead is sealed — stay in the corridors" });
            return false;
          }
          distance = stationTileDistance(
            fromTile,
            toTile,
            undefined,
            maze.walkable,
          );
        } else {
          const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
          const fromTile = nearestTileIndex(sphere, army.dir);
          const toTile = nearestTileIndex(sphere, dir);
          distance = hexTileDistance(sphere, fromTile, toTile);
        }

        // Accidental same-hex drop — keep remaining movement.
        if (distance === 0 || !Number.isFinite(distance)) {
          if (distance === 0) {
            set({ playMoveHint: null });
            return true;
          }
          set({ playMoveHint: "Invalid destination" });
          return false;
        }

        if (play.active) {
          const remaining = armyMovementRemaining(play, armyId);
          if (distance > remaining) {
            set({
              playMoveHint:
                remaining <= 0
                  ? `This detachment has used all ${ARMY_MOVE_RANGE} hexes this turn`
                  : `That destination is ${distance} hexes away (${remaining} left)`,
            });
            return false;
          }
        }

        set((s) => {
          let campaign = {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    armies: (p.armies ?? []).map((a) =>
                      a.id === armyId ? { ...a, dir } : a,
                    ),
                  }
                : p,
            ),
          };
          if (play.active) {
            const prevUsed = armyMovementUsed(play, armyId);
            const nextUsed = Math.min(ARMY_MOVE_RANGE, prevUsed + distance);
            const movement = {
              ...(play.armyMovementUsed ?? {}),
              [armyId]: nextUsed,
            };
            const movedIds = play.movedArmyIds.includes(armyId)
              ? play.movedArmyIds
              : [...play.movedArmyIds, armyId];
            campaign = withPlay(campaign, {
              movedArmyIds: movedIds,
              armyMovementUsed: movement,
            });
            const movedPlanet = campaign.planets.find((p) => p.id === planetId);
            const movedArmy = movedPlanet?.armies?.find((a) => a.id === armyId);
            if (movedPlanet && movedArmy) {
              campaign = withPlay(
                campaign,
                playAfterArmyMoved(
                  normalizeCampaignPlay(campaign.play),
                  movedPlanet,
                  movedArmy,
                  distance,
                ),
              );
            }
          }
          const left = play.active
            ? ARMY_MOVE_RANGE -
              Math.min(
                ARMY_MOVE_RANGE,
                armyMovementUsed(play, armyId) + distance,
              )
            : null;
          return {
            ...withCampaign(s, campaign),
            playMoveHint:
              left != null && left > 0
                ? `Moved ${distance} hex${distance === 1 ? "" : "es"} · ${left} remaining`
                : left === 0
                  ? `Moved ${distance} hex${distance === 1 ? "" : "es"} · no movement left`
                  : null,
          };
        });
        return true;
      },

      openBattleResolve: (planetId, attackerArmyId, defenderArmyId) => {
        const state = get();
        if (!normalizeCampaignPlay(state.campaign.play).active) {
          set({
            playMoveHint: "Start Play mode to resolve tabletop battles",
          });
          return;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        const attacker = planet?.armies?.find((a) => a.id === attackerArmyId);
        const defender = planet?.armies?.find((a) => a.id === defenderArmyId);
        if (!planet || !attacker || !defender) {
          set({ playMoveHint: "Both detachments must be on this world" });
          return;
        }
        if (attacker.factionId === defender.factionId) {
          set({ playMoveHint: "Detachments must belong to rival factions" });
          return;
        }
        const canEngage =
          planet.type === "warp_gate"
            ? stationArmiesAreAdjacent(attacker, defender, planet.id)
            : armiesAreAdjacent(
                attacker,
                defender,
                buildHexSphere(SETTLEMENT_HEX_FREQUENCY),
              );
        if (!canEngage) {
          set({
            playMoveHint:
              planet.type === "warp_gate"
                ? "Target must be on the same or an adjacent corridor tile to engage"
                : "Target must be on the same or an adjacent hex to engage",
          });
          return;
        }
        const block = playMoveBlockReason(
          state.campaign,
          attacker.factionId,
          attackerArmyId,
          "army",
        );
        if (block) {
          set({ playMoveHint: block });
          return;
        }
        set({
          battleResolve: { planetId, attackerArmyId, defenderArmyId },
          selectedArmyId: attackerArmyId,
          placingArmyId: null,
          playMoveHint: null,
          inspectorOpen: true,
        });
      },

      closeBattleResolve: () => set({ battleResolve: null }),

      resolveBattle: (input) => {
        const state = get();
        const pending = state.battleResolve;
        if (!pending) return false;

        const planet = state.campaign.planets.find(
          (p) => p.id === pending.planetId,
        );
        const attacker = planet?.armies?.find(
          (a) => a.id === pending.attackerArmyId,
        );
        const defender = planet?.armies?.find(
          (a) => a.id === pending.defenderArmyId,
        );
        if (!planet || !attacker || !defender) {
          set({
            battleResolve: null,
            playMoveHint: "Battle detachments are no longer on this world",
          });
          return false;
        }

        const attackerVp = Math.max(0, Math.round(input.attackerVp));
        const defenderVp = Math.max(0, Math.round(input.defenderVp));
        const attackerCasualties = Math.max(
          0,
          Math.round(input.attackerCasualties),
        );
        const defenderCasualties = Math.max(
          0,
          Math.round(input.defenderCasualties),
        );
        const attackerStrengthLostPct = Math.max(
          0,
          Math.min(100, input.attackerStrengthLostPct),
        );
        const defenderStrengthLostPct = Math.max(
          0,
          Math.min(100, input.defenderStrengthLostPct),
        );

        const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
        const play = normalizeCampaignPlay(state.campaign.play);
        const acted = new Set(play.movedArmyIds);
        const supportCtx =
          planet.type === "warp_gate" ? planet.id : sphere;

        const eligibleAtk = eligibleSupportArmies(
          planet.armies,
          attacker,
          defender.id,
          supportCtx,
          acted,
        );
        const eligibleDef = eligibleSupportArmies(
          planet.armies,
          defender,
          attacker.id,
          supportCtx,
          acted,
        );
        const atkEligibleIds = new Set(eligibleAtk.map((a) => a.id));
        const defEligibleIds = new Set(eligibleDef.map((a) => a.id));

        const attackerSupportIds = [
          ...new Set(input.attackerSupportArmyIds ?? []),
        ].filter((id) => atkEligibleIds.has(id));
        const defenderSupportIds = [
          ...new Set(input.defenderSupportArmyIds ?? []),
        ].filter((id) => defEligibleIds.has(id));

        const attackerSupports = eligibleAtk.filter((a) =>
          attackerSupportIds.includes(a.id),
        );
        const defenderSupports = eligibleDef.filter((a) =>
          defenderSupportIds.includes(a.id),
        );

        const attackerCombined = combinedForceStrengthWithFortifications(
          planet,
          attacker,
          attackerSupports,
        );
        const defenderCombined = combinedForceStrengthWithFortifications(
          planet,
          defender,
          defenderSupports,
        );

        const classified = classifyBattleVictory({
          attackerVp,
          defenderVp,
          attackerCombinedStrength: attackerCombined,
          defenderCombinedStrength: defenderCombined,
          attackerStrengthLostPct,
          defenderStrengthLostPct,
          attackerCasualties,
          defenderCasualties,
        });
        const victoryKind = classified.kind;
        const victorFactionId =
          classified.victorSide === "attacker"
            ? attacker.factionId
            : classified.victorSide === "defender"
              ? defender.factionId
              : null;

        const attackerFaction = state.campaign.factions.find(
          (f) => f.id === attacker.factionId,
        );
        const defenderFaction = state.campaign.factions.find(
          (f) => f.id === defender.factionId,
        );

        const strengthAfter = new Map<string, number>();
        strengthAfter.set(
          attacker.id,
          applyStrengthLoss(armyStrength(attacker), attackerStrengthLostPct),
        );
        strengthAfter.set(
          defender.id,
          applyStrengthLoss(armyStrength(defender), defenderStrengthLostPct),
        );
        for (const a of attackerSupports) {
          strengthAfter.set(
            a.id,
            applyStrengthLoss(armyStrength(a), attackerStrengthLostPct),
          );
        }
        for (const a of defenderSupports) {
          strengthAfter.set(
            a.id,
            applyStrengthLoss(armyStrength(a), defenderStrengthLostPct),
          );
        }

        const participantIds = new Set([
          attacker.id,
          defender.id,
          ...attackerSupportIds,
          ...defenderSupportIds,
        ]);

        const destroyedNames: string[] = [];
        for (const id of participantIds) {
          const next = strengthAfter.get(id) ?? 0;
          if (next > 0) continue;
          const name =
            planet.armies?.find((a) => a.id === id)?.name ?? "Detachment";
          destroyedNames.push(name);
        }

        const battleId = crypto.randomUUID();
        const battle = buildBattleRecord({
          id: battleId,
          planetName: planet.name,
          attackerName: attacker.name,
          defenderName: defender.name,
          attackerFactionId: attacker.factionId,
          defenderFactionId: defender.factionId,
          attackerFactionName: attackerFaction?.name ?? "Attacker",
          defenderFactionName: defenderFaction?.name ?? "Defender",
          attackerArmyId: attacker.id,
          defenderArmyId: defender.id,
          attackerSupportArmyIds: attackerSupportIds,
          defenderSupportArmyIds: defenderSupportIds,
          attackerSupportNames: attackerSupports.map((a) => a.name),
          defenderSupportNames: defenderSupports.map((a) => a.name),
          attackerCombinedStrength: attackerCombined,
          defenderCombinedStrength: defenderCombined,
          attackerVp,
          defenderVp,
          attackerCasualties,
          defenderCasualties,
          attackerStrengthLostPct,
          defenderStrengthLostPct,
          victoryKind,
          victorFactionId,
        });

        set((s) => {
          const monumentDir =
            planet.type === "warp_gate"
              ? placeArmyOnStationTile(
                  nearestStationTile(
                    battleMonumentDir(attacker, defender),
                    undefined,
                    buildStationMaze(planet.id).walkable,
                  ),
                )
              : battleMonumentDir(attacker, defender);
          const monumentTile =
            planet.type === "warp_gate"
              ? nearestStationTile(
                  monumentDir,
                  undefined,
                  buildStationMaze(planet.id).walkable,
                )
              : nearestTileIndex(sphere, monumentDir);
          const siteId = crypto.randomUUID();
          const famousSite =
            (victoryKind === "heroic" || victoryKind === "epochal") &&
            victorFactionId
              ? {
                  id: siteId,
                  battleId,
                  tileIndex: monumentTile,
                  dir: monumentDir,
                  tier: victoryKind,
                  date: battle.date,
                  attackerCommander: commanderLabel(
                    attackerFaction,
                    attacker.name,
                  ),
                  defenderCommander: commanderLabel(
                    defenderFaction,
                    defender.name,
                  ),
                  attackerForceStrength: attackerCombined,
                  defenderForceStrength: defenderCombined,
                  attackerVp,
                  defenderVp,
                  victorFactionId,
                  victorLabel:
                    victorFactionId === attacker.factionId
                      ? attackerFaction?.name ?? "Attacker"
                      : defenderFaction?.name ?? "Defender",
                }
              : null;

          let campaign = {
            ...s.campaign,
            planets: s.campaign.planets.map((p) => {
              if (p.id !== pending.planetId) return p;
              const armies = pruneDestroyedArmies(
                (p.armies ?? []).map((a) => {
                  if (!participantIds.has(a.id)) return a;
                  return {
                    ...a,
                    strengthPercent: strengthAfter.get(a.id) ?? 0,
                  };
                }),
              );
              return {
                ...p,
                armies,
                battles: [...(p.battles ?? []), battle],
                famousBattleSites: famousSite
                  ? [...(p.famousBattleSites ?? []), famousSite]
                  : (p.famousBattleSites ?? []),
              };
            }),
          };

          if (play.active) {
            const moved = new Set(play.movedArmyIds);
            const movement = { ...(play.armyMovementUsed ?? {}) };
            for (const id of participantIds) {
              const next = strengthAfter.get(id) ?? 0;
              if (next <= 0) {
                moved.delete(id);
                delete movement[id];
              } else {
                moved.add(id);
                movement[id] = ARMY_MOVE_RANGE;
              }
            }
            campaign = withPlay(campaign, {
              movedArmyIds: [...moved],
              armyMovementUsed: movement,
            });
            const foughtPlanet = campaign.planets.find(
              (p) => p.id === pending.planetId,
            );
            if (foughtPlanet) {
              let campPlay = normalizeCampaignPlay(campaign.play);
              for (const a of foughtPlanet.armies ?? []) {
                if (!participantIds.has(a.id)) continue;
                if (armyStrength(a) >= 100) continue;
                campPlay = playAfterArmyMoved(campPlay, foughtPlanet, a, 1);
              }
              campaign = withPlay(campaign, campPlay);
            }
          }

          campaign = {
            ...campaign,
            characters: scrubCharacterPlacements(
              campaign.characters ?? [],
              campaign,
            ),
          };

          const selectedGone =
            s.selectedArmyId != null &&
            participantIds.has(s.selectedArmyId) &&
            (strengthAfter.get(s.selectedArmyId) ?? 0) <= 0;
          const placingGone =
            s.placingArmyId != null &&
            participantIds.has(s.placingArmyId) &&
            (strengthAfter.get(s.placingArmyId) ?? 0) <= 0;

          return {
            ...withCampaign(s, withHistoryCapture(campaign)),
            battleResolve: null,
            selectedArmyId: selectedGone ? null : s.selectedArmyId,
            placingArmyId: placingGone ? null : s.placingArmyId,
            playMoveHint: (() => {
              const base = destroyedNames.length
                ? `Battle recorded. Destroyed: ${destroyedNames.join(", ")}`
                : `Battle recorded — ${battle.outcome}`;
              if (victoryKind === "heroic" || victoryKind === "epochal") {
                return `${base} · Crossed swords mark the site`;
              }
              return base;
            })(),
          };
        });
        return true;
      },

      selectArmy: (armyId) =>
        set({
          selectedArmyId: armyId,
          selectedFleetId: null,
          fleetMoveModeId: null,
          selectedCityId: null,
          selectedDistrictId: null,
          selectedStructureId: null,
          inspectorOpen: true,
        }),

      setPlacingArmy: (armyId) => {
        if (armyId != null) {
          const state = get();
          let army: Army | undefined;
          for (const p of state.campaign.planets) {
            army = (p.armies ?? []).find((a) => a.id === armyId);
            if (army) break;
          }
          if (army) {
            const block = playMoveBlockReason(
              state.campaign,
              army.factionId,
              armyId,
              "army",
            );
            if (block) {
              set({ playMoveHint: block, placingArmyId: null });
              return;
            }
          }
        }
        set((s) => ({
          placingArmyId: armyId,
          terrainPaintFactionId:
            armyId != null ? null : s.terrainPaintFactionId,
          fleetMoveModeId: armyId != null ? null : s.fleetMoveModeId,
          playMoveHint: armyId != null ? null : s.playMoveHint,
        }));
      },

      addFleet: (systemId, factionId) => {
        if (normalizeCampaignPlay(get().campaign.play).active) {
          set({
            playMoveHint:
              "In Play mode, recruit fleets with building points at a Space Port",
          });
          return "";
        }
        const id = crypto.randomUUID();
        const faction = get().campaign.factions.find((f) => f.id === factionId);
        const count = (get().campaign.fleets ?? []).filter(
          (f) => f.factionId === factionId,
        ).length;
        const fleet: Fleet = {
          id,
          name: `${faction?.name ?? "Fleet"} ${count + 1}`,
          factionId,
          symbolId: faction?.defaultSymbolId,
          ships: [
            createShip("escort", 1),
            createShip("escort", 2),
            createShip("light_cruiser", 1),
          ],
          location: { kind: "system", systemId },
          notes: "",
        };
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              fleets: [...(s.campaign.fleets ?? []), fleet],
            }),
          ),
          selectedFleetId: id,
          selectedArmyId: null,
          selectedCityId: null,
          selectedDistrictId: null,
          selectedStructureId: null,
          inspectorOpen: true,
        }));
        return id;
      },

      updateFleet: (fleetId, patch) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            fleets: (s.campaign.fleets ?? []).map((f) =>
              f.id === fleetId ? { ...f, ...patch } : f,
            ),
          }),
        ),

      deleteFleet: (fleetId) =>
        set((s) => {
          const nextCampaign = {
            ...s.campaign,
            fleets: (s.campaign.fleets ?? []).filter((f) => f.id !== fleetId),
          };
          return {
            ...withCampaign(
              s,
              withHistoryCapture({
                ...nextCampaign,
                characters: scrubCharacterPlacements(
                  s.campaign.characters ?? [],
                  nextCampaign,
                ),
              }),
            ),
            selectedFleetId:
              s.selectedFleetId === fleetId ? null : s.selectedFleetId,
            fleetMoveModeId:
              s.fleetMoveModeId === fleetId ? null : s.fleetMoveModeId,
          };
        }),

      addShip: (fleetId, chassis) => {
        if (normalizeCampaignPlay(get().campaign.play).active) {
          set({
            playMoveHint:
              "In Play mode, build ships with building points at a Space Port",
          });
          return "";
        }
        const id = crypto.randomUUID();
        set((s) => {
          const fleets = (s.campaign.fleets ?? []).map((f) => {
            if (f.id !== fleetId) return f;
            const same = f.ships.filter((ship) => ship.chassis === chassis)
              .length;
            const ship = { ...createShip(chassis, same + 1), id };
            return { ...f, ships: [...f.ships, ship] };
          });
          return withCampaign(s, { ...s.campaign, fleets });
        });
        return id;
      },

      updateShip: (fleetId, shipId, patch) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            fleets: (s.campaign.fleets ?? []).map((f) =>
              f.id === fleetId
                ? {
                    ...f,
                    ships: f.ships.map((ship) =>
                      ship.id === shipId
                        ? normalizeShipCargo({ ...ship, ...patch })
                        : ship,
                    ),
                  }
                : f,
            ),
          }),
        ),

      deleteShip: (fleetId, shipId) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            fleets: (s.campaign.fleets ?? []).map((f) =>
              f.id === fleetId
                ? {
                    ...f,
                    ships: f.ships.filter((ship) => ship.id !== shipId),
                  }
                : f,
            ),
          }),
        ),

      moveFleet: (fleetId, location) => {
        const state = get();
        const fleet = (state.campaign.fleets ?? []).find(
          (f) => f.id === fleetId,
        );
        if (!fleet) return false;
        const block = playMoveBlockReason(
          state.campaign,
          fleet.factionId,
          fleetId,
          "fleet",
        );
        if (block) {
          set({ playMoveHint: block, fleetMoveModeId: null });
          return false;
        }
        if (!isValidFleetMove(state.campaign, fleet, location)) return false;
        const nextLocation: FleetLocation =
          location.systemId !== fleet.location.systemId
            ? { kind: "system", systemId: location.systemId }
            : location;
        const play = normalizeCampaignPlay(state.campaign.play);
        set((s) => {
          let campaign = {
            ...s.campaign,
            fleets: (s.campaign.fleets ?? []).map((f) =>
              f.id === fleetId ? { ...f, location: nextLocation } : f,
            ),
          };
          if (play.active) {
            campaign = withPlay(campaign, {
              movedFleetIds: play.movedFleetIds.includes(fleetId)
                ? play.movedFleetIds
                : [...play.movedFleetIds, fleetId],
            });
          }
          return {
            ...withCampaign(s, withHistoryCapture(campaign)),
            fleetMoveModeId: null,
            selectedFleetId: fleetId,
            playMoveHint: null,
          };
        });
        return true;
      },

      travelThroughWarpGate: (fleetId) => {
        const state = get();
        const fleet = (state.campaign.fleets ?? []).find((f) => f.id === fleetId);
        if (!fleet) return false;
        const block = playMoveBlockReason(
          state.campaign,
          fleet.factionId,
          fleetId,
          "fleet",
        );
        if (block) {
          set({ playMoveHint: block });
          return false;
        }
        const gate = fleetAtWarpGate(state.campaign, fleet);
        if (!gate) {
          set({
            playMoveHint: "Move into orbit of a warp gate to transit",
          });
          return false;
        }
        const denied = warpTravelBlockedReason(fleet, gate);
        if (denied) {
          set({ playMoveHint: denied });
          return false;
        }

        const linked = linkedWarpGate(state.campaign, gate);
        let nextLocation: FleetLocation;
        let hint: string;
        if (linked) {
          nextLocation = {
            kind: "orbit",
            systemId: linked.systemId,
            planetId: linked.id,
          };
          const sysName =
            state.campaign.systems.find((s) => s.id === linked.systemId)?.name ??
            "destination";
          hint = `Warped to ${linked.name} · ${sysName}`;
        } else {
          const destSystemId = randomOtherSystemId(
            state.campaign,
            gate.systemId,
          );
          if (!destSystemId) {
            set({ playMoveHint: "No destination systems available" });
            return false;
          }
          nextLocation = { kind: "system", systemId: destSystemId };
          const sysName =
            state.campaign.systems.find((s) => s.id === destSystemId)?.name ??
            "unknown system";
          hint = `Unstable transit dumped the fleet at ${sysName}`;
        }

        const play = normalizeCampaignPlay(state.campaign.play);
        set((s) => {
          let campaign = {
            ...s.campaign,
            fleets: (s.campaign.fleets ?? []).map((f) =>
              f.id === fleetId ? { ...f, location: nextLocation } : f,
            ),
          };
          if (play.active) {
            campaign = withPlay(campaign, {
              movedFleetIds: play.movedFleetIds.includes(fleetId)
                ? play.movedFleetIds
                : [...play.movedFleetIds, fleetId],
            });
          }
          return {
            ...withCampaign(s, withHistoryCapture(campaign)),
            fleetMoveModeId: null,
            selectedFleetId: fleetId,
            playMoveHint: hint,
            focusedSystemId: nextLocation.systemId,
            viewLevel:
              nextLocation.kind === "orbit" ? "system" : s.viewLevel === "galaxy"
                ? "galaxy"
                : "system",
          };
        });
        return true;
      },

      seizeRelayCrown: (planetId, armyId) => {
        const state = get();
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet || planet.type !== "warp_gate") {
          set({ playMoveHint: "Not a warp gate station" });
          return false;
        }
        const army = planet.armies?.find((a) => a.id === armyId);
        if (!army) return false;
        const play = normalizeCampaignPlay(state.campaign.play);
        if (play.active && play.activeFactionId !== army.factionId) {
          set({ playMoveHint: "Only the active faction can seize the crown" });
          return false;
        }
        const maze = buildStationMaze(planet.id);
        const armyTile = nearestStationTile(army.dir, undefined, maze.walkable);
        const crown = (planet.structures ?? []).find(
          (s) => s.kind === RELAY_CROWN_KIND,
        );
        if (!crown || crown.tileIndex !== armyTile) {
          set({
            playMoveHint:
              "Climb the station and stand on the Relay Crown tile to seize it",
          });
          return false;
        }
        if (crown.controllingFactionId === army.factionId) {
          set({ playMoveHint: "Your faction already holds the relay crown" });
          return false;
        }

        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const structures = (p.structures ?? []).map((st) =>
              st.kind === RELAY_CROWN_KIND
                ? { ...st, controllingFactionId: army.factionId }
                : st,
            );
            return applyWarpGateOwnership({ ...p, structures });
          });
          const touched = planets.find((p) => p.id === planetId);
          return {
            ...withCampaign(
              s,
              withHistoryCapture({
                ...s.campaign,
                planets,
                systems: touched
                  ? syncSystemOwnerInSystems(
                      s.campaign.systems,
                      planets,
                      touched.systemId,
                    )
                  : s.campaign.systems,
              }),
            ),
            playMoveHint:
              "Relay crown seized — this faction now controls the gate",
          };
        });
        return true;
      },

      boardWarpGate: (planetId) => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        const factionId = play.active
          ? play.activeFactionId
          : state.campaign.factions[0]?.id ?? null;
        if (!factionId) {
          set({ playMoveHint: "No faction available to board" });
          return null;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet || planet.type !== "warp_gate") {
          set({ playMoveHint: "Not a warp gate" });
          return null;
        }
        const orbiting = (state.campaign.fleets ?? []).some(
          (f) =>
            f.factionId === factionId &&
            f.location.kind === "orbit" &&
            f.location.planetId === planetId,
        );
        if (!orbiting) {
          set({
            playMoveHint:
              "Orbit this warp gate with a fleet before boarding the station",
          });
          return null;
        }

        const docks = stationDockTiles(planetId);
        const maze = buildStationMaze(planetId);
        const occupied = new Set(
          (planet.armies ?? []).map((a) =>
            nearestStationTile(a.dir, undefined, maze.walkable),
          ),
        );
        const tile =
          docks.find((t) => !occupied.has(t)) ??
          docks[0] ??
          maze.dockTiles[0] ??
          1;
        const faction = state.campaign.factions.find((f) => f.id === factionId);
        const id = crypto.randomUUID();
        const army = {
          id,
          name: `${faction?.name ?? "Boarding"} Detachment`,
          factionId,
          symbolId: faction?.defaultSymbolId,
          dir: placeArmyOnStationTile(tile),
          notes: "Boarded from orbit",
          strengthPercent: 100,
        };

        // Prefer transport cargo from an orbiting fleet, else any planet BP bank.
        let spendFleetId: string | null = null;
        let spendPlanetId: string | null = null;
        if (play.active) {
          const orbitFleets = (state.campaign.fleets ?? []).filter(
            (f) =>
              f.factionId === factionId &&
              f.location.kind === "orbit" &&
              f.location.planetId === planetId &&
              fleetCargoBp(f) >= DETACHMENT_BP_COST,
          );
          if (orbitFleets[0]) {
            spendFleetId = orbitFleets[0].id;
          } else {
            for (const p of state.campaign.planets) {
              const bp = (p.buildingPoints ?? {})[factionId] ?? 0;
              if (bp >= DETACHMENT_BP_COST) {
                spendPlanetId = p.id;
                break;
              }
            }
            if (!spendPlanetId) {
              set({
                playMoveHint: `Need ${DETACHMENT_BP_COST} BP in transport holds or on a world to board`,
              });
              return null;
            }
          }
        }

        set((s) => {
          let fleets = s.campaign.fleets ?? [];
          if (spendFleetId) {
            fleets = fleets.map((f) => {
              if (f.id !== spendFleetId) return f;
              return spendFleetCargo(f, DETACHMENT_BP_COST) ?? f;
            });
          }
          const planets = s.campaign.planets.map((p) => {
            let next = p;
            if (spendPlanetId && p.id === spendPlanetId) {
              next = spendBuildingPoints(next, factionId, DETACHMENT_BP_COST);
            }
            if (p.id === planetId) {
              return {
                ...next,
                armies: [...(next.armies ?? []), army],
              };
            }
            return next;
          });
          return {
            ...withCampaign(
              s,
              withHistoryCapture({ ...s.campaign, planets, fleets }),
            ),
            selectedArmyId: id,
            playMoveHint: spendFleetId
              ? "Boarding detachment deployed from transport cargo — climb to the Relay Crown"
              : "Boarding detachment deployed at the bottom locks — climb to the Relay Crown",
            inspectorOpen: true,
          };
        });
        return id;
      },

      loadTransportCargo: (fleetId, amount) => {
        const state = get();
        const fleet = (state.campaign.fleets ?? []).find((f) => f.id === fleetId);
        if (!fleet || fleet.location.kind !== "orbit") {
          set({ playMoveHint: "Fleet must be in orbit to load BP" });
          return 0;
        }
        const planet = state.campaign.planets.find(
          (p) => p.id === fleet.location.planetId,
        );
        if (!planet) {
          set({ playMoveHint: "Orbit world not found" });
          return 0;
        }
        const check = canLoadTransportCargo(
          state.campaign,
          fleet,
          planet,
          amount,
        );
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return 0;
        }
        const { fleet: loadedFleet, added } = addFleetCargo(fleet, check.load);
        if (added <= 0) return 0;
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              fleets: (s.campaign.fleets ?? []).map((f) =>
                f.id === fleetId ? loadedFleet : f,
              ),
              planets: s.campaign.planets.map((p) =>
                p.id === planet.id
                  ? spendBuildingPoints(p, fleet.factionId, added)
                  : p,
              ),
            }),
          ),
          playMoveHint: `Loaded ${added} BP into transport holds (${fleetCargoBp(loadedFleet)} total)`,
        }));
        return added;
      },

      unloadTransportCargo: (fleetId, amount) => {
        const state = get();
        const fleet = (state.campaign.fleets ?? []).find((f) => f.id === fleetId);
        if (!fleet || fleet.location.kind !== "orbit") {
          set({ playMoveHint: "Fleet must be in orbit to unload BP" });
          return 0;
        }
        const planet = state.campaign.planets.find(
          (p) => p.id === fleet.location.planetId,
        );
        if (!planet) {
          set({ playMoveHint: "Orbit world not found" });
          return 0;
        }
        const check = canUnloadTransportCargo(
          state.campaign,
          fleet,
          planet,
          amount,
        );
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return 0;
        }
        const spentFleet = spendFleetCargo(fleet, check.unload);
        if (!spentFleet) {
          set({ playMoveHint: "Could not unload cargo" });
          return 0;
        }
        const credited = creditBuildingPoints(
          planet,
          fleet.factionId,
          check.unload,
        );
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              fleets: (s.campaign.fleets ?? []).map((f) =>
                f.id === fleetId ? spentFleet : f,
              ),
              planets: s.campaign.planets.map((p) =>
                p.id === planet.id ? credited : p,
              ),
            }),
          ),
          playMoveHint: `Unloaded ${check.unload} BP onto ${planet.name} (${getBuildingPoints(credited, fleet.factionId)} banked)`,
        }));
        return check.unload;
      },

      deployFromTransport: (fleetId) => {
        const state = get();
        const fleet = (state.campaign.fleets ?? []).find((f) => f.id === fleetId);
        if (!fleet || fleet.location.kind !== "orbit") {
          set({ playMoveHint: "Fleet must be in orbit to deploy" });
          return null;
        }
        const planetId = fleet.location.planetId;
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet) {
          set({ playMoveHint: "Orbit world not found" });
          return null;
        }
        const check = canDeployFromTransport(state.campaign, fleet, planet);
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return null;
        }

        const spentFleet = spendFleetCargo(fleet, DETACHMENT_BP_COST);
        if (!spentFleet) {
          set({
            playMoveHint: `Need ${DETACHMENT_BP_COST} BP in transport holds`,
          });
          return null;
        }

        const faction = state.campaign.factions.find(
          (f) => f.id === fleet.factionId,
        );
        const id = crypto.randomUUID();

        if (planet.type === "warp_gate") {
          const docks = stationDockTiles(planetId);
          const maze = buildStationMaze(planetId);
          const occupied = new Set(
            (planet.armies ?? []).map((a) =>
              nearestStationTile(a.dir, undefined, maze.walkable),
            ),
          );
          const tile =
            docks.find((t) => !occupied.has(t)) ??
            docks[0] ??
            maze.dockTiles[0] ??
            1;
          const army: Army = {
            id,
            name: `${faction?.name ?? "Landing"} Detachment`,
            factionId: fleet.factionId,
            symbolId: faction?.defaultSymbolId,
            dir: placeArmyOnStationTile(tile),
            notes: "Deployed from transport hold",
            strengthPercent: 100,
          };
          set((s) => ({
            ...withCampaign(
              s,
              withHistoryCapture({
                ...s.campaign,
                fleets: (s.campaign.fleets ?? []).map((f) =>
                  f.id === fleetId ? spentFleet : f,
                ),
                planets: s.campaign.planets.map((p) =>
                  p.id === planetId
                    ? { ...p, armies: [...(p.armies ?? []), army] }
                    : p,
                ),
              }),
            ),
            selectedArmyId: id,
            selectedFleetId: fleetId,
            focusedPlanetId: planetId,
            selectedPlanetId: planetId,
            viewLevel: "strategic",
            placingArmyId: null,
            playMoveHint:
              "Detachment landed at the boarding locks from transport cargo",
            inspectorOpen: true,
          }));
          return id;
        }

        // Surface world: spawn then let the player place on the strategic map.
        if (!supportsStrategicSurface(planet)) {
          set({
            playMoveHint:
              "Gas giants have no surface for detachments — deploy to a solid world",
          });
          return null;
        }
        const army: Army = {
          id,
          name: `${faction?.name ?? "Landing"} Detachment`,
          factionId: fleet.factionId,
          symbolId: faction?.defaultSymbolId,
          dir: preferredDetachmentSpawnDir(planet, fleet.factionId),
          notes: "Deployed from transport hold",
          strengthPercent: 100,
        };
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              fleets: (s.campaign.fleets ?? []).map((f) =>
                f.id === fleetId ? spentFleet : f,
              ),
              planets: s.campaign.planets.map((p) =>
                p.id === planetId
                  ? { ...p, armies: [...(p.armies ?? []), army] }
                  : p,
              ),
            }),
          ),
          selectedArmyId: id,
          selectedFleetId: fleetId,
          focusedPlanetId: planetId,
          selectedPlanetId: planetId,
          viewLevel: "strategic",
          placingArmyId: id,
          playMoveHint:
            "Detachment deployed from transport — click a hex to place it",
          inspectorOpen: true,
        }));
        return id;
      },

      selectFleet: (fleetId) =>
        set({
          selectedFleetId: fleetId,
          selectedArmyId: null,
          selectedCityId: null,
          selectedDistrictId: null,
          selectedStructureId: null,
          placingArmyId: null,
          inspectorOpen: true,
        }),

      setFleetMoveMode: (fleetId) => {
        if (fleetId != null) {
          const state = get();
          const fleet = (state.campaign.fleets ?? []).find(
            (f) => f.id === fleetId,
          );
          if (fleet) {
            const block = playMoveBlockReason(
              state.campaign,
              fleet.factionId,
              fleetId,
              "fleet",
            );
            if (block) {
              set({ playMoveHint: block, fleetMoveModeId: null });
              return;
            }
          }
        }
        set((s) => ({
          fleetMoveModeId: fleetId,
          placingArmyId: fleetId != null ? null : s.placingArmyId,
          terrainPaintFactionId:
            fleetId != null ? null : s.terrainPaintFactionId,
          selectedFleetId: fleetId ?? s.selectedFleetId,
          playMoveHint: fleetId != null ? null : s.playMoveHint,
        }));
      },

      captureTimelineFrame: (label) => {
        set((s) =>
          withCampaign(
            s,
            withHistoryCapture(s.campaign, {
              force: true,
              label: label?.trim() || undefined,
            }),
          ),
        );
        const frames = get().campaign.timeline?.frames ?? [];
        return frames[frames.length - 1]?.id ?? "";
      },

      clearTimelineFrames: () =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            timeline: {
              frames: [],
              events: s.campaign.timeline?.events ?? [],
            },
          }),
        ),

      addTimelineEvent: () => {
        const id = crypto.randomUUID();
        const events = get().campaign.timeline?.events ?? [];
        const frames = get().campaign.timeline?.frames ?? [];
        const lastEventSec = events.reduce(
          (m, e) => Math.max(m, e.timeSec),
          -1,
        );
        const lastFrameSec = frames.reduce(
          (m, f) => Math.max(m, f.timeSec),
          -1,
        );
        const event: TimelineEvent = {
          id,
          title: `Event ${events.length + 1}`,
          timeSec: Math.max(lastEventSec, lastFrameSec, -5) + 5,
          summary: "",
          significance: "normal",
        };
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            timeline: {
              frames: s.campaign.timeline?.frames ?? [],
              events: [...(s.campaign.timeline?.events ?? []), event].sort(
                (a, b) => a.timeSec - b.timeSec,
              ),
            },
          }),
        );
        return id;
      },

      updateTimelineEvent: (eventId, patch) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            timeline: {
              frames: s.campaign.timeline?.frames ?? [],
              events: (s.campaign.timeline?.events ?? [])
                .map((e) => (e.id === eventId ? { ...e, ...patch } : e))
                .sort((a, b) => a.timeSec - b.timeSec),
            },
          }),
        ),

      deleteTimelineEvent: (eventId) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            timeline: {
              frames: s.campaign.timeline?.frames ?? [],
              events: (s.campaign.timeline?.events ?? []).filter(
                (e) => e.id !== eventId,
              ),
            },
          }),
        ),

      deletePlanet: (id) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === id);
          if (!planet) return s;
          const unlinked =
            planet.type === "warp_gate"
              ? unlinkWarpGate(s.campaign.planets, id)
              : s.campaign.planets;
          const remaining = unlinked
            .filter((p) => p.id !== id)
            .map((p) =>
              p.systemId === planet.systemId && p.orbitIndex > planet.orbitIndex
                ? { ...p, orbitIndex: p.orbitIndex - 1 }
                : p,
            );
          const fleets = (s.campaign.fleets ?? []).map((f) => {
            if (
              f.location.kind === "orbit" &&
              f.location.planetId === id
            ) {
              return {
                ...f,
                location: {
                  kind: "system" as const,
                  systemId: planet.systemId,
                },
              };
            }
            return f;
          });
          const nextCampaign = {
            ...s.campaign,
            planets: remaining,
            fleets,
          };
          return {
            ...withCampaign(s, {
              ...nextCampaign,
              characters: scrubCharacterPlacements(
                s.campaign.characters ?? [],
                nextCampaign,
              ),
            }),
            focusedPlanetId:
              s.focusedPlanetId === id ? null : s.focusedPlanetId,
            selectedPlanetId:
              s.selectedPlanetId === id ? null : s.selectedPlanetId,
            viewLevel:
              s.focusedPlanetId === id ? "system" : s.viewLevel,
          };
        }),

      addFaction: () => {
        const id = crypto.randomUUID();
        const faction: Faction = {
          id,
          name: "New Faction",
          color: "#6b8cae",
        };
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            factions: [...s.campaign.factions, faction],
          }),
        );
        return id;
      },

      updateFaction: (id, patch) =>
        set((s) => {
          let factions = s.campaign.factions.map((f) =>
            f.id === id ? { ...f, ...patch } : f,
          );
          // If primary / roster patched, keep ownership exclusive.
          if ("defaultSymbolId" in patch || "symbolIds" in patch) {
            const next = factions.find((f) => f.id === id);
            if (next?.defaultSymbolId) {
              factions = withSymbolAssigned(
                factions,
                id,
                next.defaultSymbolId,
                true,
              );
            } else {
              factions = enforceUniqueSymbolOwnership(factions);
            }
          }
          return withCampaign(s, { ...s.campaign, factions });
        }),

      deleteFaction: (id) =>
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            const cities = (p.cities ?? []).map((c) => ({
              ...c,
              controllingFactionId:
                c.controllingFactionId === id
                  ? undefined
                  : c.controllingFactionId,
              districts: c.districts.map((d) =>
                d.controllingFactionId === id
                  ? { ...d, controllingFactionId: undefined }
                  : d,
              ),
            }));
            const independentDistricts = (p.independentDistricts ?? []).map(
              (d) =>
                d.controllingFactionId === id
                  ? { ...d, controllingFactionId: undefined }
                  : d,
            );
            const structures = (p.structures ?? []).map((st) =>
              st.controllingFactionId === id
                ? { ...st, controllingFactionId: undefined }
                : st,
            );
            const tileClaims: Record<string, string> = {};
            for (const [key, factionId] of Object.entries(p.tileClaims ?? {})) {
              if (factionId && factionId !== id) tileClaims[key] = factionId;
            }
            return {
              ...p,
              cities,
              independentDistricts,
              structures,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                cities,
                tileClaims,
                structures,
                independentDistricts,
              ),
              armies: (p.armies ?? []).filter((a) => a.factionId !== id),
            };
          });
          return withCampaign(s, {
            ...s.campaign,
            factions: s.campaign.factions.filter((f) => f.id !== id),
            fleets: (s.campaign.fleets ?? []).filter((f) => f.factionId !== id),
            characters: (s.campaign.characters ?? []).map((c) =>
              c.factionId === id ? { ...c, factionId: undefined } : c,
            ),
            planets,
            systems: s.campaign.systems.map((sys) => ({
              ...sys,
              controllingFactionId: deriveSystemOwnerId(planets, sys.id),
            })),
          });
        }),

      addCharacter: (seed) => {
        const id = crypto.randomUUID();
        const character: CampaignCharacter = {
          id,
          name: seed?.name?.trim() || "New Character",
          title: seed?.title ?? "",
          factionId: seed?.factionId,
          affiliation: seed?.affiliation,
          status: seed?.status ?? "alive",
          placement: seed?.placement ?? { kind: "unknown" },
          location: seed?.location ?? "",
          notes: seed?.notes,
        };
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            characters: [...(s.campaign.characters ?? []), character],
          }),
        );
        return id;
      },

      updateCharacter: (id, patch) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            characters: (s.campaign.characters ?? []).map((c) =>
              c.id === id ? { ...c, ...patch } : c,
            ),
          }),
        ),

      deleteCharacter: (id) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            characters: (s.campaign.characters ?? []).filter((c) => c.id !== id),
          }),
        ),

      addBattle: (planetId) => {
        const battleId = crypto.randomUUID();
        const entry: BattleEntry = {
          id: battleId,
          date: "",
          summary: "",
          outcome: "",
        };
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? { ...p, battles: [...p.battles, entry] }
                : p,
            ),
          }),
        );
        return battleId;
      },

      updateBattle: (planetId, battleId, patch) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    battles: p.battles.map((b) =>
                      b.id === battleId ? { ...b, ...patch } : b,
                    ),
                  }
                : p,
            ),
          }),
        ),

      deleteBattle: (planetId, battleId) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    battles: p.battles.filter((b) => b.id !== battleId),
                  }
                : p,
            ),
          }),
        ),

      startPlayCampaign: (order) => {
        const campaign = get().campaign;
        const factionIds = new Set(campaign.factions.map((f) => f.id));
        const turnOrder = (
          order?.length
            ? order.filter((id) => factionIds.has(id))
            : campaign.factions.map((f) => f.id)
        ).filter((id, i, arr) => arr.indexOf(id) === i);
        if (turnOrder.length === 0) {
          set({
            playMoveHint:
              "Add factions in Maps → Edit Galaxy before starting a campaign",
          });
          return false;
        }
        const activeFactionId = turnOrder[0]!;
        const faction = campaign.factions.find((f) => f.id === activeFactionId);
        const label = turnLabel(1, faction?.name ?? "Faction");
        set((s) => {
          const withPlayState = withPlay(s.campaign, {
            active: true,
            round: 1,
            turnOrder,
            activeFactionId,
            movedFleetIds: [],
            movedArmyIds: [],
            armyMovementUsed: {},
            armyCampEnteredRound: {},
          });
          const withIncome = applyTurnIncome(withPlayState, activeFactionId);
          return {
            ...withCampaign(
              s,
              withHistoryCapture(withIncome, { force: true, label }),
            ),
            fleetMoveModeId: null,
            placingArmyId: null,
            playBuildMode: null,
            playMoveHint: null,
          };
        });
        return true;
      },

      stopPlayCampaign: () =>
        set((s) => ({
          ...withCampaign(
            s,
            withPlay(s.campaign, {
              ...normalizeCampaignPlay(s.campaign.play),
              active: false,
              activeFactionId: null,
              movedFleetIds: [],
              movedArmyIds: [],
              armyMovementUsed: {},
              armyCampEnteredRound: {},
            }),
          ),
          fleetMoveModeId: null,
          placingArmyId: null,
          playBuildMode: null,
          playMoveHint: null,
        })),

      endTurn: () => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        if (!play.active || play.turnOrder.length === 0) return;

        const currentId = play.activeFactionId;
        const currentFaction = state.campaign.factions.find(
          (f) => f.id === currentId,
        );
        const completedLabel = turnLabel(
          play.round,
          currentFaction?.name ?? "Faction",
        );

        const idx = currentId
          ? play.turnOrder.indexOf(currentId)
          : -1;
        const nextIdx =
          idx < 0 ? 0 : (idx + 1) % play.turnOrder.length;
        const wrapped = idx >= 0 && nextIdx === 0;
        const nextRound = wrapped ? play.round + 1 : play.round;
        const nextFactionId = play.turnOrder[nextIdx] ?? null;

        set((s) => {
          let campaign = withPlay(s.campaign, {
            active: true,
            round: nextRound,
            turnOrder: play.turnOrder,
            activeFactionId: nextFactionId,
            movedFleetIds: [],
            movedArmyIds: [],
            armyMovementUsed: {},
            armyCampEnteredRound: play.armyCampEnteredRound,
          });
          const healed = applyWarCampHeals(campaign);
          campaign = healed.campaign;
          if (nextFactionId) {
            campaign = applyTurnIncome(campaign, nextFactionId);
          }
          const healHint =
            healed.healedIds.length > 0
              ? `${healed.healedIds.length} detachment${healed.healedIds.length === 1 ? "" : "s"} restored at War Camp`
              : null;
          return {
            ...withCampaign(
              s,
              withHistoryCapture(campaign, {
                force: true,
                label: completedLabel,
              }),
            ),
            fleetMoveModeId: null,
            placingArmyId: null,
            playBuildMode: null,
            playMoveHint: healHint,
          };
        });
      },

      clearPlayMoveHint: () => set({ playMoveHint: null }),

      mergeArmies: (planetId, sourceArmyId, targetArmyId) => {
        const state = get();
        const result = mergeArmiesInto(
          state.campaign,
          planetId,
          sourceArmyId,
          targetArmyId,
        );
        if (!result.ok) {
          set({ playMoveHint: result.message });
          return false;
        }
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...result.campaign,
              characters: scrubCharacterPlacements(
                s.campaign.characters ?? [],
                result.campaign,
              ),
            }),
          ),
          selectedArmyId:
            s.selectedArmyId === sourceArmyId
              ? targetArmyId
              : s.selectedArmyId,
          placingArmyId:
            s.placingArmyId === sourceArmyId ? null : s.placingArmyId,
          playMoveHint: "Detachments merged",
        }));
        return true;
      },

      recruitDetachment: (planetId) => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        const factionId = play.activeFactionId;
        if (!factionId) {
          set({ playMoveHint: "No active faction" });
          return null;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const check = canRecruitDetachment(state.campaign, planet, factionId);
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return null;
        }
        const camps = ownedCamps(planet, factionId);
        const camp = camps[0]!;
        const faction = state.campaign.factions.find((f) => f.id === factionId);
        const campCity = camp.cityId
          ? (planet.cities ?? []).find((c) => c.id === camp.cityId)
          : undefined;
        const preferCityDir =
          campCity?.controllingFactionId === factionId
            ? campCity.dir
            : undefined;
        const id = crypto.randomUUID();
        const army: Army = {
          id,
          name: `${faction?.name ?? "Army"} Detachment`,
          factionId,
          symbolId: faction?.defaultSymbolId,
          dir: preferredDetachmentSpawnDir(
            planet,
            factionId,
            preferCityDir ?? camp.district.dir,
          ),
          notes: "",
          strengthPercent: 100,
        };
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets: s.campaign.planets.map((p) => {
                if (p.id !== planetId) return p;
                const spent = spendBuildingPoints(
                  p,
                  factionId,
                  DETACHMENT_BP_COST,
                );
                return {
                  ...spent,
                  armies: [...(spent.armies ?? []), army],
                };
              }),
            }),
          ),
          selectedArmyId: id,
          selectedCityId: camp.cityId,
          selectedDistrictId: camp.district.id,
          selectedFleetId: null,
          placingArmyId: null,
          playMoveHint: null,
          inspectorOpen: true,
        }));
        return id;
      },

      recruitShip: (planetId, chassis) => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        const factionId = play.activeFactionId;
        if (!factionId) {
          set({ playMoveHint: "No active faction" });
          return null;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const check = canRecruitShip(
          state.campaign,
          planet,
          factionId,
          chassis,
        );
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return null;
        }
        const cost = shipBpCost(chassis);
        const faction = state.campaign.factions.find((f) => f.id === factionId);

        const existing = (state.campaign.fleets ?? []).find(
          (f) =>
            f.factionId === factionId &&
            f.location.kind === "orbit" &&
            f.location.planetId === planetId,
        );

        if (existing) {
          const shipId = crypto.randomUUID();
          const same = existing.ships.filter((s) => s.chassis === chassis)
            .length;
          const ship = { ...createShip(chassis, same + 1), id: shipId };
          set((s) => ({
            ...withCampaign(
              s,
              withHistoryCapture({
                ...s.campaign,
                fleets: (s.campaign.fleets ?? []).map((f) =>
                  f.id === existing.id
                    ? { ...f, ships: [...f.ships, ship] }
                    : f,
                ),
                planets: s.campaign.planets.map((p) =>
                  p.id === planetId
                    ? spendBuildingPoints(p, factionId, cost)
                    : p,
                ),
              }),
            ),
            selectedFleetId: existing.id,
            selectedStructureId: port.id,
            selectedArmyId: null,
            selectedCityId: null,
            selectedDistrictId: null,
            playMoveHint: null,
            inspectorOpen: true,
          }));
          return shipId;
        }

        const fleetId = crypto.randomUUID();
        const shipId = crypto.randomUUID();
        const count = (state.campaign.fleets ?? []).filter(
          (f) => f.factionId === factionId,
        ).length;
        const fleet: Fleet = {
          id: fleetId,
          name: `${faction?.name ?? "Fleet"} ${count + 1}`,
          factionId,
          ships: [{ ...createShip(chassis, 1), id: shipId }],
          location: {
            kind: "orbit",
            systemId: planet.systemId,
            planetId: planet.id,
          },
          notes: "",
        };
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              fleets: [...(s.campaign.fleets ?? []), fleet],
              planets: s.campaign.planets.map((p) =>
                p.id === planetId
                  ? spendBuildingPoints(p, factionId, cost)
                  : p,
              ),
            }),
          ),
          selectedFleetId: fleetId,
          selectedStructureId: port.id,
          selectedArmyId: null,
          selectedCityId: null,
          selectedDistrictId: null,
          playMoveHint: null,
          inspectorOpen: true,
        }));
        return shipId;
      },
    }),
    {
      name: "galaxy-campaign-map",
      version: 3,
      migrate: (persistedState, version) => {
        const p = persistedState as PersistedMaps;
        if (!p) return persistedState;

        if (version < 2) {
          if (p.maps) {
            return {
              ...p,
              maps: migrateMapsToExpandedGalaxy(p.maps),
            };
          }
          if (p.campaign) {
            return {
              ...p,
              campaign: recenterSystemsFromLegacy(p.campaign),
            };
          }
        }
        if (version < 3) {
          if (p.maps) {
            const maps: Record<string, Campaign> = {};
            for (const [id, campaign] of Object.entries(p.maps)) {
              maps[id] = ensureCampaignSettlements(campaign);
            }
            return { ...p, maps };
          }
          if (p.campaign) {
            return {
              ...p,
              campaign: ensureCampaignSettlements(p.campaign),
            };
          }
        }
        return persistedState;
      },
      partialize: (state) => {
        const maps = withCampaign(state, state.campaign, {
          dirty: false,
          skipUndo: true,
        }).maps;
        return {
          maps,
          mapOrder: state.mapOrder,
          activeMapId: state.activeMapId,
        };
      },
      merge: (persistedState, currentState) => {
        const p = persistedState as PersistedMaps | undefined;
        if (!p) return currentState;

        if (p.campaign && !p.maps) {
          const id = crypto.randomUUID();
          const campaign = recenterSystemsFromLegacy(p.campaign);
          const maps = { [id]: campaign };
          return {
            ...currentState,
            maps,
            mapOrder: [id],
            activeMapId: id,
            campaign,
            isDirty: false,
          };
        }

        if (p.maps && p.mapOrder && p.activeMapId) {
          const maps = migrateMapsToExpandedGalaxy(p.maps);
          const campaign =
            maps[p.activeMapId] ??
            maps[p.mapOrder[0]!] ??
            currentState.campaign;
          const activeMapId = maps[p.activeMapId]
            ? p.activeMapId
            : p.mapOrder[0]!;
          return {
            ...currentState,
            maps,
            mapOrder: p.mapOrder,
            activeMapId,
            campaign,
            isDirty: false,
          };
        }

        return currentState;
      },
    },
  ),
);

export function getDominantFactionForSystem(
  campaign: Campaign,
  systemId: string,
): Faction | undefined {
  const ownership = getSystemOwnership(campaign, systemId);
  if (ownership.status === "owned") return ownership.factions[0];
  if (ownership.status === "contested") return ownership.factions[0];
  return undefined;
}
