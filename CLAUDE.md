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

## AAA Architecture

Authentication, Authorization, and Audit infrastructure for the Composer and Collator.

### Auth Provider

- **Composer** and **cloud Collator**: Clerk (`@clerk/express`). JWT tokens sent as `Authorization: Bearer` headers from the browser Clerk SDK; verified server-side via `getAuth(req)`.
- **Offline Collator**: email honor system — officials identify via `POST /api/auth/identify` with their email address, matched against `officials[]` in `camporee.json`. Session stored in `express-session` MemoryStore (intentionally ephemeral; lost on restart).
- **Judges**: no accounts required. Judge-facing routes (`GET /games.json`, `POST /api/score`, `GET|POST /api/entities`, `POST /api/scores/close-game`) are always open. A per-event token system is planned but not yet implemented.

### Composer Permission Model

Stored in `data/shared/conductor.db`, shared by both Composer and the sysadmin script. Managed by the migration runner (`src/db/migrate.js`).

| Table | Purpose |
|---|---|
| `user_profiles` | One row per Clerk user. Stores display_name, email (cached from Clerk on first login), council info, `is_sysadmin`, `is_suspended`. |
| `event_permissions` | `(event_id, user_id) → role`. Roles: `owner` (full control, can invite/remove), `editor` (can save), `viewer` (read-only). Events with no rows are accessible to all users (legacy backwards-compat). |
| `audit_log` | Append-only log of Composer actions (collaborator.invited, official.granted/revoked, game.saved, etc.). |
| `feature_flags` | Named boolean flags with optional per-user override list. |

### Collator Permission Model

Controlled by the `COLLATOR_MODE` environment variable (default: `offline`). Logged at startup.

| Mode | Auth mechanism | Who can upload a cartridge | How officials are recognized |
|---|---|---|---|
| `offline` | `express-session` + email identify | Anyone with server access | Email match against `officials[]` in `camporee.json` |
| `cloud` | Clerk JWT | Any authenticated Clerk user | `event_permissions` table in `camporee.db`, seeded from cartridge `officials[]` on upload |

In cloud mode, the user who uploads the cartridge is inserted as `role = 'director'` regardless of whether they appear in the officials array.

### Officials

Officials are embedded in the cartridge's `camporee.json` as `officials[]`. Each entry: `{ user_id, display_name, email, role }`. The Composer "Share" modal has a per-collaborator "Collator Official" toggle; owners are always included as `role: 'director'`. The `GET /api/events/:eventId/officials` endpoint builds this list at export time from `event_permissions`.

### Sysadmin

`is_sysadmin = 1` in `user_profiles` grants access to `/sysadmin.html` and all `/admin/api/*` endpoints on the Composer. Set via `scripts/make-sysadmin.js` (run inside the Docker container). Sysadmins bypass `requireEventRole` for all events.

### Migration Runner

`src/db/migrate.js` — opens `conductor.db` and applies pending `migrations/*.sql` files in filename order. Tracked in `schema_migrations` table. Called at Composer startup and by the sysadmin script. Current migrations: 001 (user_profiles), 002 (event_permissions), 003 (audit_log), 004 (feature_flags), 005 (curator_admin), 006 (event_metadata), 007 (is_collator_official), 008 (email on user_profiles), 009 (judge_tokens).

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

