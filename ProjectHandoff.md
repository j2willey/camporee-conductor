# Project Handoff: Camporee Conductor

**Date:** May 14, 2026 (Camporee starts tomorrow, May 15–17)
**Author:** Jim Willey, sole developer
**Event:** Coyote Creek District Camporee — "The Circus" — Camp Chesebrough

---

## 1. Mission and Domain Context

Camporee Conductor is an offline-first digital event operating system for BSA (Boy Scouts of America) skill competitions ("Camporees"). It replaces paper scorecards with a portable **Digital Cartridge** system — a single ZIP file that contains the entire event's game definitions, scoring logic, and metadata.

- **Lead Architect/Director:** Jim Willey
- **First production use:** Coyote Creek District Camporee, May 15–17, 2026, theme "The Circus", at Camp Chesebrough
- **AI content rule:** All Gemini-generated content must be G-rated, age 11–17, and consistent with the Scout Oath and Scout Law

---

## 2. Three-Pillar Architecture

| Pillar | Role | Port | Server File |
|---|---|---|---|
| **Curator** | Game template library (generic, reusable) | 3001 | `src/servers/composer.js` |
| **Composer** | Visual event design + cartridge export | 3001 | `src/servers/composer.js` |
| **Collator** | Live-event runtime + judge PWA | 3000 | `src/servers/collator.js` |

**Key points:**

- The `ACTIVE_SERVICES` env var tells each container which pillars to serve: `"collator"` vs `"curator,composer"`
- Legacy root-level files (`collator-server.js`, `composer_server.js`) are superseded by `src/servers/` — **do not modify them**
- In local dev, `server.js` mounts Collator at `/collator` and Composer/Curator at `/composer`
- Two Docker services share the codebase; environment variables control behavior

---

## 3. The Digital Cartridge (Data Format)

`CamporeeConfig.zip` contains three components:

### `camporee.json`
Event manifest with:
- `meta` — title, theme, year, director, camporeeId, `theme_colors { main, header, accent }`, `awards_config`
- `playlist` — ordered array of `{ gameId }` entries
- `type_defaults` — maps game type (`patrol`, `troop`) to preset IDs for common field injection at runtime

### `presets.json`
Common patrol scoring fields shared across all patrol games. Each preset has `position: "prefix" | "suffix"` and `sortOrder`. Current presets:

| Field | Position | Notes |
|---|---|---|
| Patrol Flag | prefix | |
| Patrol Yell | prefix | |
| Scout Spirit | prefix | |
| 10 Essentials | prefix | `type: "number"`, min 0, max 5 |
| Unscoutlike Behavior | suffix | |
| Judges Notes | suffix | |
| Official Score | suffix | |
| Final Ranking | suffix | |
| Overall Points | suffix | |

### `games/*.json`
Individual game definitions. Game files contain **only game-specific scoring inputs** — common fields are NOT baked in. They are injected at serve time.

---

## 4. Common Field Injection

`injectCommonFields()` in `src/servers/collator.js` merges fields at `/games.json` serve time:

```
[prefix presets] → [game-specific fields] → [suffix presets]
```

- Template syntax `{{variable_name}}` in preset labels is substituted from `game.variables`
- **Exhibition** games receive no common fields (no in-app scoring)
- **Troop** games receive only suffix admin fields (Official Score, Final Ranking, Overall Points)
- **Patrol** games receive all prefix + suffix common fields

`COMMON_FIELD_IDS` in `public/js/apps/composer.js` is the authoritative list that prevents common field IDs from being written into game export files.

---

## 5. Two Scoring Shapes — Critical Distinction

These two formats must never be conflated:

| Context | Format | Shape |
|---|---|---|
| Composer stores | `game.scoring_model.inputs[]` | Each input has nested `config: { min, max, placeholder }` |
| Collator serves | `game.fields[]` | Config properties spread to root: `min`, `max`, `placeholder` at top level |

**`normalizeGameDefinition()`** in `public/js/core/schema.js` is the shared translation layer used by both Node and browser. It is the canonical conversion between these two shapes. Keep it import-safe in both environments.

---

## 6. Game Types

| Type | Common Fields | In-App Scoring | Leaderboard |
|---|---|---|---|
| `patrol` | All prefix + suffix presets | Yes | Main leaderboard |
| `troop` | Suffix admin only | Yes | Separate troop section |
| `exhibition` | None | No (manual entry) | Separate exhibition section |

---

## 7. Theme Colors

`meta.theme_colors { main, header, accent }` in `camporee.json`. Read by `judge.js` and `data-store.js`, applied as CSS variables at runtime. Takes effect on next page load — no server restart needed.

**Current Circus colors:**
- Main: `#C62828` (Red)
- Header: `#1565C0` (Blue)
- Accent: `#F9A825` (Gold)

---

## 8. Key Files

