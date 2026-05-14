# Camporee Conductor — Claude Context

## Project Identity

**Camporee Conductor** is an offline-first digital event operating system for BSA (Boy Scouts of America) skill competitions ("Camporees"). It replaces paper scorecards with a portable "Digital Cartridge" system.

- **Lead Architect/Director:** Jim Willey (sole developer)
- **Real-world use:** Jim is Camporee Director for Coyote Creek Camporee (May 15–17, 2026)
- **Goal:** Production-quality tool adoptable by other Councils and Districts
- **AI Content Rule:** All AI-generated content must be G-rated, age-appropriate (11–17), and consistent with the Scout Oath and Scout Law

---

## Architecture

Three pillars, two Docker services:

| Pillar | Role | Port | Active Server File |
|---|---|---|---|
| **Curator** | Game template library | 3001 (shared) | `src/servers/composer.js` |
| **Composer** | Visual event design + export | 3001 | `src/servers/composer.js` |
| **Collator** | Live-event runtime + judge PWA | 3000 | `src/servers/collator.js` |

The `ACTIVE_SERVICES` env var tells each container which pillars to serve (`collator` vs `curator,composer`). The legacy root-level `collator-server.js` and `composer_server.js` are superseded by `src/servers/` — do not modify the root-level files.

---

## Memory Management

Maintain a structured memory system rooted at .claude/memory/

### Structure
- memory.md — index of all memory files, updated whenever you create or modify one
- general.md — cross-project facts, preferences, environment setup
- domain/{topic}.md — domain-specific knowledge (one file per topic)
- tools/{tool}.md — tool configs, CLI patterns, workarounds

### Rules
1. When you learn something worth remembering, write it to the right file immediately
2. Keep memory.md as a current index with one-line descriptions
3. Entries: date, what, why — nothing more
4. Read memory.md at session start. Load other files only when relevant
5. If a file doesn't exist yet, create it

### Maintenance
When I say "reorganize memory":
1. Read all memory files
2. Remove duplicates and outdated entries
3. Merge entries that belong together
4. Split files that cover too many topics
5. Re-sort entries by date within each file
6. Update memory.md index
7. Show me a summary of what changed

---

## Running the App

```bash
# Docker (recommended)
docker compose up --build -d
docker compose down && docker compose up --build -d && docker compose logs -f

# Local dev (no Docker)
npm run dev:all          # all three services
npm run dev:collator     # collator only
```

Requires `GEMINI_API_KEY` in `.env` for AI features (do not commit the key).

---

## Testing

```bash
npm run test:unit         # vitest — schema/normalizer unit tests
npm run test:integration  # vitest — API tests (Gemini mocked)
npm run test:e2e          # playwright — requires servers on localhost:3000/3001
npm test                  # all three
```

---

## Critical Guardrails

- **Zero-Inference Data Integrity** — Never strip `id`, `weight`, `kind`, `audience`, or `config` fields during save/load operations. They control scoring math.
- **Variable-First CSS** — Never hardcode hex colors. Always use CSS variables (`--theme-primary`, `--brand-main`, etc.) defined in `public/css/conductor.css`.
- **Middleware Sanitization** — The Collator strips `source_snapshot` and `variants` before serving `/games.json` to keep judge payloads light. Do not serve these to clients.
- **Scout-Appropriate AI** — All Gemini-generated content must be G-rated, age 11–17, Scout values aligned.
- **`data/` is gitignored** — Runtime data (SQLite DB, game JSON files, presets.json, workspaces) lives in `data/` and is never committed. Code and schema changes are committed.

---

## Schema & Data Model

- **Schema version:** 2.9 — `schemas/` directory is the source of truth (AJV validation)
- **Cartridge format** (`CamporeeConfig.zip`): `camporee.json` + `presets.json` + `games/*.json`
- `camporee.json` includes `type_defaults` — maps game type to preset IDs for runtime injection
- **Game files contain only game-specific scoring inputs.** Common fields are NOT baked in.
- `game.variables` — optional `{ key: value }` pairs for template substitution in common field labels (e.g., `ten_essentials: "matches"` → label becomes "10 Essentials: matches")
- Game types: `patrol` | `troop` | `exhibition`. Exhibition has no common fields and no in-app scoring.

---

## Common Field Injection (implemented 2026-03-30)

Common patrol scoring fields (Patrol Flag, Patrol Yell, Scout Spirit, 10 Essentials, Unscoutlike Behavior, Judges Notes, Official Score, Final Ranking, Overall Points) are defined **once** in `presets.json` with `position: "prefix" | "suffix"` and `sortOrder`.

- `injectCommonFields()` in `src/servers/collator.js` merges them at `/games.json` serve time: `[prefix presets] → [game-specific fields] → [suffix presets]`
- Template syntax `{{variable_name}}` in preset labels/placeholders is substituted from `game.variables`
- `COMMON_FIELD_IDS` constant in `public/js/apps/composer.js` prevents these IDs from being baked into game files on export
- Troop events get only the suffix admin fields (Official Score, Final Ranking, Overall Points)

---

## Key Files

