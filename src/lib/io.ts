import { z } from "zod";
import type { Campaign } from "../types/campaign";
import { ensurePlanetCities } from "./settlements";
import { normalizeStarClass } from "./stars";
import { normalizePlanetClassification } from "./planetClass";

const battleEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  summary: z.string(),
  outcome: z.string(),
});

const factionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  defaultSymbolId: z.string().optional(),
});

const armySymbolSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageDataUrl: z.string(),
});

const starSystemSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  notes: z.string(),
  starClass: z
    .enum([
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
    ])
    .default("G"),
  controllingFactionId: z.string().optional(),
});

const sphereDirSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const districtSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum([
    "spire",
    "underhive",
    "docks",
    "bastion",
    "manufactorum",
    "foundry",
    "refinery",
    "railhead",
    "agriplex",
    "silo",
    "reservoir",
    "outpost",
    "fortress",
    "camp",
    "cathedral",
    "reliquary",
    "cloister",
    "quarter",
    "ruins",
  ]),
  controllingFactionId: z.string().optional(),
  tileIndex: z.number().int().nonnegative(),
  dir: sphereDirSchema,
  notes: z.string(),
});

const citySchema = z.object({
  id: z.string(),
  name: z.string(),
  tileIndex: z.number().int().nonnegative(),
  controllingFactionId: z.string().optional(),
  dir: sphereDirSchema,
  districts: z.array(districtSchema),
  notes: z.string(),
});

const structureSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z
    .string()
    .transform((k) => (k === "void_dock" ? "space_port" : k))
    .pipe(
      z.enum([
        "space_port",
        "spire_cluster",
        "underhive_gate",
        "manufactorum_complex",
        "ore_mine",
        "slag_works",
        "reactor",
        "agri_dome",
        "silo_complex",
        "reservoir_works",
        "fortress_bastion",
        "trench_line",
        "kill_zone",
        "cathedral_complex",
        "reliquary_vault",
        "pilgrim_station",
        "mining_claim",
        "relay",
        "outpost",
        "ruins_site",
      ]),
    ),
  tileIndex: z.number().int().nonnegative(),
  dir: sphereDirSchema,
  controllingFactionId: z.string().optional(),
  notes: z.string().default(""),
});

const armySchema = z.object({
  id: z.string(),
  name: z.string(),
  factionId: z.string(),
  symbolId: z.string().optional(),
  dir: sphereDirSchema,
  notes: z.string(),
});

const shipChassisSchema = z.enum([
  "corvette",
  "destroyer",
  "cruiser",
  "battleship",
  "titan",
  "colossus",
  "construction",
  "science",
  "transport",
]);

const shipSchema = z.object({
  id: z.string(),
  name: z.string(),
  chassis: shipChassisSchema,
  notes: z.string().default(""),
});

const fleetLocationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system"),
    systemId: z.string(),
  }),
  z.object({
    kind: z.literal("orbit"),
    systemId: z.string(),
    planetId: z.string(),
  }),
]);

const fleetSchema = z.object({
  id: z.string(),
  name: z.string(),
  factionId: z.string(),
  ships: z.array(shipSchema).default([]),
  location: fleetLocationSchema,
  notes: z.string().default(""),
});

const timelineEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  timeSec: z.number().nonnegative(),
  summary: z.string().default(""),
  significance: z
    .enum(["normal", "notable", "important"])
    .default("normal"),
});

const galaxyHistoryFleetSchema = z.object({
  id: z.string(),
  name: z.string(),
  factionId: z.string(),
  location: fleetLocationSchema,
});

const galaxyHistoryFrameSchema = z.object({
  id: z.string(),
  timeSec: z.number().nonnegative(),
  label: z.string().optional(),
  systemOwners: z.record(z.string(), z.string()).default({}),
  contestedSystems: z.record(z.string(), z.array(z.string())).default({}),
  fleets: z.array(galaxyHistoryFleetSchema).default([]),
});

const campaignTimelineSchema = z
  .object({
    frames: z.array(galaxyHistoryFrameSchema).default([]),
    events: z.array(timelineEventSchema).default([]),
    /** Legacy field from video-based chronicle; ignored on import. */
    videoUrl: z.string().optional(),
  })
  .transform(({ frames, events }) => ({ frames, events }));

const planetSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  name: z.string(),
  orbitIndex: z.number(),
  type: z.enum([
    "hive",
    "forge",
    "agri",
    "death",
    "shrine",
    "asteroid_belt",
    "custom",
  ]),
  classification: z
    .enum([
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
    ])
    .default("earthlike"),
  controllingFactionId: z.string().optional(),
  notes: z.string(),
  battles: z.array(battleEntrySchema),
  cities: z.array(citySchema).default([]),
  structures: z.array(structureSchema).default([]),
  tileClaims: z.record(z.string(), z.string()).optional().default({}),
  armies: z.array(armySchema).default([]),
});

const campaignSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  factions: z.array(factionSchema),
  symbols: z.array(armySymbolSchema).default([]),
  systems: z.array(starSystemSchema),
  planets: z.array(planetSchema),
  fleets: z.array(fleetSchema).default([]),
  timeline: campaignTimelineSchema.optional(),
  mapSize: z.number().positive().optional(),
});

export function parseCampaignJson(json: string): Campaign {
  const data = JSON.parse(json) as unknown;
  const campaign = campaignSchema.parse(data) as Campaign;
  return {
    ...campaign,
    symbols: campaign.symbols ?? [],
    fleets: campaign.fleets ?? [],
    timeline: {
      frames: campaign.timeline?.frames ?? [],
      events: campaign.timeline?.events ?? [],
    },
    mapSize: campaign.mapSize,
    systems: campaign.systems.map((s) => ({
      ...s,
      starClass: normalizeStarClass(s.starClass),
    })),
    planets: campaign.planets.map((p) => {
      const ensured = ensurePlanetCities({
        ...p,
        classification: normalizePlanetClassification(p.classification),
        structures: p.structures ?? [],
        cities: p.cities ?? [],
        armies: p.armies ?? [],
      });
      return {
        ...ensured,
        tileClaims: ensured.tileClaims ?? {},
        armies: ensured.armies ?? [],
        structures: ensured.structures ?? [],
      };
    }),
  };
}

export function serializeCampaign(campaign: Campaign): string {
  return JSON.stringify(campaign, null, 2);
}

export function downloadCampaign(campaign: Campaign, filename?: string) {
  const blob = new Blob([serializeCampaign(campaign)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ?? `${campaign.name.replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readCampaignFile(file: File): Promise<Campaign> {
  const text = await file.text();
  return parseCampaignJson(text);
}

/** Read an image file into a data URL for the symbol library. */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}
