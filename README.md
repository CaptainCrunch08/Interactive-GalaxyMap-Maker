# Interactive-GalaxyMap-Maker

A passion project I used to explore Cursor AI capabilities and how to best work with Cursor AI

Allows for custom or procedural generation of interactive galaxies for long term campaigns. Includes an optional hotseat turn tracker per faction, fleet movements, regiment movements, area control, a timelapse of events, and more.

Interactive sector map for narrative wargame campaigns. Pan and zoom a galaxy view, drill into star systems and planets, and track factions, notes, and battle logs. Maps sync to Cloudflare (D1 + R2) after invite-only login; the browser keeps a local cache. Export/Import JSON remains available as backup.

**Live site:** [galaxymapmaker.com](https://galaxymapmaker.com) (Cloudflare Access — allowlisted emails only)

## Features

- **Private login** — Cloudflare Access OTP / IdP; unauthenticated visitors never reach the app
- **Cloud saves** — galaxy maps stored per allowlisted email (D1 metadata + R2 JSON blobs)
- **Galaxy view** — pan/zoom (mouse wheel, drag), click a star to open its system
- **System view** — planets on orbital rings; click a planet for details
- **Planet / strategic view** — settlements, armies, and battle logs
- **Fleets** — compose and move fleets between systems along hyperlanes
- **Territory** — faction ownership and influence blobs across the map
- **Hotseat turns (Play mode)** — **Start campaign** in the top bar; only the active faction can move fleets/armies (one move each per turn). **Edit Galaxy** and free editing stay fully unrestricted. Building points: each owned manufactorum on a planet banks **10 BP/turn** on that world; spend **500** at a War Camp for a detachment, **1000** to build a manufactorum next to an owned city, or build ships at a Space Port (**50 BP** escort, other hulls scaled by class)
- **Galactic chronicle** — in-game recorded timelapse of ownership and fleet history with event markers
- **Editor** — **Maps → Edit Galaxy** for factions, galaxy contents (stars, hyperlanes, planets, structures), and upcoming events; Details panel for selection-focused edits
- **Persistence** — cloud autosave (source of truth); `localStorage` as cache; **Save** / Export / Import JSON for backup and sharing

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close Edit Galaxy, or go up one level (timeline/planet → system → galaxy) |

## Development

```bash
npm install
npm run dev          # Vite SPA on http://localhost:5173
```

For cloud API locally (second terminal):

```bash
npm run db:migrate:local   # once: apply D1 schema to local DB
npm run pages:dev          # Pages Functions + local D1/R2 on :8788
```

Vite proxies `/api/*` to port `8788`. Open [http://localhost:5173](http://localhost:5173). Auth uses `VITE_DEV_AUTH_EMAIL` (`.env.development`) and the matching `DEV_AUTH_EMAIL` binding on Wrangler — no Access JWT required locally.

```bash
npm run build          # production build → dist/
npm run pages:deploy   # deploy dist + functions/ to Cloudflare Pages
npm run preview        # vite preview of dist only (no Functions)
```

## Cloudflare setup (production)

### 1. D1 + R2

```bash
npx wrangler d1 create galaxy-map-saves
npx wrangler r2 bucket create galaxy-map-saves
```

Paste the D1 `database_id` into `wrangler.toml` (`REPLACE_WITH_D1_DATABASE_ID`). Then:

```bash
npm run db:migrate:remote
```

In the Pages project → **Settings → Bindings**, confirm:

| Binding | Type | Resource |
|---------|------|----------|
| `DB` | D1 | `galaxy-map-saves` |
| `MAPS` | R2 | `galaxy-map-saves` |

### 2. Cloudflare Access (invite-only login)

1. Zero Trust → **Access** → **Applications** → Add application → **Self-hosted**
2. Application domain: `galaxymapmaker.com` (and optionally `*.pages.dev` for preview URLs)
3. Policy: **Allow** → include specific emails (or an email domain). This allowlist is the invite list — there is no public signup.
4. Copy:
   - **Team domain** (e.g. `yourteam.cloudflareaccess.com`)
   - Application **Audience (AUD)** tag
5. Pages → **Settings → Environment variables** (production):

| Name | Value |
|------|--------|
| `CF_ACCESS_TEAM_DOMAIN` | `yourteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | *(AUD tag from the Access app)* |

Do **not** set `DEV_AUTH_EMAIL` in production.

### 3. Deploy

**Git auto-deploy** uses Cloudflare **Workers Builds** for `interactive-galaxymap-maker` (`wrangler.toml` → static `dist/` SPA). That is what updates galaxymapmaker.com on push to `main`.

Cloud map saves (D1 / R2 / `functions/`) are configured in [`wrangler.pages.toml`](wrangler.pages.toml) — enable those bindings with real resource IDs before relying on `/api`.

```bash
npx wrangler login
npm run workers:deploy   # same SPA path as Git Workers Builds
# optional Pages API host once D1/R2 IDs are set in wrangler.pages.toml:
# npm run pages:deploy
```

### Verify

1. Incognito → `https://galaxymapmaker.com` → Access login (email OTP or IdP), not the public SPA
2. After login, app shows your email (corner) and loads maps from `/api/maps`
3. Edit a galaxy → wait ~1s → reload → changes persist
4. Second allowlisted email sees only their own maps

## API

Authenticated via Cloudflare Access JWT (`Cf-Access-Jwt-Assertion` / `CF_Authorization` cookie). Locally: `X-Dev-Email` / `DEV_AUTH_EMAIL` when Access env vars are unset.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/me` | Signed-in email |
| `GET` | `/api/maps` | List map metadata for current user |
| `GET` | `/api/maps/:id` | Full campaign JSON |
| `PUT` | `/api/maps/:id` | Upsert metadata + body |
| `POST` | `/api/maps` | Create map |
| `DELETE` | `/api/maps/:id` | Delete metadata + R2 object |

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

Vite, React, TypeScript, Tailwind CSS, Zustand, Zod, react-zoom-pan-pinch, Three.js, Cloudflare Pages Functions, D1, R2, Access (Zero Trust).
