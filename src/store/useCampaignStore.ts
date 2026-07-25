import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDemoCampaign, createEmptyCampaign } from "../lib/seed";
import {
  generateGalaxyCampaign,
  type GalaxySize,
} from "../lib/generateGalaxy";
import {
  assignAllDistricts,
  ensurePlanetCities,
  generatePlanetCities,
  planetOwnerFromCities,
  scrubTileClaims,
  settlementTileSet,
} from "../lib/settlements";
import { getSystemOwnership } from "../lib/territory";
import type {
  Army,
  ArmySymbol,
  BattleEntry,
  Campaign,
  Faction,
  Fleet,
  FleetLocation,
  Planet,
  PlanetType,
  Ship,
  ShipChassis,
  SphereDir,
  StarSystem,
  TimelineEvent,
  ViewLevel,
} from "../types/campaign";
import { createShip, isValidFleetMove } from "../lib/fleets";
import { withHistoryCapture } from "../lib/galaxyHistory";
import {
  campaignMapSize,
  GALAXY_EDGE_PADDING,
  GALAXY_SIZE_LEGACY,
  GALAXY_WIDTH,
} from "../types/campaign";

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
    selectedArmyId: null,
    placingArmyId: null,
    selectedFleetId: null,
    fleetMoveModeId: null,
    terrainPaintFactionId: null,
    editMode: false,
  };
}

function withCampaign(state: CampaignState, campaign: Campaign) {
  return {
    campaign,
    maps: { ...state.maps, [state.activeMapId]: campaign },
  };
}

