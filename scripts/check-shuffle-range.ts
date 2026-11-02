import {
  generatePlanetSurface,
  shufflePlanetSettlements,
  MAX_DISTRICT_CITY_RANGE,
  SETTLEMENT_HEX_FREQUENCY,
} from "../src/lib/settlements";
import { buildHexSphere, hexTileDistance } from "../src/lib/hexSphere";
import type { Planet, PlanetType } from "../src/types/campaign";

const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);

let shuffleFail = 0;
let bad = 0;
let ok = 0;
const examples: unknown[] = [];

for (let i = 0; i < 60; i++) {
  const type: PlanetType = i % 2 === 0 ? "hive" : "homeworld";
  const surface = generatePlanetSurface(`shuf-${type}-${i}`, type, {
    classification: "earthlike",
  });
  const planet = {
    id: `p-${i}`,
    systemId: "s",
    name: "T",
    orbitIndex: 0,
    type,
    classification: "earthlike" as const,
    cities: surface.cities,
    independentDistricts: surface.independentDistricts,
    structures: surface.structures,
    notes: "",
  } as Planet;

  const shuffled = shufflePlanetSettlements(planet);
  if (!shuffled) {
    shuffleFail++;
    continue;
  }
  ok++;
  for (const city of shuffled.cities) {
    for (const d of city.districts) {
      const dist = hexTileDistance(sphere, city.tileIndex, d.tileIndex);
      if (dist > MAX_DISTRICT_CITY_RANGE) {
        bad++;
        if (examples.length < 10) {
          examples.push({
            city: city.name,
            dist,
            hub: city.tileIndex,
            tile: d.tileIndex,
            kind: d.kind,
          });
        }
      }
    }
  }
}

console.log(JSON.stringify({ ok, shuffleFail, bad, examples }, null, 2));
