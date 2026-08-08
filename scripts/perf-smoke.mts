import {
  buildHexSphere,
  hexTileDistance,
} from "../src/lib/hexSphere.ts";

const t0 = performance.now();
const a = buildHexSphere(5);
const t1 = performance.now();
const b = buildHexSphere(5);
const t2 = performance.now();

console.log(
  JSON.stringify({
    firstMs: +(t1 - t0).toFixed(2),
    cachedMs: +(t2 - t1).toFixed(3),
    sameRef: a === b,
    tiles: a.tiles.length,
    sampleDist: hexTileDistance(a, 0, Math.min(50, a.tiles.length - 1)),
  }),
);
