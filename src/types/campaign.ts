export type ViewLevel = "galaxy" | "system" | "planet" | "strategic" | "timeline";

export type PlanetType =
  | "hive"
  | "forge"
  | "agri"
  | "death"
  | "shrine"
  | "feudal"
  | "fortress"
  | "homeworld"
  | "trade"
  | "mining"
  | "archaeological"
  | "abandoned_colony"
  | "asteroid_belt"
  | "warp_gate"
  | "custom";

/**
 * Climate / environment class of a world (separate from role type like Hive/Forge).
 */
export type PlanetClassification =
  | "ice"
  | "tundra"
  | "water"
  | "islands"
  | "jungle"
  | "earthlike"
  | "super_earth"
  | "desert"
  | "arid"
  | "savannah"
  | "swamp"
  | "volcanic"
  | "magma"
  | "toxic"
  | "barren"
  | "gas_giant"
  | "tidally_locked";

export type DistrictKind =
  | "spire"
  | "underhive"
  | "domed_habitat"
  | "docks"
  | "bastion"
  | "manufactorum"
  | "camp"
  | "cathedral"
  | "reliquary"
  | "ruins"
  | "supply_station";

/**
 * Standalone surface structures (not nested under cities).
 * World type drives which kinds appear on a planet.
 */
export type StructureKind =
  | "space_port"
  | "ore_mine"
  | "trench_line"
  | "relay"
  | "relay_crown"
  | "outpost"
  | "ruins_site"
  | "supply_network";

export interface Faction {
  id: string;
  name: string;
  color: string;
  /** Named commander / sovereign shown in Galactic Overview. */
  leader?: string;
  /** Short tagline under the faction name on the dossier. */
  epithet?: string;
  /** Origin lore for the faction dossier. */
  origin?: string;
  /** Purpose / mission lore for the faction dossier. */
  purpose?: string;
  /** Present condition / outlook for the faction dossier. */
  standing?: string;
  /**
   * Primary emblem for the faction as a whole
   * (also used as default for new detachments / fleets).
   */
  defaultSymbolId?: string;
  /** All symbols owned by this faction (includes primary). Unique across factions. */
  symbolIds?: string[];
}

/** Alive / lost / deceased status for encyclopedia characters. */
export type CharacterStatus = "alive" | "lost" | "deceased";

/**
 * Where a character currently is (or was last known to be).
 * Fleet / detachment take precedence over bare system / planet.
 */
export type CharacterPlacement =
  | { kind: "unknown" }
  | { kind: "system"; systemId: string }
  | { kind: "planet"; systemId: string; planetId: string }
  | { kind: "fleet"; fleetId: string }
  | { kind: "army"; planetId: string; armyId: string };

/**
 * Named character tracked in Galactic Overview → Characters.
 */
export interface CampaignCharacter {
  id: string;
  name: string;
  /** Optional alias / callsign shown under the name. */
  nickname?: string;
  /** Rank / role line under the name (e.g. "Captain of the 4th Company"). */
  title: string;
  /** Optional link to a map faction. */
  factionId?: string;
  /**
   * Extra org / chapter / regiment shown before the faction
   * (e.g. "Blood Angels", "Cadian 117th Scout Platoon").
   */
  affiliation?: string;
  status: CharacterStatus;
  /** Structured map placement (system → planet → fleet / detachment). */
  placement?: CharacterPlacement;
  /** Display / last-known location (derived from placement when set). */
  location: string;
  /** Description and background lore for the character sheet. */
  background?: string;
  /** @deprecated Prefer `background`. Kept for older saves. */
  notes?: string;
}

/** Imported / assigned army icon (stored as a data URL). */
export interface ArmySymbol {
  id: string;
  name: string;
  imageDataUrl: string;
}

/** Manual or auto-baked hyperlane between two systems. */
export interface CampaignHyperlane {
  id: string;
  a: string;
  b: string;
}

/**
 * Incremental hyperlane edits over a base graph (baked `hyperlanes` or live auto).
 * Prefer baking a sticky network; edits remain supported for older saves.
 */
