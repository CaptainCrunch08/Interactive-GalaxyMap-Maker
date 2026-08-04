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
  createCityAtTile,
  createDistrictAtTile,
  createStructureAtTile,
  createStructureOnFreeHex,
  ensurePlanetCities,
  generatePlanetSurface,
  planetOwnerFromCities,
  scrubTileClaims,
  settlementTileSet,
} from "../lib/settlements";
import { normalizeStructureKind } from "../lib/structureMeshes";
import { getCampaignHyperlanes, laneKey } from "../lib/hyperlanes";
import { getSystemOwnership } from "../lib/territory";
import { normalizeStarClass, pickRandomStarClass } from "../lib/stars";
import {
  normalizePlanetClassification,
  pickRandomClassification,
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
import { createShip, isValidFleetMove, normalizeShipChassis } from "../lib/fleets";
import { scrubCharacterPlacements } from "../lib/characterLocation";
import {
  applyStrengthLoss,
  armiesAreAdjacent,
  armyStrength,
  buildBattleRecord,
  classifyBattleVictory,
  classifyVictory,
  combinedForceStrength,
  commanderLabel,
  battleMonumentDir,
  eligibleSupportArmies,
  isArmyDestroyed,
  pruneDestroyedArmies,
  type BattleResolveInput,
  type BattleResolvePending,
} from "../lib/battleResolve";
import { SETTLEMENT_HEX_FREQUENCY } from "../lib/settlements";
import { withHistoryCapture } from "../lib/galaxyHistory";
import {
  applyTurnIncome,
  canBuildManufactorum,
  canPlaceManufactorumAtTile,
  canRecruitDetachment,
  canRecruitShip,
  DETACHMENT_BP_COST,
  MANUFACTORUM_BP_COST,
  ownedCamps,
  ownedSpacePorts,
  shipBpCost,
  spendBuildingPoints,
} from "../lib/buildingPoints";
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
      ships: (f.ships ?? []).map((s) => ({
        ...s,
        chassis: normalizeShipChassis(s.chassis),
      })),
    })),
    characters: campaign.characters ?? [],
    hyperlanes: campaign.hyperlanes,
    factions: enforceUniqueSymbolOwnership(
      campaign.factions.map((f) => ({
        ...f,
        armyType: f.armyType ?? "infantry",
      })),
    ),
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
  | { kind: "structure"; structureKind: StructureKind };