- **`game.type` is removed in schema v3.0** — Never reference `game.type` in new code. Use `game.league` to determine scoring tier. If you see `type` in existing code, it is legacy and must be replaced.
- **League must be defined before games reference it** — `game.league` is a FK to `camporee.leagues[].id`. The Composer must prevent assigning a game to a non-existent league. Always define leagues first.
- **Session and Division are schema-only in Phase 1** — Do not expose Session or Division configuration in any UI. The fields exist in the schema and travel in the cartridge, but no UI for editing them should be built until explicitly instructed.
- **Roster `id` is immutable** — Never reassign or reuse a roster entry's `id`. If a patrol renames mid-event, update `name` only. Score records are keyed to `id`, not `name`.
- **Zero-Inference Data Integrity** — Never strip `id`, `weight`, `kind`, `audience`, or `config` fields during save/load operations. They control scoring math.
- **Variable-First CSS** — Never hardcode hex colors. Always use CSS variables (`--theme-primary`, `--brand-main`, etc.) defined in `public/css/conductor.css`.
- **Middleware Sanitization** — The Collator strips `source_snapshot` and `variants` before serving `/games.json` to keep judge payloads light. Do not serve these to clients.
- **Scout-Appropriate AI** — All Gemini-generated content must be G-rated, age 11–17, Scout values aligned.
- **`data/` is gitignored** — Runtime data (SQLite DB, game JSON files, presets.json, workspaces) lives in `data/` and is never committed. Code and schema changes are committed.
- **Never run Clerk middleware when `COLLATOR_MODE=offline`** — `clerkMiddleware()` and `getAuth()` must only be invoked in the cloud branch. Calling them in offline mode will throw because no Clerk keys are configured.
- **Never expose judge tokens in API responses beyond their creation endpoint** — when judge tokens are implemented, the raw token string is returned exactly once (at creation). All subsequent API responses return only the token ID or a masked representation.
- **`sysadmin.html` is gated — do not add new static HTML pages with admin functionality** — `express.static('public')` runs in `server.js` before sub-app routes and will serve any file in `public/` without auth. Sensitive pages must have an explicit `app.get(path, requireAuth, ...)` route registered before the static middleware in the relevant sub-app, plus a redirect at the root `server.js` level.
- **`landing.css` depends on `conductor.css` for all color variables** — `landing.html` loads `conductor.css` first, then `landing.css`. The `landing.css` file contains no `:root` color definitions; it references `--green-dark`, `--gold`, etc. from `conductor.css`. If you remove the `conductor.css` link from `landing.html`, all colors will break. This is intentional: `conductor.css` is the single source of truth for the brand palette.
- **`POST /composer/api/early-access` is public (no auth)** — the early-access endpoint in `composer.js` has no `requireAuth` middleware. `clerkMiddleware()` runs but does not reject unauthenticated requests — only `requireAuth` does that. Submissions go to `data/early-access/submissions.json` (gitignored under `data/`).
- **`SESSION_SECRET` has an insecure hardcoded default** — `collator.js` falls back to `'collator-offline-secret'` if `SESSION_SECRET` is unset. Always set a real secret via env var in any internet-facing deployment.

---

## Schema & Data Model

- **Schema version:** 3.0 (branch: `schema-v3`) — `schemas/` directory is the source of truth (AJV validation)
- **Cartridge format** (`CamporeeConfig.zip`): `camporee.json` + `presets.json` + `games/*.json`
- Full schema documentation: `CAMPOREESCHEMA.md`
- **`game.type` is REMOVED in v3.0** — replaced by `game.league` (FK → `camporee.leagues[].id`). Never reference `game.type` in new code.
- **Game files contain only game-specific scoring inputs.** Common fields are NOT baked in.
- `game.variables` — optional `{ key: value }` pairs for template substitution in preset labels
- `game.league` — required FK referencing a league defined in `camporee.leagues[]`
- `game.session` — optional FK referencing a session in `camporee.sessions[]` (Phase 2, null = always visible)

### Key new camporee.json fields (v3.0)

- `terminology` — configurable labels: `unit` (default: "Troop"), `subunit` (default: "Patrol"), `member`, `event`. UI still uses hardcoded BSA labels in Phase 1.
- `leagues[]` — director-defined scoring pools. Each has `id`, `label`, `tier` (`unit|subunit|individual`), `registration` (`registered|open`), `divisions[]` (placeholder)
- `sessions[]` — optional time-slot groupings for judge display. Empty array = flat game list (Phase 2)
- `rosters` — `{ units: UnitRoster[], subunits: SubUnitRoster[], individuals: [] }`. Replaces ad-hoc troop/patrol fields. `id` is immutable integer; `name` is mutable display string. Id ranges: 1–99 units, 100–999 subunits, 1000–9999 individuals (convention only).
- `type_defaults` — now keyed by league `id` (e.g., `"patrol-games"`) instead of `"patrol"` / `"troop"`

### Common Field Injection (updated for v3.0)

Common scoring fields defined once in `presets.json`. Each preset now has a `tier` field (`subunit | unit | all`) replacing hardcoded patrol/troop logic.

