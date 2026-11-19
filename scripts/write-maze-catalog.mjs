import fs from "node:fs";

const mazes = JSON.parse(fs.readFileSync("scripts/maze-gen-out.json", "utf8"));

let out = `/**
 * Fixed catalog of 20 small warp-gate station mazes (16×16).
 * Each maze has exactly two entrances (A/B) and a relay-crown chamber (C) at center.
 * Exactly one corridor from each entrance opens into the crown chamber.
 * Warp gates pick one of these layouts — layouts are not regenerated per gate.
 */

export const STATION_MAZE_SIZE = 16;
export const STATION_MAZE_CATALOG_COUNT = 20;

/**
 * ASCII rows: \`#\` wall, \`.\` corridor, \`A\`/\`B\` distinct entrances, \`C\` crown center.
 * Every template is exactly 16×16 with a single path from each entrance into the crown.
 */
export const STATION_MAZE_ASCII: readonly (readonly string[])[] = [
`;

for (const m of mazes) {
  out += "  [\n";
  for (const row of m) out += `    "${row}",\n`;
  out += "  ],\n";
}
out += `];

export function clampStationMazeId(id: number | undefined | null): number {
  if (id == null || !Number.isFinite(id)) return 0;
  const n = Math.floor(id);
  const mod =
    ((n % STATION_MAZE_CATALOG_COUNT) + STATION_MAZE_CATALOG_COUNT) %
    STATION_MAZE_CATALOG_COUNT;
  return mod;
}

/** Stable catalog pick from a planet id when no explicit maze id is stored. */
export function stationMazeIdFromPlanetId(planetId: string): number {
  let s = 2166136261;
  for (let i = 0; i < planetId.length; i++) {
    s ^= planetId.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  return (s >>> 0) % STATION_MAZE_CATALOG_COUNT;
}
`;

fs.writeFileSync("src/lib/stationMazeCatalog.ts", out);
console.log("wrote", mazes.length, "mazes");