export interface HyperlaneEdits {
  /** Extra lanes the user drew (kept even if the base graph would not include them). */
  added: CampaignHyperlane[];
  /** Base lane keys (`laneKey`) the user deleted — stay suppressed. */
  removed: string[];
}

/** Force on a planet surface — shown as symbol + name label. */
export interface Army {
  id: string;
  name: string;
  factionId: string;
  symbolId?: string;
  dir: SphereDir;
  notes: string;
  /**
   * Remaining combat effectiveness (0–100). Full strength = 100.
   * Reduced by tabletop battle losses; 0 destroys the detachment.
   */
  strengthPercent?: number;
}

/** How a resolved tabletop engagement ended. */
export type VictoryKind =
  | "decisive"
  | "major"
  | "minor"
  | "pyrrhic"
  | "draw"
  | "heroic"
  | "epochal";

/**
 * Permanent map monument for a Heroic or Epochal victory
 * (Total War–style “site of a famous battle”).
 */
export interface FamousBattleSite {
  id: string;
  /** Linked battle log entry on this planet. */
  battleId: string;
  tileIndex: number;
  dir: SphereDir;
  tier: "heroic" | "epochal";
  date: string;
  attackerCommander: string;
  defenderCommander: string;
  /** Combined force STR deployed by the attacker. */
  attackerForceStrength: number;
  /** Combined force STR deployed by the defender. */
  defenderForceStrength: number;
  attackerVp: number;
  defenderVp: number;
  victorFactionId: string;
  victorLabel: string;
}

export interface BattleEntry {
  id: string;
  date: string;
  summary: string;
  outcome: string;
  /** Structured fight result (absent on older narrative-only entries). */
  attackerFactionId?: string;
  defenderFactionId?: string;
  attackerArmyId?: string;
  defenderArmyId?: string;
  attackerSupportArmyIds?: string[];
  defenderSupportArmyIds?: string[];
  attackerVp?: number;
  defenderVp?: number;
  attackerCasualties?: number;
  defenderCasualties?: number;
  attackerStrengthLostPct?: number;
  defenderStrengthLostPct?: number;
  victoryKind?: VictoryKind;
  /** Winning faction id, or null/omit on a draw. */
  victorFactionId?: string | null;
  /** Characters killed in this engagement (encyclopedia deceased). */
  killedCharacterIds?: string[];
}

/** Surface fight vs void fight for the galactic battle chronicle. */
export type BattleTheater = "planetary" | "space";

/**
 * Campaign-wide battle log entry (Galactic Overview → Battles).
 * Planetary resolves also keep a copy on `Planet.battles`.
 */
export interface CampaignBattleLogEntry extends BattleEntry {
  theater: BattleTheater;
  planetId?: string;
  systemId?: string;
  /** Human-readable place (planet · system, or system for space). */
  locationLabel: string;
  attackerFleetId?: string;
  defenderFleetId?: string;
}

export type GalaxyOverviewTab =
  | "strategic"
  | "factions"
  | "planets"
  | "characters"
  | "battles";

export const BATTLE_THEATER_LABELS: Record<BattleTheater, string> = {
  planetary: "Planetary",
  space: "Space",
};

/** Imperial Navy–style ship hull class. */
export type ShipChassis =
  | "escort"
  | "transport"
  | "light_cruiser"
  | "cruiser"
  | "battlecruiser"
  | "grand_cruiser"
  | "battleship";

export interface Ship {
  id: string;
  name: string;
  chassis: ShipChassis;
  notes: string;
  /**
   * Building points stored in the hold (transports only).
   * Capped at TRANSPORT_BP_CAPACITY; ignored for other chassis.
   */
  cargoBp?: number;
}

/** At the system star, or parked in a planet's orbit. */
export type FleetLocation =
  | { kind: "system"; systemId: string }
  | { kind: "orbit"; systemId: string; planetId: string };

/** Space force that travels between systems and orbits. */
export interface Fleet {
  id: string;
  name: string;
  factionId: string;
  /** Optional emblem from the faction's symbol roster. */
  symbolId?: string;
  ships: Ship[];
  location: FleetLocation;
  notes: string;
}

