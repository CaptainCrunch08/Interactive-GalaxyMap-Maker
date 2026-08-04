import type {
  Campaign,
  Fleet,
  GalaxyHistoryFrame,
  Planet,
  PlanetClassification,
  StarClass,
} from "../types/campaign";
import { GALAXY_HEIGHT, GALAXY_SIZE, GALAXY_WIDTH } from "../types/campaign";
import { createShip } from "./fleets";
import { generatePlanetSurface, planetOwnerFromCities } from "./settlements";
import { snapshotGalaxyFrame } from "./galaxyHistory";

function withCities(
  planet: Omit<Planet, "cities" | "armies" | "structures">,
  opts?: {
    defaultFactionId?: string;
    rivalFactionId?: string;
    contestedRate?: number;
  },
): Planet {
  const { cities, structures } = generatePlanetSurface(planet.id, planet.type, {
    defaultFactionId: opts?.defaultFactionId ?? planet.controllingFactionId,
    rivalFactionId: opts?.rivalFactionId,
    contestedRate: opts?.contestedRate,
  });
  return {
    ...planet,
    cities,
    structures,
    controllingFactionId:
      planetOwnerFromCities(cities, undefined, structures) ??
      planet.controllingFactionId,
    armies: [],
  };
}

export function createDemoCampaign(): Campaign {
  const imperiumId = crypto.randomUUID();
  const chaosId = crypto.randomUUID();
  const cadianSystemId = crypto.randomUUID();
  const armageddonSystemId = crypto.randomUUID();
  const fenrisSystemId = crypto.randomUUID();
  const eyeSystemId = crypto.randomUUID();
  const cadiaId = crypto.randomUUID();
  const kasrId = crypto.randomUUID();
  const armageddonPrimeId = crypto.randomUUID();
  const fenrisId = crypto.randomUUID();
  const medrengardId = crypto.randomUUID();
  const battlefleetId = crypto.randomUUID();
  const blackLegionId = crypto.randomUUID();

  const cx = GALAXY_WIDTH / 2;
  const cy = GALAXY_HEIGHT / 2;

  const fleets: Fleet[] = [
    {
      id: battlefleetId,
      name: "Battlefleet Cadia",
      factionId: imperiumId,
      ships: [
        createShip("battleship", 1),
        createShip("cruiser", 1),
        createShip("cruiser", 2),
        createShip("light_cruiser", 1),
        createShip("light_cruiser", 2),
        createShip("escort", 1),
        createShip("escort", 2),
        createShip("escort", 3),
      ],
      location: { kind: "orbit", systemId: cadianSystemId, planetId: cadiaId },
      notes: "Gate patrol squadron.",
    },
    {
      id: blackLegionId,
      name: "Black Legion Host",
      factionId: chaosId,
      ships: [
        createShip("battleship", 1),
        createShip("cruiser", 1),
        createShip("light_cruiser", 1),
        createShip("escort", 1),
        createShip("transport", 1),
      ],
      location: { kind: "system", systemId: eyeSystemId },
      notes: "Raiding from Medrengard Reach.",
    },
  ];

  const base: Campaign = {
    version: 1,
    name: "Segmentum Obscurus",
    factions: [
      { id: imperiumId, name: "Imperium", color: "#c9a227", armyType: "infantry" },
      { id: chaosId, name: "Forces of Chaos", color: "#8b1538", armyType: "elite" },
    ],
    symbols: [],
    systems: [
      {
        id: cadianSystemId,
        name: "Cadian System",
        x: cx - 80,
        y: cy - 40,
        notes: "Gateway to the Eye of Terror — contested front.",
        starClass: "G" as StarClass,
      },
      {
        id: armageddonSystemId,
        name: "Armageddon System",
        x: cx + 280,
        y: cy + 40,
        notes: "Industrial war zone.",
        starClass: "K" as StarClass,
        controllingFactionId: imperiumId,
      },
      {
        id: fenrisSystemId,
        name: "Fenris System",
        x: cx + 80,
        y: cy + 300,
        notes: "Homeworld of the Vlka Fenryka.",
        starClass: "M" as StarClass,
        controllingFactionId: imperiumId,
      },
      {
        id: eyeSystemId,
        name: "Medrengard Reach",
        x: cx - 340,
        y: cy - 60,
        notes: "Chaos stronghold on the rim of the Eye.",
        starClass: "B" as StarClass,
        controllingFactionId: chaosId,
      },
    ],
    planets: [
      withCities(
        {
          id: cadiaId,
          systemId: cadianSystemId,
          name: "Cadia",
          orbitIndex: 0,
          type: "hive",
          classification: "arid" as PlanetClassification,
          controllingFactionId: imperiumId,
          notes: "The Cadian Gate — strategic bulwark against the warp.",
          battles: [
            {
              id: crypto.randomUUID(),
              date: "999.M41",
              summary: "Black Crusade assault on the gate fortifications.",
              outcome: "Pyrrhic Imperial victory",
            },
          ],
        },
        {
          defaultFactionId: imperiumId,
          rivalFactionId: chaosId,
          contestedRate: 0.45,
        },
      ),
      withCities({
        id: kasrId,
        systemId: cadianSystemId,
        name: "Kasr Holn",
        orbitIndex: 1,
        type: "death",
        classification: "barren" as PlanetClassification,
        controllingFactionId: chaosId,
        notes: "Fallen fortress-world under Chaos occupation.",
        battles: [],
      }),
      withCities(
        {
          id: armageddonPrimeId,
          systemId: armageddonSystemId,
          name: "Armageddon Prime",
          orbitIndex: 0,
          type: "forge",
          classification: "volcanic" as PlanetClassification,
          controllingFactionId: imperiumId,
          notes: "Hive manufactorums under constant siege.",
          battles: [],
        },
        {
          defaultFactionId: imperiumId,
          rivalFactionId: chaosId,
          contestedRate: 0.25,
        },
      ),
      withCities({
        id: fenrisId,
        systemId: fenrisSystemId,
        name: "Fenris",
        orbitIndex: 0,
        type: "death",
        classification: "ice" as PlanetClassification,
        controllingFactionId: imperiumId,
        notes: "Ice world of feral tribes and Astartes fortress-monastery.",
        battles: [],
      }),
      withCities({
        id: medrengardId,
        systemId: eyeSystemId,
        name: "Medrengard",
        orbitIndex: 0,
        type: "forge",
        classification: "magma" as PlanetClassification,
        controllingFactionId: chaosId,
        notes: "Iron Warriors fortress world.",
        battles: [],
      }),
    ],
    fleets,
    characters: [],
    mapSize: GALAXY_SIZE,
  };

  // Frame 0 — opening dispositions (Cadia contested, host at the Eye)
  const frame0 = snapshotGalaxyFrame(
    { ...base, fleets },
    { timeSec: 0, label: "Opening dispositions" },
  );

  // Frame 1 — Black Legion moves on Cadia
  const fleetsAtCadia: Fleet[] = fleets.map((f) =>
    f.id === blackLegionId
      ? {
          ...f,
          location: {
            kind: "system",
            systemId: cadianSystemId,
          },
        }
      : f,
  );
  const frame1 = snapshotGalaxyFrame(
    { ...base, fleets: fleetsAtCadia },
    { timeSec: 4, label: "Host arrives at the Gate" },
  );

  // Frame 2 — Cadia falls to Chaos; Battlefleet withdraws to Armageddon
  const fallen: Campaign = {
    ...base,
    systems: base.systems.map((s) =>
      s.id === cadianSystemId
        ? { ...s, controllingFactionId: chaosId }
        : s,
    ),
    planets: base.planets.map((p) =>
      p.systemId === cadianSystemId
        ? { ...p, controllingFactionId: chaosId }
        : p,
    ),
    fleets: fleetsAtCadia.map((f) =>
      f.id === battlefleetId
        ? {
            ...f,
            location: {
              kind: "system",
              systemId: armageddonSystemId,
            },
          }
        : f,
    ),
  };
  const frame2 = snapshotGalaxyFrame(fallen, {
    timeSec: 9,
    label: "Cadia falls",
  });

  const frames: GalaxyHistoryFrame[] = [frame0, frame1, frame2];

  return {
    ...base,
    fleets: fallen.fleets,
    systems: fallen.systems,
    planets: fallen.planets,
    timeline: {
      frames,
      events: [
        {
          id: crypto.randomUUID(),
          title: "Opening salvo",
          timeSec: 0,
          summary: "Imperial pickets report warp signatures at the Gate.",
          significance: "notable",
        },
        {
          id: crypto.randomUUID(),
          title: "Cadia holds",
          timeSec: 4,
          summary: "Battlefleet Cadia engages the first Chaos wave.",
          significance: "normal",
        },
        {
          id: crypto.randomUUID(),
          title: "Eye stirs",
          timeSec: 9,
          summary: "The Gate breaks — Battlefleet withdraws to Armageddon.",
          significance: "important",
        },
      ],
    },
  };
}

export function createEmptyCampaign(): Campaign {
  return {
    version: 1,
    name: "New Campaign",
    factions: [],
    symbols: [],
    systems: [],
    planets: [],
    fleets: [],
    characters: [],
    timeline: { frames: [], events: [] },
    mapSize: GALAXY_SIZE,
  };
}
