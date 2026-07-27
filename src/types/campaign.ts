export type ViewLevel = "galaxy" | "system" | "planet" | "strategic" | "timeline";

export type PlanetType =
  | "hive"
  | "forge"
  | "agri"
  | "death"
  | "shrine"
  | "asteroid_belt"
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
  | "docks"
  | "bastion"
  | "manufactorum"
  | "foundry"
  | "refinery"
  | "railhead"
  | "agriplex"
  | "silo"
  | "reservoir"
  | "outpost"
  | "fortress"
  | "camp"
  | "cathedral"
  | "reliquary"
  | "cloister"
  | "quarter"
  | "ruins";

/**
 * Standalone surface structures (not nested under cities).
 * World type drives which kinds appear on a planet.
 */
export type StructureKind =
  | "space_port"
  | "spire_cluster"
  | "underhive_gate"
  | "manufactorum_complex"
  | "ore_mine"
  | "slag_works"
  | "reactor"
  | "agri_dome"
  | "silo_complex"
  | "reservoir_works"
  | "fortress_bastion"
  | "trench_line"
  | "kill_zone"
  | "cathedral_complex"
  | "reliquary_vault"
  | "pilgrim_station"
  | "mining_claim"
  | "relay"
  | "outpost"
  | "ruins_site";

export interface Faction {
  id: string;
  name: string;
  color: string;
  /** Optional default symbol from the campaign library. */
  defaultSymbolId?: string;
}

/** Imported / assigned army icon (stored as a data URL). */
export interface ArmySymbol {
  id: string;
  name: string;
  imageDataUrl: string;
}

/** Force on a planet surface — shown as symbol + name label. */
export interface Army {
  id: string;
  name: string;
  factionId: string;
  symbolId?: string;
  dir: SphereDir;
  notes: string;
}

/** Stellaris-style ship hull class. */
export type ShipChassis =
  | "corvette"
  | "destroyer"
  | "cruiser"
  | "battleship"
  | "titan"
  | "colossus"
  | "construction"
  | "science"
  | "transport";

export interface Ship {
  id: string;
  name: string;
  chassis: ShipChassis;
  notes: string;
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
  ships: Ship[];
  location: FleetLocation;
  notes: string;
}

export interface BattleEntry {
  id: string;
  date: string;
  summary: string;
  outcome: string;
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
  | "neutron"
  | "pulsar"
  | "black_hole";

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  notes: string;
  /** Spectral / exotic star classification (visual only; not faction). */
  starClass: StarClass;
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
  /** Climate / environment (ignored for asteroid belts). */
  classification: PlanetClassification;
  controllingFactionId?: string;
  notes: string;
  battles: BattleEntry[];
  /** Cities and districts factions contest on the surface. */
  cities: City[];
  /** World-type structures on free hexes (mines, docks, forts, …). */
  structures: PlanetStructure[];
  /**
   * Ownership of open hexes (no city/district/structure).
   * Keys are tile index strings → faction id. Settlement tiles always win.
   */
  tileClaims?: Record<string, string>;
  /** Armies deployed on this world. */
  armies: Army[];
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
  /** Optional in-game chronicle (territory/fleet timelapse + events). */
  timeline?: CampaignTimeline;
  /**
   * Square map extent in world units (border / playable area).
   * Defaults to GALAXY_SIZE when missing (older saves).
   */
  mapSize?: number;
}

export const PLANET_TYPE_LABELS: Record<PlanetType, string> = {
  hive: "Hive World",
  forge: "Forge World",
  agri: "Agri World",
  death: "Death World",
  shrine: "Shrine World",
  asteroid_belt: "Asteroid Belt",
  custom: "Custom",
};

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
    toxic: "Toxic",
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
  "neutron",
  "pulsar",
  "black_hole",
];

export const DISTRICT_KIND_LABELS: Record<DistrictKind, string> = {
  spire: "Hive Spire",
  underhive: "Underhive",
  docks: "Space Docks",
  bastion: "Bastion",
  manufactorum: "Manufactorum",
  foundry: "Foundry",
  refinery: "Refinery",
  railhead: "Railhead",
  agriplex: "Agri-Plex",
  silo: "Grain Silo",
  reservoir: "Reservoir",
  outpost: "Outpost",
  fortress: "Fortress",
  camp: "War Camp",
  cathedral: "Cathedral",
  reliquary: "Reliquary",
  cloister: "Cloister",
  quarter: "District",
  ruins: "Ruins",
};

export const STRUCTURE_KIND_LABELS: Record<StructureKind, string> = {
  space_port: "Space Port",
  spire_cluster: "Spire Cluster",
  underhive_gate: "Underhive Gate",
  manufactorum_complex: "Manufactorum Complex",
  ore_mine: "Ore Mine",
  slag_works: "Slag Works",
  reactor: "Reactor",
  agri_dome: "Agri Dome",
  silo_complex: "Silo Complex",
  reservoir_works: "Reservoir Works",
  fortress_bastion: "Fortress Bastion",
  trench_line: "Trench Line",
  kill_zone: "Kill Zone",
  cathedral_complex: "Cathedral Complex",
  reliquary_vault: "Reliquary Vault",
  pilgrim_station: "Pilgrim Station",
  mining_claim: "Mining Claim",
  relay: "Relay",
  outpost: "Outpost",
  ruins_site: "Ruins Site",
};

export const SHIP_CHASSIS_LABELS: Record<ShipChassis, string> = {
  corvette: "Corvette",
  destroyer: "Destroyer",
  cruiser: "Cruiser",
  battleship: "Battleship",
  titan: "Titan",
  colossus: "Colossus",
  construction: "Construction Ship",
  science: "Science Ship",
  transport: "Transport",
};

export const SHIP_CHASSIS_ORDER: ShipChassis[] = [
  "corvette",
  "destroyer",
  "cruiser",
  "battleship",
  "titan",
  "colossus",
  "construction",
  "science",
  "transport",
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