/** Main-sequence and exotic stellar types for map visuals. */
export type StarClass =
  | "O"
  | "B"
  | "A"
  | "F"
  | "G"
  | "K"
  | "M"
  | "white_dwarf"
  | "neutron"
  | "pulsar"
  | "black_hole";

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  notes: string;
  /**
   * Spectral / exotic core classification (visual).
   * When `dysonSphere` is set, this is the star (or black hole) inside the shell.
   */
  starClass: StarClass;
  /**
   * Power megastructure around the core. Required for warp gates.
   * Around luminous stars this is a Dyson Sphere (starlight collectors);
   * around a black hole it is a Black Hole Bomb (superradiant mirrors).
   */
  dysonSphere?: boolean;
  /** Primary system owner; planets may diverge (contested). */
  controllingFactionId?: string;
}

/** Unit direction on the planet sphere (for 3D placement). */
export interface SphereDir {
  x: number;
  y: number;
  z: number;
}

export interface District {
  id: string;
  name: string;
  kind: DistrictKind;
  controllingFactionId?: string;
  /** Hex tile this district occupies (unique on the planet). */
  tileIndex: number;
  /** Cached sphere direction of the tile center. */
  dir: SphereDir;
  notes: string;
}

export interface City {
  id: string;
  name: string;
  /** Hub hex tile for this city (unique on the planet). */
  tileIndex: number;
  controllingFactionId?: string;
  /** Cached sphere direction of the hub tile center. */
  dir: SphereDir;
  districts: District[];
  notes: string;
}

/** Independent surface structure placed on its own hex. */
export interface PlanetStructure {
  id: string;
  name: string;
  kind: StructureKind;
  tileIndex: number;
  dir: SphereDir;
  controllingFactionId?: string;
  notes: string;
}

export interface Planet {
  id: string;
  systemId: string;
  name: string;
  orbitIndex: number;
  type: PlanetType;
  /**
   * User-defined label when `type === "custom"` (e.g. "Forge-Agri Hybrid").
   * Shown in place of the generic "Custom" type name.
   */
  customTypeLabel?: string;
  /** Climate / environment (ignored for asteroid belts). */
  classification: PlanetClassification;
  /**
   * Procedural portrait globe preset for this climate class
   * (e.g. `earthlike_2`). Assigned on generation; optional for old saves.
   */
  visualModelId?: string;
  controllingFactionId?: string;
  /**
   * Linked warp-gate planet id (bidirectional). Only for `type === "warp_gate"`.
   * Missing / broken link → transit dumps the fleet at a random system.
   */
  linkedGateId?: string;
  notes: string;
  battles: BattleEntry[];
  /** Cities and districts factions contest on the surface. */
  cities: City[];
  /**
   * Districts more than 2 hexes from every city hub.
   * Reassigned automatically whenever settlements change.
   */
  independentDistricts?: District[];
  /** World-type structures on free hexes (mines, docks, forts, …). */
  structures: PlanetStructure[];
  /**
   * True once this world has received a settlement pass (gen, load migrate, or
   * regenerate). Empty cities/structures after this must stay empty — do not
   * auto-rebuild on focus/load.
   */
  surfaceReady?: boolean;
  /**
   * Ownership of open hexes (no city/district/structure).
   * Keys are tile index strings → faction id. Settlement tiles always win.
   */
  tileClaims?: Record<string, string>;
  /**
   * Manual biome overrides for hex tiles (tile index → terrain kind).
   * Missing keys use procedural terrain from classification.
   */
  tileTerrain?: Record<string, string>;
  /** Armies deployed on this world. */
  armies: Army[];
  /** Crossed-swords monuments for Heroic / Epochal victories. */
  famousBattleSites?: FamousBattleSite[];
  /**
   * Per-faction building points banked on this planet (Play economy).
   * Keys are faction ids → BP balance.
   */
  buildingPoints?: Record<string, number>;
}

export type TimelineEventSignificance = "normal" | "notable" | "important";