function ensureCampaignSettlements(campaign: Campaign): Campaign {
  const rivalFor = (planet: Planet) =>
    campaign.factions.find((f) => f.id !== planet.controllingFactionId)?.id;
  return {
    ...campaign,
    symbols: campaign.symbols ?? [],
    fleets: campaign.fleets ?? [],
    timeline: {
      frames: campaign.timeline?.frames ?? [],
      events: campaign.timeline?.events ?? [],
    },
    planets: campaign.planets.map((p) =>
      ensurePlanetCities(
        { ...p, cities: p.cities ?? [], armies: p.armies ?? [] },
        {
          defaultFactionId: p.controllingFactionId,
          rivalFactionId: rivalFor(p),
          contestedRate: rivalFor(p) ? 0.3 : 0,
        },
      ),
    ),
  };
}

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
  editMode: boolean;

  toggleSideMenu: () => void;
  toggleInspector: () => void;
  createMap: (options?: {
    kind: "empty" | "generated";
    size?: GalaxySize;
  }) => void;
  switchMap: (mapId: string) => void;
  deleteMap: (mapId: string) => void;

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

  selectSystem: (systemId: string | null) => void;
  selectPlanet: (planetId: string | null) => void;
  selectSettlement: (
    cityId: string | null,
    districtId?: string | null,
  ) => void;

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
  setTileClaims: (
    planetId: string,
    claims: Record<number, string | null>,
  ) => void;
  clearOpenTileClaims: (planetId: string) => void;
  setTerrainPaintFaction: (factionId: string | null) => void;
  regenerateSettlements: (planetId: string) => void;

  addSymbol: (name: string, imageDataUrl: string) => string;
  updateSymbol: (id: string, patch: Partial<ArmySymbol>) => void;
  deleteSymbol: (id: string) => void;

  addArmy: (planetId: string, factionId: string) => string;
  updateArmy: (
    planetId: string,
    armyId: string,
    patch: Partial<Army>,
  ) => void;
  deleteArmy: (planetId: string, armyId: string) => void;
  moveArmy: (planetId: string, armyId: string, dir: SphereDir) => void;
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

  addBattle: (planetId: string) => string;
  updateBattle: (
    planetId: string,
    battleId: string,
    patch: Partial<BattleEntry>,
  ) => void;
  deleteBattle: (planetId: string, battleId: string) => void;
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
      selectedArmyId: null,
      placingArmyId: null,
      selectedFleetId: null,
      fleetMoveModeId: null,
      terrainPaintFactionId: null,
      editMode: false,

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
          maps: { ...s.maps, [id]: campaign },
          mapOrder: [...s.mapOrder, id],
          activeMapId: id,
          campaign,
          ...clearNavigationState(),
        }));
      },

      switchMap: (mapId) => {
        const state = get();
        if (mapId === state.activeMapId || !state.maps[mapId]) return;
        const maps = withCampaign(state, state.campaign).maps;
        set({
          maps,
          activeMapId: mapId,
          campaign: maps[mapId],
          ...clearNavigationState(),
        });
      },

      deleteMap: (mapId) => {
        const state = get();
        if (state.mapOrder.length <= 1 || !state.maps[mapId]) return;
        const maps = { ...withCampaign(state, state.campaign).maps };
        delete maps[mapId];
        const mapOrder = state.mapOrder.filter((id) => id !== mapId);
        if (state.activeMapId === mapId) {
          const activeMapId = mapOrder[mapOrder.length - 1]!;
          set({
            maps,
            mapOrder,
            activeMapId,
            campaign: maps[activeMapId],
            ...clearNavigationState(),
          });
        } else {
          set({ maps, mapOrder });
        }
      },

      setCampaignName: (name) =>
        set((s) => withCampaign(s, { ...s.campaign, name })),

      importCampaign: (campaign) =>
        set((s) => ({
          ...withCampaign(s, ensureCampaignSettlements(campaign)),
          ...clearNavigationState(),
        })),

      resetToDemo: () =>
        set((s) => ({
          ...withCampaign(s, createDemoCampaign()),
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
          set({ viewLevel: "planet" });
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
            selectedArmyId: null,
            placingArmyId: null,
            terrainPaintFactionId: null,
            inspectorOpen: true,
          };
        });
      },

      enterStrategic: (planetId) => {
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return;
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
            selectedArmyId: null,
            placingArmyId: null,
            terrainPaintFactionId: null,
          });
        }
      },

      setEditMode: (editMode) => set({ editMode }),
      toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),

      selectSystem: (systemId) =>
        set({
          selectedSystemId: systemId,
          selectedPlanetId: null,
          selectedCityId: null,
          selectedDistrictId: null,
        }),

      selectPlanet: (planetId) => set({ selectedPlanetId: planetId }),

      selectSettlement: (cityId, districtId = null) =>
        set({
          selectedCityId: cityId,
          selectedDistrictId: districtId ?? null,
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
          withCampaign(s, {
            ...s.campaign,
            systems: s.campaign.systems.map((sys) =>
              sys.id === id ? { ...sys, ...patch } : sys,
            ),
          }),
        ),

      moveSystem: (id, x, y) => {
        const size = campaignMapSize(get().campaign);
        get().updateSystem(id, {
          x: clampGalaxyCoord(x, size),
          y: clampGalaxyCoord(y, size),
        });
      },

      deleteSystem: (id) =>
        set((s) => ({
          ...withCampaign(s, {
            ...s.campaign,
            systems: s.campaign.systems.filter((sys) => sys.id !== id),
            planets: s.campaign.planets.filter((p) => p.systemId !== id),
            fleets: (s.campaign.fleets ?? []).filter(
              (f) => f.location.systemId !== id,
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
          viewLevel:
            s.focusedSystemId === id && s.viewLevel !== "galaxy"
              ? "galaxy"
              : s.viewLevel,
        })),

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
        const cities = generatePlanetCities(id, "custom", {
          defaultFactionId: system?.controllingFactionId,
        });
        const planet: Planet = {
          id,
          systemId,
          name: `Planet ${existing.length + 1}`,
          orbitIndex: existing.length,
          type: "custom" as PlanetType,
          controllingFactionId:
            planetOwnerFromCities(cities) ?? system?.controllingFactionId,
          notes: "",
          battles: [],
          cities,
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
          const planets = s.campaign.planets.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          );
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
          );
        }),

      setPlanetOwner: (planetId, factionId) => {
        const owner = factionId || undefined;
        const planet = get().campaign.planets.find((p) => p.id === planetId);
        if (!planet) return;
        get().updatePlanet(planetId, {
          controllingFactionId: owner,
          cities: assignAllDistricts(planet.cities ?? [], factionId),
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
            const occupied = settlementTileSet(p.cities ?? []);
            const next = { ...(p.tileClaims ?? {}) };
            for (const [key, factionId] of Object.entries(claims)) {
              const tileIndex = Number(key);
              if (occupied.has(tileIndex)) continue;
              if (factionId) next[String(tileIndex)] = factionId;
              else delete next[String(tileIndex)];
            }
            const tileClaims = scrubTileClaims(next, p.cities ?? []);
            return {
              ...p,
              tileClaims,
              controllingFactionId: planetOwnerFromCities(
                p.cities ?? [],
                tileClaims,
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
              controllingFactionId: planetOwnerFromCities(p.cities ?? [], {}),
            };
          });
          return withCampaign(
            s,
            withHistoryCapture({ ...s.campaign, planets }),
          );
        }),

      setTerrainPaintFaction: (factionId) =>
        set((s) => ({
          terrainPaintFactionId: factionId,
          placingArmyId: factionId != null ? null : s.placingArmyId,
        })),

      regenerateSettlements: (planetId) =>
        set((s) => {
          const planet = s.campaign.planets.find((p) => p.id === planetId);
          if (!planet) return s;
          const rival = s.campaign.factions.find(
            (f) => f.id !== planet.controllingFactionId,
          )?.id;
          const cities = generatePlanetCities(planet.id, planet.type, {
            defaultFactionId: planet.controllingFactionId,
            rivalFactionId: rival,
            contestedRate: rival ? 0.35 : 0,
          });
          const tileClaims = scrubTileClaims(planet.tileClaims, cities);
          const planets = s.campaign.planets.map((p) =>
            p.id === planetId
              ? {
                  ...p,
                  cities,
                  tileClaims,
                  controllingFactionId:
                    planetOwnerFromCities(cities, tileClaims) ??
                    p.controllingFactionId,
                }
              : p,
          );
          return {
            ...withCampaign(s, { ...s.campaign, planets }),
            selectedCityId: null,
            selectedDistrictId: null,
          };
        }),

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
            factions: s.campaign.factions.map((f) =>
              f.defaultSymbolId === id
                ? { ...f, defaultSymbolId: undefined }
                : f,
            ),
            planets: s.campaign.planets.map((p) => ({
              ...p,
              armies: (p.armies ?? []).map((a) =>
                a.symbolId === id ? { ...a, symbolId: undefined } : a,
              ),
            })),
          }),
        ),

      addArmy: (planetId, factionId) => {
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
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    armies: (p.armies ?? []).map((a) =>
                      a.id === armyId ? { ...a, ...patch } : a,
                    ),
                  }
                : p,
            ),
          }),
        ),

      deleteArmy: (planetId, armyId) =>
        set((s) => ({
          ...withCampaign(s, {
            ...s.campaign,
            planets: s.campaign.planets.map((p) =>
              p.id === planetId
                ? {
                    ...p,
                    armies: (p.armies ?? []).filter((a) => a.id !== armyId),
                  }
                : p,
            ),
          }),
          selectedArmyId:
            s.selectedArmyId === armyId ? null : s.selectedArmyId,
          placingArmyId:
            s.placingArmyId === armyId ? null : s.placingArmyId,
        })),

      moveArmy: (planetId, armyId, dir) =>
        get().updateArmy(planetId, armyId, { dir }),

      selectArmy: (armyId) =>
        set({
          selectedArmyId: armyId,
          selectedFleetId: null,
          fleetMoveModeId: null,
          selectedCityId: null,
          selectedDistrictId: null,
          inspectorOpen: true,
        }),

      setPlacingArmy: (armyId) =>
        set((s) => ({
          placingArmyId: armyId,
          terrainPaintFactionId:
            armyId != null ? null : s.terrainPaintFactionId,
          fleetMoveModeId: armyId != null ? null : s.fleetMoveModeId,
        })),

      addFleet: (systemId, factionId) => {
        const id = crypto.randomUUID();
        const faction = get().campaign.factions.find((f) => f.id === factionId);
        const count = (get().campaign.fleets ?? []).filter(
          (f) => f.factionId === factionId,
        ).length;
        const fleet: Fleet = {
          id,
          name: `${faction?.name ?? "Fleet"} ${count + 1}`,
          factionId,
          ships: [
            createShip("corvette", 1),
            createShip("corvette", 2),
            createShip("destroyer", 1),
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
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              fleets: (s.campaign.fleets ?? []).filter((f) => f.id !== fleetId),
            }),
          ),
          selectedFleetId:
            s.selectedFleetId === fleetId ? null : s.selectedFleetId,
          fleetMoveModeId:
            s.fleetMoveModeId === fleetId ? null : s.fleetMoveModeId,
        })),

      addShip: (fleetId, chassis) => {
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
        if (!isValidFleetMove(state.campaign, fleet, location)) return false;
        const nextLocation: FleetLocation =
          location.systemId !== fleet.location.systemId
            ? { kind: "system", systemId: location.systemId }
            : location;
        set((s) => ({
          ...withCampaign(
            s,
            withHistoryCapture({
              ...s.campaign,
              fleets: (s.campaign.fleets ?? []).map((f) =>
                f.id === fleetId ? { ...f, location: nextLocation } : f,
              ),
            }),
          ),
          fleetMoveModeId: null,
          selectedFleetId: fleetId,
        }));
        return true;
      },

      selectFleet: (fleetId) =>
        set({
          selectedFleetId: fleetId,
          selectedArmyId: null,
          selectedCityId: null,
          selectedDistrictId: null,
          placingArmyId: null,
          inspectorOpen: true,
        }),

      setFleetMoveMode: (fleetId) =>
        set((s) => ({
          fleetMoveModeId: fleetId,
          placingArmyId: fleetId != null ? null : s.placingArmyId,
          terrainPaintFactionId:
            fleetId != null ? null : s.terrainPaintFactionId,
          selectedFleetId: fleetId ?? s.selectedFleetId,
        })),

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
          return {
            ...withCampaign(s, { ...s.campaign, planets: remaining, fleets }),
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
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            factions: s.campaign.factions.map((f) =>
              f.id === id ? { ...f, ...patch } : f,
            ),
          }),
        ),

      deleteFaction: (id) =>
        set((s) =>
          withCampaign(s, {
            ...s.campaign,
            factions: s.campaign.factions.filter((f) => f.id !== id),
            fleets: (s.campaign.fleets ?? []).filter((f) => f.factionId !== id),
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
              armies: (p.armies ?? []).filter((a) => a.factionId !== id),
            })),
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
        const maps = withCampaign(state, state.campaign).maps;
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
