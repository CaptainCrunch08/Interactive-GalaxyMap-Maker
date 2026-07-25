export type ViewLevel = "galaxy" | "system" | "planet" | "strategic" | "timeline";

export type PlanetType =
  | "hive"
  | "forge"
  | "agri"
  | "death"
  | "shrine"
  | "custom";

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

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  notes: string;
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

export interface Planet {
  id: string;
  systemId: string;
  name: string;
  orbitIndex: number;
  type: PlanetType;
  controllingFactionId?: string;
  notes: string;
  battles: BattleEntry[];
  /** Cities and districts factions contest on the surface. */
  cities: City[];
  /**
   * Ownership of open hexes (no city/district).
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
  custom: "Custom",
};

export const DISTRICT_KIND_LABELS: Record<DistrictKind, string> = {
  spire: "Hive Spire",
  underhive: "Underhive",
  docks: "Void Docks",
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