/** A beat on the galactic chronicle timeline. */
export interface TimelineEvent {
  id: string;
  title: string;
  /** Seconds along the chronicle timelapse. */
  timeSec: number;
  summary: string;
  /** Visual weight on the vertical chronicle rail. */
  significance?: TimelineEventSignificance;
}

/** Compact fleet pose stored in a history frame (no ship roster). */
export interface GalaxyHistoryFleet {
  id: string;
  name: string;
  factionId: string;
  location: FleetLocation;
}

/**
 * One recorded beat of galaxy territory + fleet positions.
 * Layout (star positions, hyperlanes) always uses the live campaign map.
 */
export interface GalaxyHistoryFrame {
  id: string;
  /** Seconds along the chronicle timeline (for scrubbing / events). */
  timeSec: number;
  label?: string;
  /** Owned systems only: systemId → factionId. */
  systemOwners: Record<string, string>;
  /** Contested systems: systemId → faction ids (2+). */
  contestedSystems: Record<string, string[]>;
  fleets: GalaxyHistoryFleet[];
}

/** Campaign chronicle: recorded map frames + interactive event markers. */
export interface CampaignTimeline {
  frames: GalaxyHistoryFrame[];
  events: TimelineEvent[];
}

/** Hotseat play-mode turn tracker (absent / inactive = free Edit). */
export interface CampaignPlay {
  /** When true, unit moves are gated by active faction. */
  active: boolean;
  /** 1-based round counter. */
  round: number;
  /** Faction ids in turn order. */
  turnOrder: string[];
  activeFactionId: string | null;
  /** Fleets that already moved this turn. */
  movedFleetIds: string[];
  /**
   * Armies that have spent any movement or fought this turn
   * (cannot join battles as supports).
   */
  movedArmyIds: string[];
  /** Hexes each army has already spent this turn (cap = ARMY_MOVE_RANGE). */
  armyMovementUsed?: Record<string, number>;
  /**
   * Round when a detachment last entered a friendly War Camp to rest.
   * Heals to 100% once a later round begins while still stationary there.
   */
  armyCampEnteredRound?: Record<string, number>;
}

export interface Campaign {
  version: 1;
  name: string;
  factions: Faction[];
  /** Shared symbol library for army markers. */
  symbols: ArmySymbol[];
  systems: StarSystem[];
  planets: Planet[];
  /** Space fleets (inter-/intra-system). */
  fleets: Fleet[];
  /** Notable NPCs / named characters for the encyclopedia. */
  characters: CampaignCharacter[];
  /**
   * Incremental lane edits over the auto graph (preferred).
   * Auto lanes still update when stars move; added/removed persist.
   */
  hyperlaneEdits?: HyperlaneEdits;
  /**
   * Sticky hyperlane network. When set, lanes keep their endpoints until
   * manually edited, a star is placed (new links only), or Reset lanes.
   * When unset, lanes are derived live from star positions.
   */
  hyperlanes?: CampaignHyperlane[];
  /** Optional in-game chronicle (territory/fleet timelapse + events). */
  timeline?: CampaignTimeline;
  /**
   * Galaxy-wide battle chronicle (planetary + space).
   * Older saves omit this — migrated from `Planet.battles` on load.
   */
  battleLog?: CampaignBattleLogEntry[];
  /**
   * Square map extent in world units (border / playable area).
   * Defaults to GALAXY_SIZE when missing (older saves).
   */
  mapSize?: number;
  /**
   * How faction territory is drawn on the galaxy map.
   * Missing / `metaball` → spheres of influence (legacy alias).
   * `soi` → circular SOIs meeting at midpoints.
   * `voronoi` → star-driven sector tiles (shared geometric edges).
   * `voronoi_soft` → smooth inset sectors with empty gaps; same-claim merges.
   * `voronoi_shaky` → organic wobble on shared Voronoi edges.
   */
  territoryMode?: TerritoryMode;
  /** Hotseat turns; missing or inactive means free Edit. */
  play?: CampaignPlay;
}