- `injectCommonFields()` in `src/servers/collator.js` reads `type_defaults[game.league]` to select presets
- Injection order: `[prefix presets] → [game-specific fields] → [suffix presets]`
- Template syntax `{{variable_name}}` substituted from `game.variables`
- `COMMON_FIELD_IDS` constant in `public/js/apps/composer.js` prevents preset IDs from being baked into game files on export

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
| `migrations/` | Numbered SQL migration files applied to `conductor.db` by `src/db/migrate.js` |
| `scripts/make-sysadmin.js` | CLI tool to grant `is_sysadmin` by email address |
| `public/sysadmin.html` | Sysadmin panel — user management, stats, audit log |
| `public/camporee-conductor-landing.html` | Marketing landing page — served at `GET /` for single-composer deployments |
| `public/css/landing.css` | Landing page styles — references color vars from `conductor.css` |
| `public/identify.html` | Collator offline sign-in page (email identify flow) |

**`data/shared/conductor.db` tables** (Composer + AAA, gitignored):

| Table | Status | Purpose |
|---|---|---|
| `user_profiles` | ✅ built | Clerk user cache — display_name, email, sysadmin/suspended flags |
| `event_permissions` | ✅ built | Composer event roles: owner / editor / viewer |
| `audit_log` | ✅ built | Append-only action log (Composer operations) |
| `feature_flags` | ✅ built | Named boolean flags with per-user overrides |
| `judge_tokens` | ✅ built | Per-event judge access tokens — token_hash (SHA-256), label, expires_at, revoked_at, last_used |
| `collator_events` | 🔲 planned | Cloud-hosted event registry |

**`data/collator/camporee.db` tables** (Collator runtime, gitignored):

In `COLLATOR_MODE=cloud`, also contains `event_permissions (camporee_id, user_id, role)` seeded from the cartridge on upload.

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

## Deployment Architecture (as of 2026-06-04)

### Docker services (4 containers)

| Service | Container | Port | Role |
|---|---|---|---|
| `caddy` | camporee-caddy | 80, 443 | TLS reverse proxy — routes subdomains to services |
| `landing` | camporee-landing | 3002 (internal) | Marketing site + early-access form (`Dockerfile.landing`) |
| `composer` | camporee-composer | 3001 | Composer + Curator Node app |
| `collator` | camporee-collator | 3000 | Collator Node app |

### Caddyfile — `{$CADDY_HOST}` pattern

Single Caddyfile works for both dev and VPS via `CADDY_HOST` env var:

```
{$CADDY_HOST:localhost} {
    tls internal
    reverse_proxy landing:3002
}
composer.{$CADDY_HOST:localhost} {
    tls internal
    reverse_proxy composer:3001
}
collator.{$CADDY_HOST:localhost} {
    tls internal
    reverse_proxy collator:3000
}
```

- **Dev:** `CADDY_HOST` unset → defaults to `localhost` → `tls internal` (Caddy self-signed CA)
- **VPS:** `CADDY_HOST=camporeeconductor.com` → three public subdomains. Note: `tls internal` at a public domain uses Caddy's CA — if traffic goes through Cloudflare proxy, the origin cert doesn't need to be browser-trusted. Verify this is the intended TLS model before go-live.

### Offline Event Deployment (GL.iNet Opal)

At a physical camporee with no internet, the Collator must still be served over HTTPS for Android service workers.

Strategy: use Caddy's `tls internal` CA, pre-install the Caddy root cert on judge phones before the event, or use a pre-obtained wildcard cert via certbot DNS-01 challenge (Cloudflare). The `./certs/` directory (gitignored) is the holding location for pre-obtained certs if that path is taken.

GL.iNet Opal custom DNS: add `address=/camporeeconductor.com/192.168.8.XXX` so judge phones resolve the domain to the laptop's LAN IP without internet.

---

## Known Backlog (as of 2026-06-04)

### Completed Since 2026-03-30

