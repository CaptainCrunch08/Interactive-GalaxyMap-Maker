import {
  generatePlanetCities,
  generatePlanetSurface,
  MAX_DISTRICT_CITY_RANGE,
  SETTLEMENT_HEX_FREQUENCY,
} from "../src/lib/settlements";
import { buildHexSphere, hexTileDistance } from "../src/lib/hexSphere";
import type { PlanetType } from "../src/types/campaign";

const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
const types: PlanetType[] = [
  "hive",
  "forge",
  "homeworld",
  "trade",
  "feudal",
  "mining",
  "archaeological",
];

let bad = 0;
let totalDistricts = 0;
const examples: unknown[] = [];

for (let i = 0; i < 40; i++) {
  for (const type of types) {
    const { cities, independentDistricts } = generatePlanetSurface(
      `test-${type}-${i}`,
      type,
      { classification: "earthlike" },
    );
    for (const city of cities) {
      for (const d of city.districts) {
        totalDistricts++;
        const dist = hexTileDistance(sphere, city.tileIndex, d.tileIndex);
        if (dist > MAX_DISTRICT_CITY_RANGE) {
          bad++;
          if (examples.length < 8) {
            examples.push({
              via: "surface",
              type,
              city: city.name,
              dist,
              hub: city.tileIndex,
              tile: d.tileIndex,
              nDistricts: city.districts.length,
            });
          }
        }
      }
    }
    for (const d of independentDistricts) {
      // independents are by definition outside all city ranges
      if (examples.length < 12) {
        examples.push({
          via: "independent",
          type,
          tile: d.tileIndex,
          kind: d.kind,
        });
      }
    }

    const raw = generatePlanetCities(`raw-${type}-${i}`, type, {});
    for (const city of raw) {
      for (const d of city.districts) {
        const dist = hexTileDistance(sphere, city.tileIndex, d.tileIndex);
        if (dist > MAX_DISTRICT_CITY_RANGE) {
          bad++;
          if (examples.length < 16) {
            examples.push({
              via: "rawCities",
              type,
              dist,
              hub: city.tileIndex,
              tile: d.tileIndex,
            });
          }
        }
      }
    }
  }
}

console.log(
  JSON.stringify(
    { totalDistricts, badOutOfRangeOnCity: bad, examples },
    null,
    2,
  ),
);