/** Galaxy territory rendering mode. */
export type TerritoryMode =
  | "soi"
  | "metaball"
  | "voronoi"
  | "voronoi_soft"
  | "voronoi_shaky";

export const PLANET_TYPE_LABELS: Record<PlanetType, string> = {
  hive: "Hive World",
  forge: "Forge World",
  agri: "Agri World",
  death: "Death World",
  shrine: "Shrine World",
  feudal: "Feudal World",
  fortress: "Fortress World",
  homeworld: "Homeworld",
  trade: "Trade World",
  mining: "Mining World",
  archaeological: "Archaeological World",
  abandoned_colony: "Abandoned Colony",
  asteroid_belt: "Asteroid Belt",
  warp_gate: "Warp Gate",
  custom: "Custom",
};

/** Display label for a planet's type, including user-named custom worlds. */
export function planetTypeDisplayLabel(
  planet: Pick<Planet, "type" | "customTypeLabel">,
): string {
  if (planet.type === "custom") {
    const custom = planet.customTypeLabel?.trim();
    if (custom) return custom;
  }
  return PLANET_TYPE_LABELS[planet.type] ?? "World";
}

export const PLANET_CLASSIFICATION_LABELS: Record<PlanetClassification, string> =
  {
    ice: "Ice World",
    tundra: "Tundra",
    water: "Water World",
    islands: "Islands",
    jungle: "Jungle",
    earthlike: "Earth-like",
    super_earth: "Super Earth",
    desert: "Desert",
    arid: "Arid",
    savannah: "Savannah",
    swamp: "Swamp",
    volcanic: "Volcanic",
    magma: "Magma World",
    toxic: "Toxic World",
    barren: "Barren",
    gas_giant: "Gas Giant",
    tidally_locked: "Tidally Locked",
  };

export const PLANET_CLASSIFICATION_ORDER: PlanetClassification[] = [
  "ice",
  "tundra",
  "water",
  "islands",
  "jungle",
  "earthlike",
  "super_earth",
  "desert",
  "arid",
  "savannah",
  "swamp",
  "volcanic",
  "magma",
  "toxic",
  "barren",
  "gas_giant",
  "tidally_locked",
];

export const STAR_CLASS_LABELS: Record<StarClass, string> = {
  O: "O-type (Blue giant)",
  B: "B-type (Blue-white)",
  A: "A-type (White)",
  F: "F-type (Yellow-white)",
  G: "G-type (Yellow)",
  K: "K-type (Orange)",
  M: "M-type (Red dwarf)",
  white_dwarf: "White dwarf",
  neutron: "Neutron star",
  pulsar: "Pulsar",
  black_hole: "Black hole",
};

export const STAR_CLASS_ORDER: StarClass[] = [
  "O",
  "B",
  "A",
  "F",
  "G",
  "K",
  "M",
  "white_dwarf",
  "neutron",
  "pulsar",
  "black_hole",
];

export const DISTRICT_KIND_LABELS: Record<DistrictKind, string> = {
  spire: "Hive Spire",
  underhive: "Underhive",
  domed_habitat: "Domed Habitat",
  docks: "Space Port",
  bastion: "Bastion",
  manufactorum: "Manufactorum",
  camp: "War Camp",
  cathedral: "Cathedral",
  reliquary: "Reliquary",
  ruins: "Ruins",
  supply_station: "Supply Station",
};

export const DISTRICT_KIND_ORDER: DistrictKind[] = [
  "spire",
  "underhive",
  "domed_habitat",
  "docks",
  "bastion",
  "manufactorum",
  "camp",
  "cathedral",
  "reliquary",
  "ruins",
  "supply_station",
];

export const STRUCTURE_KIND_LABELS: Record<StructureKind, string> = {
  space_port: "Space Port",
  ore_mine: "Ore Mine",
  trench_line: "Trench Line",
  relay: "Relay",
  relay_crown: "Relay Crown",
  outpost: "Outpost",
  ruins_site: "Ruins Site",
  supply_network: "Supply Network",
};