- **CSS Variable Theme Color Picker** — implemented; `meta.theme_colors {main, header, accent}` in camporee.json, color picker UI in Composer Metadata tab, CSS vars injected at runtime by judge.js and data-store.js
- **Exhibition Events** — fully implemented; `type: "exhibition"` games have no common fields and no in-app scoring; shown separately in Collator admin and Official leaderboard
- **Print Scoresheets (grouped UI)** — `utils.html` now has three collapsible sections (Patrol / Troop / Exhibition) with per-game checkboxes and Select All/None
- **Collator redirect paths** — all `res.redirect()` calls use `(req.baseUrl || '/collator')` fallback; `req.baseUrl` is `''` inside ESM sub-app mount
- **The Big Top Goes Down** — full first-aid scenario with 3-victim scene, complete scoring rubric (8 inputs, 0-100 points); game renamed from `accident-at-the-circus`
- **Ten Essentials field** — corrected from `checkbox` to `number` type (0–5 scale) in both active-event and workspace presets.json
- **Troop number T-prefix normalization** — `admin.js`, `judge.js`, `utils.js`, `official.js` all strip leading T before display/sort so double-T never appears regardless of how troop_number was entered
- **Inline rank/score editing** — `updateScoreField()` was called but never defined; implemented in `official.js`; now persists `manual_rank` and `manual_points` via `PUT /api/scores/:uuid`
- **Time column sort** — `official.js` detail table correctly converts `MM:SS` / `H:MM:SS` strings to seconds before comparison
- **Navigation back bug** — `official.html` popstate fallback was calling `switchView('dashboard')` (no-op) instead of `switchView('overview')`; fixed + added "← Games" in-page back button
- **Awards printing** — `utils.html` sticker layout: per-row `<tbody>` with `break-inside: avoid`, adjustable spacing, Patrol/Troop toggle
- **Awards overall name customizable** — hardcoded `'OVERALL LEADERBOARD'` in sticker renderer replaced with `w.gameName` from registry
- **Troop overall flat award** — "Top Dog / Best in Show" mode: awards top N% of troops the same text, no rank differentiation; configurable name, text, and percentage
- **Announcer Sheet** — `utils.html` new print mode: readable per-game ranked list (title + numbered entries + scores), `break-inside: avoid` per block, isolated from sticker print path
- **Judge "Reset Local Data" button** — removed from production judge.html (function preserved in judge.js; see DEV-NOTES.md to restore)
- **AAA (Auth/Authz/Audit)** — Clerk for Composer + cloud Collator; email honor system for offline Collator; `event_permissions`, `audit_log`, `feature_flags`, `judge_tokens` tables; sysadmin panel; migration runner
- **Landing page** — `public/camporee-conductor-landing.html`; CSS in `public/css/landing.css`; early-access form (12 fields) POSTs to `POST /composer/api/early-access`; `GET /` serves landing for single-composer deployments
- **Brand palette** — green/gold palette (`--green-dark`, `--green-mid`, `--green-light`, `--gold`, `--gold-light`, `--cream`, `--slate`) added to `conductor.css` `:root`; app brand vars (`--brand-main`, `--brand-header`, `--brand-accent`) remapped to green/gold; `landing.css` references these vars — `conductor.css` is the single source of truth
- **Subdomain routing + dedicated landing service** — Caddyfile 3-block subdomain config with `{$CADDY_HOST:localhost}` template; nginx replaced by dedicated `landing` Express service (`Dockerfile.landing`, port 3002); `caddy_data` named volume; `CADDY_HOST` env var controls domain in both dev and prod
- **Landing page brand logo** — `CamporeeConductor.png` badge in nav (40px) and hero (120px); `.logo-img` + `.hero-badge` in `landing.css`
- **Schema v3.0 design** — `game.type` removed, replaced by `game.league` (FK to `camporee.leagues[]`); `terminology`, `sessions[]`, `rosters` added to `camporee.json`; full spec in `CAMPOREESCHEMA.md`; implementation work tracked in BACKLOG.md under "Schema v3.0 Work"

### Still Open

- **Challenge Match ("True 2nd Place")** — bracket tournament logic; `Matches`/`Match_Participants` DB tables exist, trigger logic TODO
- **WebSocket leaderboard** — `official.js` currently polls every 15s; upgrade to WebSocket for live push
- **Server consolidation** — merge legacy root `server.js` + `composer_server.js` into `src/`
- **Practice Mode** — flag to let judges test forms without persisting to score queue
- **Composer "Common Fields" panel** — UI for editing `type_defaults` and previewing injected fields per game type
- **Exhibition award print** — no print template for exhibition results (e.g., Slack Line individual ribbons)
