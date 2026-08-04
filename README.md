# Interactive-GalaxyMap-Maker

Allows for custom or procedural generation of interactive galaxies for long term campaigns. Includes an optional hotseat turn tracker per faction, fleet movements, regiment movements, area control, a timelapse of events, and more.

Interactive sector map for narrative wargame campaigns. Pan and zoom a galaxy view, drill into star systems and planets, and track factions, notes, and battle logs. Data auto-saves in the browser and can be exported as JSON.

## Features

- **Galaxy view** — pan/zoom (mouse wheel, drag), click a star to open its system
- **System view** — planets on orbital rings; click a planet for details
- **Planet / strategic view** — settlements, armies, and battle logs
- **Fleets** — compose and move fleets between systems along hyperlanes
- **Territory** — faction ownership and influence blobs across the map
- **Hotseat turns (Play mode)** — **Start campaign** in the top bar; only the active faction can move fleets/armies (one move each per turn). **Edit Galaxy** and free editing stay fully unrestricted. Building points: each owned manufactorum on a planet banks **10 BP/turn** on that world; spend **500** at a War Camp for a detachment, **1000** to build a manufactorum next to an owned city, or build ships at a Space Port (**50 BP** escort, other hulls scaled by class)
- **Galactic chronicle** — in-game recorded timelapse of ownership and fleet history with event markers
- **Editor** — **Maps → Edit Galaxy** for factions, galaxy contents (stars, hyperlanes, planets, structures), and upcoming events; Details panel for selection-focused edits
- **Persistence** — `localStorage` auto-save; **Save** / **Export** / **Import** JSON for backup and sharing

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close Edit Galaxy, or go up one level (timeline/planet → system → galaxy) |

## Development

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

```bash
npm run build   # production build
npm run preview # preview production build
```

## Campaign JSON format

```json
{
  "version": 1,
  "name": "My Sector",
  "factions": [{ "id": "...", "name": "Imperium", "color": "#c9a227" }],
  "systems": [{ "id": "...", "name": "Cadian System", "x": 1800, "y": 1900, "notes": "" }],
  "planets": [{
    "id": "...",
    "systemId": "...",
    "name": "Cadia",
    "orbitIndex": 0,
    "type": "hive",
    "controllingFactionId": "...",
    "notes": "",
    "battles": [{ "id": "...", "date": "999.M41", "summary": "...", "outcome": "..." }]
  }]
}
```

Planet `type` is one of: `hive`, `forge`, `agri`, `death`, `shrine`, `custom`.

## Stack

Vite, React, TypeScript, Tailwind CSS, Zustand, Zod, react-zoom-pan-pinch, Three.js.