/** Play-mode click-to-build (e.g. manufactorum around a city). */
export type PlayBuildMode =
  | null
  | { kind: "manufactorum"; planetId: string; cityId: string };

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
  /** Contents editor tool: select/drag stars vs draw hyperlanes. */
  galaxyEditorTool: "select" | "connect";
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
  setGalaxyEditorTool: (tool: "select" | "connect") => void;
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
  /** Assign a whole system (and all its planets) to a faction, or clear. */
  setSystemOwner: (systemId: string, factionId: string | null) => void;

  addPlanet: (systemId: string) => string;
  updatePlanet: (id: string, patch: Partial<Planet>) => void;
  deletePlanet: (id: string) => void;
  setPlanetOwner: (planetId: string, factionId: string | null) => void;
  setCityOwner: (
    planetId: string,
    cityId: string,
    factionId: string | null,
  ) => void;
  setDistrictOwner: (
    planetId: string,
    cityId: string,
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
        if (!planet || planet.type === "asteroid_belt") return;
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

      ensureManualHyperlanes: () =>
        set((s) => {
          if (s.campaign.hyperlanes) return s;
          return withCampaign(
            s,
            {
              ...s.campaign,
              hyperlanes: getCampaignHyperlanes(s.campaign),
            },
            { skipUndo: true },
          );
        }),

      addHyperlane: (a, b) => {
        if (a === b) return false;
        const state = get();
        const existing =
          state.campaign.hyperlanes ?? getCampaignHyperlanes(state.campaign);
        const id = laneKey(a, b);
        if (
          existing.some(
            (l) =>
              l.id === id ||
              (l.a === a && l.b === b) ||
              (l.a === b && l.b === a),
          )
        ) {
          return false;
        }
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            hyperlanes: [
              ...(s.campaign.hyperlanes ?? getCampaignHyperlanes(s.campaign)),
              { id, a, b },
            ],
          }),
        );
        return true;
      },

      removeHyperlane: (laneId) => {
        set((s) => {
          const lanes =
            s.campaign.hyperlanes ?? getCampaignHyperlanes(s.campaign);
          return withCampaign(s, {
            ...s.campaign,
            hyperlanes: lanes.filter((l) => l.id !== laneId),
          });
        });
      },

      resetHyperlanesToAuto: () =>
        set((s) => {
          const campaign = { ...s.campaign };
          delete campaign.hyperlanes;
          return {
            ...withCampaign(s, campaign),
            hyperlaneConnectFromId: null,
          };
        }),

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
          ...withCampaign(s, {
            ...s.campaign,
            systems: [...s.campaign.systems, system],
          }),
          selectedSystemId: id,
        }));
        return id;
      },

      updateSystem: (id, patch) =>
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
        ),

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
          const nextCampaign = {
            ...s.campaign,
            systems: s.campaign.systems.filter((sys) => sys.id !== id),
            planets: s.campaign.planets.filter((p) => p.systemId !== id),
            fleets: (s.campaign.fleets ?? []).filter(
              (f) => f.location.systemId !== id,
            ),
            hyperlanes: s.campaign.hyperlanes
              ? s.campaign.hyperlanes.filter((l) => l.a !== id && l.b !== id)
              : undefined,
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

      setSystemOwner: (systemId, factionId) =>
        set((s) => {
          const owner = factionId || undefined;
          return withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              systems: s.campaign.systems.map((sys) =>
                sys.id === systemId
                  ? { ...sys, controllingFactionId: owner }
                  : sys,
              ),
              planets: s.campaign.planets.map((p) =>
                p.systemId === systemId
                  ? {
                      ...p,
                      controllingFactionId: owner,
                      cities: assignAllDistricts(p.cities ?? [], owner ?? null),
                      structures: assignAllStructures(
                        p.structures ?? [],
                        owner ?? null,
                      ),
                    }
                  : p,
              ),
            }),
          );
        }),

      addPlanet: (systemId) => {
        const id = crypto.randomUUID();
        const existing = get().campaign.planets.filter(
          (p) => p.systemId === systemId,
        );
        const system = get().campaign.systems.find((s) => s.id === systemId);
        const { cities, structures } = generatePlanetSurface(id, "custom", {
          defaultFactionId: system?.controllingFactionId,
        });
        const classification =
          pickRandomClassification() as PlanetClassification;
        const planet: Planet = {
          id,
          systemId,
          name: `Planet ${existing.length + 1}`,
          orbitIndex: existing.length,
          type: "custom" as PlanetType,
          classification,
          visualModelId: pickPlanetVisualModel(classification),
          controllingFactionId:
            planetOwnerFromCities(cities, undefined, structures) ??
            system?.controllingFactionId,
          notes: "",
          battles: [],
          cities,
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
            return next;
          });
          const planet = planets.find((p) => p.id === id);
          let systems = s.campaign.systems;
          if (planet && "controllingFactionId" in patch) {
            const ids = new Set(
              planets
                .filter(
                  (p) =>
                    p.systemId === planet.systemId && p.controllingFactionId,
                )
                .map((p) => p.controllingFactionId!),
            );
            systems = s.campaign.systems.map((sys) =>
              sys.id === planet.systemId
                ? {
                    ...sys,
                    controllingFactionId:
                      ids.size === 1 ? [...ids][0] : undefined,
                  }
                : sys,
            );
          }
          return withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets, systems }),
            { coalesceKey: `planet:${id}` },
          );
        }),

      setPlanetOwner: (planetId, factionId) => {
        const owner = factionId || undefined;
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return;
        get().updatePlanet(planetId, {
          controllingFactionId: owner,
          cities: assignAllDistricts(planet.cities ?? [], factionId),
          structures: assignAllStructures(planet.structures ?? [], factionId),
        });
      },

      setCityOwner: (planetId, cityId, factionId) =>
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const cities = p.cities.map((c) =>
              c.id === cityId
                ? {
                    ...c,
                    controllingFactionId: factionId || undefined,
                    districts: c.districts.map((d) => ({
                      ...d,
                      controllingFactionId: factionId || undefined,
                    })),
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
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets }),
          );
        }),

      setDistrictOwner: (planetId, cityId, districtId, factionId) =>
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const cities = p.cities.map((c) =>
              c.id === cityId
                ? {
                    ...c,
                    districts: c.districts.map((d) =>
                      d.id === districtId
                        ? {
                            ...d,
                            controllingFactionId: factionId || undefined,
                          }
                        : d,
                    ),
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
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets }),
          );
        }),

      setStructureOwner: (planetId, structureId, factionId) =>
        set((s) => {
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
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets }),
          );
        }),

      setTileClaims: (planetId, claims) =>
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const occupied = settlementTileSet(
              p.cities ?? [],
              p.structures ?? [],
            );
            const next = { ...(p.tileClaims ?? {}) };
            for (const [key, factionId] of Object.entries(claims)) {
              const tileIndex = Number(key);
              if (occupied.has(tileIndex)) continue;
              if (factionId) next[String(tileIndex)] = factionId;
              else delete next[String(tileIndex)];
            }
            const tileClaims = scrubTileClaims(
              next,
              p.cities ?? [],
              p.structures ?? [],
            );
            return {
              ...p,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                p.cities ?? [],
                tileClaims,
                p.structures ?? [],
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets }),
          );
        }),

      clearOpenTileClaims: (planetId) =>
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            return {
              ...p,
              tileClaims: {},
              controllingFactionId: planetOwnerFromCities(
                p.cities ?? [],
                {},
                p.structures ?? [],
              ),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets }),
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

      buildManufactorumAtTile: (planetId, cityId, tileIndex) => {
        const state = get();
        const play = normalizeCampaignPlay(state.campaign.play);
        const factionId = play.activeFactionId;
        if (!factionId) {
          set({ playMoveHint: "No active faction" });
          return null;
        }
        const planet = state.campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const check = canBuildManufactorum(
          state.campaign,
          planet,
          factionId,
          cityId,
        );
        if (!check.ok) {
          set({ playMoveHint: check.message });
          return null;
        }
        const placeErr = canPlaceManufactorumAtTile(
          planet,
          check.city,
          tileIndex,
        );
        if (placeErr) {
          set({ playMoveHint: placeErr });
          return null;
        }
        const result = createDistrictAtTile(
          planet,
          cityId,
          tileIndex,
          "manufactorum",
          { controllingFactionId: factionId },
        );
        if (!result) {
          set({ playMoveHint: "Could not place manufactorum" });
          return null;
        }
        const newDistrict = result.cities
          .find((c) => c.id === cityId)
          ?.districts.slice(-1)[0];
        if (!newDistrict) return null;
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              planets: s.campaign.planets.map((p) => {
                if (p.id !== planetId) return p;
                const spent = spendBuildingPoints(
                  { ...p, cities: result.cities },
                  factionId,
                  MANUFACTORUM_BP_COST,
                );
                return {
                  ...spent,
                  cities: result.cities,
                  tileClaims: scrubTileClaims(
                    spent.tileClaims,
                    result.cities,
                    spent.structures ?? [],
                  ),
                };
              }),
            }),
          ),
          selectedCityId: cityId,
          selectedDistrictId: newDistrict.id,
          selectedStructureId: null,
          playBuildMode: null,
          playMoveHint: null,
          inspectorOpen: true,
        }));
        return newDistrict.id;
      },

      addCityAtTile: (planetId, tileIndex) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return null;
        const city = createCityAtTile(planet, tileIndex);
        if (!city) return null;
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            const cities = [...(p.cities ?? []), city];
            return {
              ...p,
              cities,
              tileClaims: scrubTileClaims(
                p.tileClaims,
                cities,
                p.structures ?? [],
              ),
            };
          });
          return {
            ...withCampaign(s, { ...s.campaign, planets }),
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
        const result = createDistrictAtTile(
          planet,
          cityId,
          tileIndex,
          districtKind,
        );
        if (!result) return null;
        const newDistrict = result.cities
          .find((c) => c.id === cityId)
          ?.districts.slice(-1)[0];
        if (!newDistrict) return null;
        set((s) => {
          const planets = s.campaign.planets.map((p) => {
            if (p.id !== planetId) return p;
            return {
              ...p,
              cities: result.cities,
              tileClaims: scrubTileClaims(
                p.tileClaims,
                result.cities,
                p.structures ?? [],
              ),
            };
          });
          return {
            ...withCampaign(s, { ...s.campaign, planets }),
            selectedCityId: cityId,
            selectedDistrictId: newDistrict.id,
            selectedStructureId: null,
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
        set((s) => ({
          ...withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    structures: [...(p.structures ?? []), structure],
                    tileClaims: scrubTileClaims(p.tileClaims, p.cities ?? [], [
                      ...(p.structures ?? []),
                      structure,
                    ]),
                  }
                : p,
            ),
          }),
          selectedStructureId: structure.id,
          selectedCityId: null,
          selectedDistrictId: null,
        }));
        return structure.id;
      },

      regenerateSettlements: (planetId) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          const rival = s.campaign.factions.find(
            (f) => f.id !== planet.controllingFactionId,
          )?.id;
          const { cities, structures } = generatePlanetSurface(
            planet.id,
            planet.type,
            {
              defaultFactionId: planet.controllingFactionId,
              rivalFactionId: rival,
              contestedRate: rival ? 0.35 : 0,
            },
          );
          const tileClaims = scrubTileClaims(
            planet.tileClaims,
            cities,
            structures,
          );
          const planets = s.campaign.planets.map((p) =>
            p.id === planetId
              ? {
                  ...p,
                  cities,
                  structures,
                  tileClaims,
                  controllingFactionId:
                    planetOwnerFromCities(cities, tileClaims, structures) ??
                    p.controllingFactionId,
                }
              : p,
          );
          return {
            ...withCampaign(s, { ...s.campaign, planets }),
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
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    structures: [...(p.structures ?? []), structure],
                    tileClaims: scrubTileClaims(p.tileClaims, p.cities ?? [], [
                      ...(p.structures ?? []),
                      structure,
                    ]),
                  }
                : p,
            ),
          }),
        );
        return structure.id;
      },

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
        const city = planet?.cities?.[0];
        const army: Army = {
          id,
          name: `${faction?.name ?? "Army"} Detachment`,
          factionId,
          symbolId: faction?.defaultSymbolId,
          dir: city?.dir ?? { x: 0, y: 1, z: 0 },
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
        const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
        const fromTile = nearestTileIndex(sphere, army.dir);
        const toTile = nearestTileIndex(sphere, dir);
        const distance = hexTileDistance(sphere, fromTile, toTile);

        // Accidental same-hex drop — keep remaining movement.
        if (distance === 0) {
          set({ playMoveHint: null });
          return true;
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
        if (
          !armiesAreAdjacent(
            attacker,
            defender,
            buildHexSphere(SETTLEMENT_HEX_FREQUENCY),
          )
        ) {
          set({
            playMoveHint:
              "Target must be on the same or an adjacent hex to engage",
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

        const eligibleAtk = eligibleSupportArmies(
          planet.armies,
          attacker,
          defender.id,
          sphere,
          acted,
        );
        const eligibleDef = eligibleSupportArmies(
          planet.armies,
          defender,
          attacker.id,
          sphere,
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

        const attackerCombined = combinedForceStrength(
          attacker,
          attackerSupports,
        );
        const defenderCombined = combinedForceStrength(
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
          const monumentDir = battleMonumentDir(attacker, defender);
          const monumentTile = nearestTileIndex(sphere, monumentDir);
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
                      ship.id === shipId ? { ...ship, ...patch } : ship,
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
          const remaining = s.campaign.planets
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
          armyType: "infantry",
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
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            factions: s.campaign.factions.filter((f) => f.id !== id),
            fleets: (s.campaign.fleets ?? []).filter((f) => f.factionId !== id),
            characters: (s.campaign.characters ?? []).map((c) =>
              c.factionId === id ? { ...c, factionId: undefined } : c,
            ),
            planets: s.campaign.planets.map((p) => ({
              ...p,
              controllingFactionId:
                p.controllingFactionId === id
                  ? undefined
                  : p.controllingFactionId,
              cities: (p.cities ?? []).map((c) => ({
                ...c,
                districts: c.districts.map((d) =>
                  d.controllingFactionId === id
                    ? { ...d, controllingFactionId: undefined }
                    : d,
                ),
              })),
              structures: (p.structures ?? []).map((st) =>
                st.controllingFactionId === id
                  ? { ...st, controllingFactionId: undefined }
                  : st,
              ),
              armies: (p.armies ?? []).filter((a) => a.factionId !== id),
            })),
          }),
        ),

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
          });
          if (nextFactionId) {
            campaign = applyTurnIncome(campaign, nextFactionId);
          }
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
            playMoveHint: null,
          };
        });
      },

      clearPlayMoveHint: () => set({ playMoveHint: null }),

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
        const id = crypto.randomUUID();
        const army: Army = {
          id,
          name: `${faction?.name ?? "Army"} Detachment`,
          factionId,
          symbolId: faction?.defaultSymbolId,
          dir: { ...camp.district.dir },
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
        const ports = ownedSpacePorts(planet, factionId);
        const port = ports[0]!;
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
