# Galaxy Campaign Map

Interactive sector map for narrative wargame campaigns (Warhammer 40,000–style). Pan and zoom a galaxy view, drill into star systems and planets, and track factions, notes, and battle logs. Data auto-saves in the browser and can be exported as JSON.

## Features

- **Galaxy view** — pan/zoom (mouse wheel, drag), click a star to open its system
- **System view** — planets on orbital rings; click a planet for details
- **Planet view** — notes and battle log entries
- **Editor** — toggle **Edit mode** on the galaxy map to drag stars; inspector for systems, planets, and factions
- **Persistence** — `localStorage` auto-save; **Export** / **Import** JSON for backup and sharing

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `E` | Toggle edit / navigate (galaxy view only) |
| `Escape` | Go up one level (planet → system → galaxy) |

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

Vite, React, TypeScript, Tailwind CSS, Zustand, Zod, react-zoom-pan-pinch.
