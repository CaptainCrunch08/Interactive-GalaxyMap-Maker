import fs from "node:fs";
import { PNG } from "pngjs";

const buf = fs.readFileSync(
  "C:/Users/scott/.cursor/projects/c-Users-scott-projects/assets/image-2dd870ce-4daa-408c-bfd8-651c0f332b78.png",
);
const png = PNG.sync.read(buf);
const { width, height, data } = png;

function sample(x, y) {
  x = Math.max(0, Math.min(width - 1, Math.round(x)));
  y = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (width * y + x) << 2;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  // opaque dark = wall ink
  return a > 180 && r + g + b < 280;
}

// content bbox
let minX = width,
  minY = height,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (sample(x, y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}
console.log("bbox", minX, minY, maxX, maxY, "img", width, height);

// Sample a 48×48 wall-density grid over the bbox (line maze → density)
const G = 48;
const dens = Array.from({ length: G }, () => Array(G).fill(0));
for (let gy = 0; gy < G; gy++) {
  for (let gx = 0; gx < G; gx++) {
    let dark = 0;
    let n = 0;
    const x0 = minX + (gx / G) * (maxX - minX);
    const y0 = minY + (gy / G) * (maxY - minY);
    const x1 = minX + ((gx + 1) / G) * (maxX - minX);
    const y1 = minY + ((gy + 1) / G) * (maxY - minY);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        n++;
        if (sample(x, y)) dark++;
      }
    }
    dens[gy][gx] = n ? dark / n : 0;
  }
}

// Print density as ASCII for inspection
for (let gy = 0; gy < G; gy++) {
  let row = "";
  for (let gx = 0; gx < G; gx++) {
    const d = dens[gy][gx];
    row += d > 0.12 ? "#" : d > 0.04 ? "+" : ".";
  }
  console.log(row);
}