/** Kinds players may place from edit / strategic pickers (excludes warp-only crown). */
export const STRUCTURE_KIND_ORDER: StructureKind[] = [
  "ore_mine",
  "outpost",
  "relay",
  "ruins_site",
  "space_port",
  "supply_network",
  "trench_line",
];

export const SHIP_CHASSIS_LABELS: Record<ShipChassis, string> = {
  escort: "Escorts",
  transport: "Transports",
  light_cruiser: "Light Cruisers",
  cruiser: "Cruisers",
  battlecruiser: "Battlecruisers",
  grand_cruiser: "Grand Cruisers",
  battleship: "Battleships",
};

export const SHIP_CHASSIS_ORDER: ShipChassis[] = [
  "escort",
  "transport",
  "light_cruiser",
  "cruiser",
  "battlecruiser",
  "grand_cruiser",
  "battleship",
];

export const GALAXY_SIZE = 16000;
export const GALAXY_WIDTH = GALAXY_SIZE;
export const GALAXY_HEIGHT = GALAXY_SIZE;
/** Padding from canvas edge where stars may be placed / map-limit frame sits. */
export const GALAXY_EDGE_PADDING = 200;
/** Previous canvas size — used to recenter saved maps after the expand. */
export const GALAXY_SIZE_LEGACY = 4000;

/** Playable square size for a campaign (falls back to full GALAXY_SIZE). */
export function campaignMapSize(campaign: { mapSize?: number }): number {
  const n = campaign.mapSize;
  if (typeof n === "number" && n >= 2000) return n;
  return GALAXY_SIZE;
}

/** Territory draw mode (defaults to spheres of influence for older saves). */
export function campaignTerritoryMode(campaign: {
  territoryMode?: TerritoryMode;
}): TerritoryMode {
  if (
    campaign.territoryMode === "voronoi" ||
    campaign.territoryMode === "voronoi_soft" ||
    campaign.territoryMode === "voronoi_shaky"
  ) {
    return campaign.territoryMode;
  }
  // `metaball` kept as a legacy alias for SOI.
  return "soi";
}

/** Default inactive play state (free Edit). */
export function inactivePlayState(): CampaignPlay {
  return {
    active: false,
    round: 1,
    turnOrder: [],
    activeFactionId: null,
    movedFleetIds: [],
    movedArmyIds: [],
    armyMovementUsed: {},
    armyCampEnteredRound: {},
  };
}

/** Normalize missing/partial play from older saves. */
export function normalizeCampaignPlay(
  play?: Partial<CampaignPlay> | null,
): CampaignPlay {
  if (!play) return inactivePlayState();
  const armyMovementUsed: Record<string, number> = {};
  if (play.armyMovementUsed && typeof play.armyMovementUsed === "object") {
    for (const [id, n] of Object.entries(play.armyMovementUsed)) {
      if (typeof n === "number" && Number.isFinite(n) && n > 0) {
        armyMovementUsed[id] = Math.max(0, Math.floor(n));
      }
    }
  }
  const armyCampEnteredRound: Record<string, number> = {};
  if (
    play.armyCampEnteredRound &&
    typeof play.armyCampEnteredRound === "object"
  ) {
    for (const [id, n] of Object.entries(play.armyCampEnteredRound)) {
      if (typeof n === "number" && Number.isFinite(n) && n >= 1) {
        armyCampEnteredRound[id] = Math.floor(n);
      }
    }
  }
  return {
    active: Boolean(play.active),
    round:
      typeof play.round === "number" && play.round >= 1
        ? Math.floor(play.round)
        : 1,
    turnOrder: Array.isArray(play.turnOrder)
      ? play.turnOrder.filter((id): id is string => typeof id === "string")
      : [],
    activeFactionId:
      typeof play.activeFactionId === "string" ? play.activeFactionId : null,
    movedFleetIds: Array.isArray(play.movedFleetIds)
      ? play.movedFleetIds.filter((id): id is string => typeof id === "string")
      : [],
    movedArmyIds: Array.isArray(play.movedArmyIds)
      ? play.movedArmyIds.filter((id): id is string => typeof id === "string")
      : [],
    armyMovementUsed,
    armyCampEnteredRound,
  };
}