| File | Purpose |
|---|---|
| `src/servers/collator.js` | Live-event API, common field injection, Close Game handshake |
| `src/servers/composer.js` | Composer/Curator API |
| `public/js/apps/composer.js` | Composer SPA (~3000 lines), SYSTEM_PRESETS, export logic |
| `public/js/apps/curator.js` | Curator SPA — library browser |
| `public/js/judge.js` | Judge PWA (~2000 lines), offline scoring, sync |
| `public/js/admin.js` | Collator admin dashboard |
| `public/js/official.js` | Official leaderboard (polls every 15s) |
| `public/js/core/schema.js` | `normalizeGameDefinition()`, shared Node + browser |
| `public/js/core/ui.js` | Field HTML rendering helpers |
| `public/js/sync-manager.js` | LocalStorage ↔ server sync queue |
| `public/utils.html` + `public/js/utils.js` | Print scoresheets and supply lists |
| `views/composer/index.ejs` | Composer SPA shell (Bootstrap layout) |
| `schemas/` | AJV JSON schemas — source of truth (schema version 2.9) |
| `data/collator/active-event/` | Unpacked live cartridge (gitignored) |
| `data/composer/workspaces/` | Design workspaces (gitignored) |
| `data/curator/` | Game template library (gitignored) |

---

## 9. Offline HTTPS Deployment

Android blocked plain HTTP in early 2026; service workers require HTTPS or localhost. The event deployment strategy:

1. **Certs:** Obtain Let's Encrypt cert via certbot DNS-01 challenge (Cloudflare) before the event while online. Stored in `./certs/` (gitignored). Valid 90 days.
2. **Proxy:** Run Caddy at the event as an HTTPS reverse proxy in front of the Node server (`sudo caddy run --config Caddyfile`).
3. **Local DNS:** GL.iNet Opal travel router creates event WiFi. dnsmasq custom entry resolves `camporeeconductor.com` to the laptop's LAN IP — no internet required on-site.

Judge phones connect to Opal WiFi → navigate to `https://camporeeconductor.com` → valid cert → PWA installs and works fully offline.

---

## 10. Running the App

```bash
# Docker (recommended for production-like environment)
docker compose up --build -d
docker compose down && docker compose up --build -d && docker compose logs -f

# Local dev (no Docker)
npm run dev:all          # all three services
npm run dev:collator     # collator only

# HTTPS at the event
sudo caddy run --config Caddyfile
```

Requires `GEMINI_API_KEY` in `.env` for AI features. Do not commit this file.

---

## 11. Current State (June 2, 2026)

### Completed (post-event, as of Jun 2)
- Coyote Creek District Camporee "The Circus" — ran live May 15–17, 2026 ✅
- Full AAA: Clerk auth for Composer + cloud Collator; offline email-honor mode; `event_permissions` (owner/editor/viewer); sysadmin panel; migration runner
- `judge_tokens` DB table (migration 009) — ready for token API + UI
- Secrets audit — git history confirmed clean; `.env.example` and `.nvmrc` committed
- Security fix — sysadmin.html now gated before `express.static`
- Landing page — `public/camporee-conductor-landing.html` with full early-access form (12 fields); `POST /composer/api/early-access` writes to `data/early-access/submissions.json`; served at `GET /` for single-composer deployments
- Brand palette — green/gold theme unified across `conductor.css` (app) and `landing.css` (marketing)

### Open Backlog
- **VPS deployment** — Hetzner or DigitalOcean; pre-VPS checklist nearly complete; remaining: browser smoke test, Clerk Production instance config, `SESSION_SECRET` in `.env`
- **Judge token API + UI** — `judge_tokens` table ready; need `POST /api/events/:eventId/judge-tokens` and director panel
- **Challenge Match ("True 2nd Place")** — bracket tournament logic; DB tables exist, trigger logic TODO
- **WebSocket leaderboard** — `official.js` currently polls every 15s
- **Server consolidation** — legacy root files still present
- **Practice Mode** — judges cannot test forms without affecting live scores
- **Composer "Common Fields" panel** — no UI for editing `type_defaults` or previewing injected fields per game type
- **Exhibition award print template** — not yet created
- **E2E test suite** — 4 tests fail when Docker containers running (real Clerk vs TEST_MODE mismatch)

---

## 12. Critical Guardrails

- **Zero-Inference Data Integrity** — Never strip `id`, `weight`, `kind`, `audience`, or `config` fields during save/load operations. They control scoring math.
- **Variable-First CSS** — Never hardcode hex colors. Always use CSS variables (`--theme-primary`, `--brand-main`, etc.) defined in `public/css/conductor.css`.
- **Middleware Sanitization** — The Collator strips `source_snapshot` and `variants` before serving `/games.json`. Do not serve these to judge clients.
- **Scout-Appropriate AI** — All Gemini-generated content must be G-rated, age 11–17, Scout values aligned.
- **`data/` is gitignored** — Runtime data (SQLite DB, game JSON files, presets.json, workspaces) lives in `data/` and is never committed. Code and schema changes are committed.

---

## 13. Next Steps for a New Agent

1. Run `npm test` to verify the baseline (unit, integration, e2e suites)
2. Read `CLAUDE.md` for full technical context and coding conventions
3. Inspect `data/collator/active-event/` to see the currently loaded event cartridge
4. For runtime questions, start with `src/servers/collator.js`
5. For design tool questions, start with `public/js/apps/composer.js`
6. Schema source of truth is `schemas/` — validate against AJV schemas before assuming field shapes