| File | Purpose |
|---|---|
| `src/servers/collator.js` | Live-event runtime API (port 3000) |
| `src/servers/composer.js` | Event design + library API (port 3001) |
| `public/js/apps/composer.js` | Composer SPA — all game editing logic, SYSTEM_PRESETS, export |
| `public/js/apps/curator.js` | Curator SPA — library browser |
| `public/js/judge.js` | Judge PWA (~2000 lines) — offline scoring, sync |
| `public/js/admin.js` | Admin/Collator dashboard |
| `public/js/official.js` | Official leaderboard view |
| `public/js/core/schema.js` | `normalizeGameDefinition()` — shared Node + browser |
| `public/js/core/ui.js` | Field HTML rendering helpers |
| `public/js/core/api.js` | HTTP client wrappers |
| `public/js/sync-manager.js` | LocalStorage ↔ server sync queue |
| `views/composer/index.ejs` | Composer SPA shell (Bootstrap layout) |
| `schemas/` | AJV JSON schemas |
| `data/collator/active-event/` | Unpacked live cartridge (gitignored) |
| `data/composer/workspaces/` | Composer design workspaces (gitignored) |
| `data/curator/` | Game template library (gitignored) |

---

## Coding Conventions

- **ES Modules** throughout (`"type": "module"` in package.json) — use `import`/`export`
- **Vanilla JS** — no React, Vue, or other frameworks. Bootstrap 5 for UI components.
- `normalizeGameDefinition()` in `public/js/core/schema.js` is the canonical translation layer between Composer format (`scoring_model.inputs`) and Collator runtime format (`fields` with config spread to root). It is shared between server (Node) and browser — keep it import-safe in both.
- **Two scoring shapes — don't conflate:**
  - Composer stores: `game.scoring_model.inputs[]` (nested `config` object)
  - Collator serves: `game.fields[]` (config properties spread to root: `min`, `max`, `placeholder` at top level)
- The Composer's `SYSTEM_PRESETS` array and the `data/*/presets.json` files must stay in sync when adding or changing presets.

---

## Offline Event Deployment (Caddy + Let's Encrypt)

The Collator must be served over HTTPS. Android blocked plain HTTP in early 2026; the judge PWA requires HTTPS or localhost for service workers to register.

### Certificate Strategy (DNS-01 Challenge — No Internet Required at Event)

Obtain certs **before** the event while still online. The DNS-01 ACME challenge proves domain ownership via a TXT record in Cloudflare — no HTTP server needed.

```bash
# Install certbot + Cloudflare plugin (once)
sudo apt install certbot python3-certbot-dns-cloudflare

# Create credentials file (do not commit)
# ~/.secrets/certbot/cloudflare.ini
#   dns_cloudflare_api_token = YOUR_CF_API_TOKEN
chmod 600 ~/.secrets/certbot/cloudflare.ini

# Obtain cert (domain: camporeeconductor.com)
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini \
  -d camporeeconductor.com \
  -d "*.camporeeconductor.com"

# Copy certs to project ./certs/ (gitignored)
cp /etc/letsencrypt/live/camporeeconductor.com/fullchain.pem ./certs/
cp /etc/letsencrypt/live/camporeeconductor.com/privkey.pem ./certs/
```

Certs are valid 90 days. Renew before each event (can be done from home while online).

### Caddy Configuration

`Caddyfile` in the repo root (gitignored — contains cert paths):

```
camporeeconductor.com {
  tls ./certs/fullchain.pem ./certs/privkey.pem
  reverse_proxy localhost:3000
}
```

Start Caddy: `sudo caddy run --config Caddyfile`

### GL.iNet Opal (OpenWrt) Local DNS

The GL.iNet Opal travel router creates the event WiFi. Configure dnsmasq so `camporeeconductor.com` resolves to the laptop's LAN IP (not the internet).

In GL.iNet admin → More Settings → Custom DNS: add:
```
address=/camporeeconductor.com/192.168.8.XXX
```
(Replace `XXX` with the laptop's actual IP on the Opal network — check `ip addr` on the Opal interface.)

Judge phones connect to the Opal WiFi, navigate to `https://camporeeconductor.com`, get the valid cert, and the PWA installs. No internet required at the venue.

---

## Known Backlog (as of 2026-05-14)

### Completed Since 2026-03-30

- **CSS Variable Theme Color Picker** — implemented; `meta.theme_colors {main, header, accent}` in camporee.json, color picker UI in Composer Metadata tab, CSS vars injected at runtime by judge.js and data-store.js
- **Exhibition Events** — fully implemented; `type: "exhibition"` games have no common fields and no in-app scoring; shown separately in Collator admin and Official leaderboard
- **Print Scoresheets (grouped UI)** — `utils.html` now has three collapsible sections (Patrol / Troop / Exhibition) with per-game checkboxes and Select All/None
- **Collator redirect paths** — all `res.redirect()` calls use `req.baseUrl` prefix for correct behavior when mounted at `/collator` in dev
- **The Big Top Goes Down** — full first-aid scenario with 3-victim scene, complete scoring rubric (8 inputs, 0-100 points); game renamed from `accident-at-the-circus`
- **Ten Essentials field** — corrected from `checkbox` to `number` type (0–5 scale) in both active-event and workspace presets.json

### Still Open

- **Challenge Match ("True 2nd Place")** — bracket tournament logic; `Matches`/`Match_Participants` DB tables exist, trigger logic TODO
- **WebSocket leaderboard** — `official.js` currently polls every 15s; upgrade to WebSocket for live push
- **Server consolidation** — merge legacy root `server.js` + `composer_server.js` into `src/`
- **Practice Mode** — flag to let judges test forms without persisting to score queue
- **Composer "Common Fields" panel** — UI for editing `type_defaults` and previewing injected fields per game type
- **Exhibition award print** — no print template for exhibition results (e.g., Slack Line individual ribbons)
