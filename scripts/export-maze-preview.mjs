/**
 * Export all 20 station mazes as a single SVG preview image.
 */
import fs from "node:fs";

const mazes = JSON.parse(fs.readFileSync("scripts/maze-gen-out.json", "utf8"));
const CELL = 14;
const GAP = 18;
const LABEL_H = 22;
const COLS = 17;
const ROWS = 15;
const GRID = 4;
const mazeW = COLS * CELL;
const mazeH = ROWS * CELL;
const pad = 24;
const panelW = mazeW + GAP;
const panelH = mazeH + LABEL_H + GAP;
const width = pad * 2 + GRID * panelW - GAP;
const height = pad * 2 + Math.ceil(mazes.length / GRID) * panelH - GAP + 36;

function cellFill(ch) {
  if (ch === "#") return "#0b1220";
  if (ch === "A" || ch === "B") return "#22c55e";
  if (ch === "C") return "#3f3a2a";
  return "#6b7280";
}

let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#05080f"/>
  <text x="${pad}" y="28" fill="#e8c547" font-family="Georgia, serif" font-size="18">Warp Gate Station Mazes (20) — green = entrances, yellow crown = center</text>
`;

mazes.forEach((rows, i) => {
  const col = i % GRID;
  const row = Math.floor(i / GRID);
  const ox = pad + col * panelW;
  const oy = pad + 36 + row * panelH;
  svg += `  <text x="${ox}" y="${oy + 14}" fill="#94a3b8" font-family="ui-sans-serif,system-ui" font-size="12">Layout ${i + 1} / 20</text>\n`;
  svg += `  <g transform="translate(${ox}, ${oy + LABEL_H})">\n`;
  svg += `    <rect width="${mazeW}" height="${mazeH}" fill="#000" stroke="#1f2937" stroke-width="1"/>\n`;
  for (let y = 0; y < ROWS; y++) {
    const line = rows[y];
    for (let x = 0; x < COLS; x++) {
      const ch = line[x];
      const px = x * CELL;
      const py = y * CELL;
      svg += `    <rect x="${px}" y="${py}" width="${CELL - 1}" height="${CELL - 1}" rx="1" fill="${cellFill(ch)}"`;
      if (ch === "A" || ch === "B") {
        svg += ` stroke="#86efac" stroke-width="1.2"`;
      } else if (ch === "C") {
        svg += ` stroke="#e8c547" stroke-width="1.4"`;
      }
      svg += `/>\n`;
      if (ch === "C") {
        const cx = px + (CELL - 1) / 2;
        const cy = py + (CELL - 1) / 2;
        // simple yellow crown glyph
        svg += `    <path d="M ${cx - 4.5} ${cy + 2.5} L ${cx - 4.5} ${cy - 1.5} L ${cx - 2} ${cy + 0.5} L ${cx} ${cy - 3} L ${cx + 2} ${cy + 0.5} L ${cx + 4.5} ${cy - 1.5} L ${cx + 4.5} ${cy + 2.5} Z" fill="#facc15" stroke="#ca8a04" stroke-width="0.6"/>\n`;
        svg += `    <rect x="${cx - 4.5}" y="${cy + 2.5}" width="9" height="1.6" rx="0.3" fill="#fde68a"/>\n`;
      }
    }
  }
  svg += `  </g>\n`;
});

svg += `</svg>\n`;

const outSvg = "public/station-mazes-preview.svg";
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync(outSvg, svg);
console.log("wrote", outSvg);

// Also copy next to scripts for easy find.
fs.writeFileSync("scripts/station-mazes-preview.svg", svg);
console.log("wrote scripts/station-mazes-preview.svg");
