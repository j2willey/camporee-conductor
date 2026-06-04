# Camporee Conductor — Backlog

## Recently Completed

- ✅ CSS Variable Theme Color Picker — theme_colors stored in camporee.json, applied via CSS vars at runtime
- ✅ Exhibition Events as 3rd game type — full Composer UI, Collator results entry, Official view
- ✅ Print Scoresheets grouped by game type — Patrol/Troop/Exhibition grouped checkboxes with Select All/None
- ✅ Collator sub-app redirect fix — req.baseUrl prefix on all internal redirects
- ✅ Game content for Circus Camporee 2026 — 35 games: 18 patrol + 13 troop + 4 exhibition
- ✅ Common Field Injection — presets.json prefix/suffix fields merged at /games.json serve time
- ✅ Game Variables — template substitution ({{variable_name}}) in common field labels
- ✅ Close Game handshake — AI-assisted end-of-game confirmation flow
- ✅ Print scoresheet filter/duplex/exhibition fixes — group filtering works correctly, 2-sided print option, exhibition participation columns
- ✅ Print freeze fix (all print paths) — Blob URL + popup-injected print() prevents calling tab from freezing during print dialog
- ✅ Critical: Composer printPreview data-loss bug — body-swap pattern was wiping camporee on print cancel; replaced with Blob URL approach
- ✅ Coyote Creek Camporee 2026 "The Circus" — ran live May 15–17 at Camp Chesebrough
- ✅ Migration runner — `src/db/migrate.js` applies numbered SQL files in `migrations/` to `conductor.db`; tracked in `schema_migrations`
- ✅ Clerk authentication for Composer — `@clerk/express` middleware; sign-in gate in EJS template; TEST_MODE bypass for CI
- ✅ event_permissions — owner/editor/viewer roles per event; legacy backwards-compat (no rows = open access)
- ✅ Collaborator invite by email with Officials toggle — share modal in Composer; per-collaborator "Collator Official" toggle; officials embedded in exported camporee.json
- ✅ Sysadmin panel — `/sysadmin.html` with user management, stats, audit log; `is_sysadmin` flag; `scripts/make-sysadmin.js`
- ✅ Collator two-mode AAA — `COLLATOR_MODE=cloud` (Clerk + event_permissions seeded from cartridge) or `offline` (email honor system via express-session); `requireOfficial` on all admin routes; `identify.html` for offline sign-in; mode badge in admin header
- ✅ Secrets audit — git history confirmed clean; no .env, Clerk keys, or Gemini keys ever committed
- ✅ `.env.example` — full env var inventory with descriptions; documents all required prod vars and docker-compose-managed vars
- ✅ `.nvmrc` — pins Node 22; consistent with Dockerfile and package.json engines field
- ✅ Sysadmin gate fix — `express.static` was serving `sysadmin.html` before auth; now gated by `requireAuth + requireSysadmin` in composer.js; root-level `/sysadmin.html` redirects to `/composer/sysadmin.html`
- ✅ Dashboard CTA button contrast — `btn-outline-primary` (2.96:1, fails AA) → `btn-primary` (4.51:1, passes AA) on dark `#2b3035` cards
- ✅ `judge_tokens` migration (009) — SHA-256 hash, per-event scope, label, expiry, revocation, last_used tracking
- ✅ Landing page CSS extraction — `public/css/landing.css` extracted from inline `<style>`; `conductor.css` now defines shared green/gold brand palette as `:root` vars; both stylesheets linked from landing.html
- ✅ Landing page early-access form — expanded from email-only to 12-field form (name, email, council, district, role, years, units, patrols, scouts, unit_adults, adult_staff, youth_staff); POSTs JSON to `POST /composer/api/early-access`; submissions appended to `data/early-access/submissions.json`
- ✅ GET / landing page routing — `server.js` serves `landing.html` at root for single-composer deployments; Collator-only still redirects to `/collator/`; multi-service dev still shows dashboard; app remains at `/composer/`
- ✅ Subdomain routing + dedicated landing service — Caddyfile rewritten with 3-block subdomain config (`{$CADDY_HOST:localhost}` template handles dev/prod from same file); nginx replaced by dedicated `landing` Express service (`Dockerfile.landing`, port 3002); `caddy_data` named volume for cert persistence; `CADDY_HOST` in `.env` sets domain
- ✅ Landing page brand logo — `CamporeeConductor.png` badge used in nav (40px) and hero (120px); `landing.css` has `.logo-img` and `.hero-badge` rules; `/images/` served by landing container

---

## Schema v3.0 Work (branch: schema-v3)

This is a breaking schema change. No backwards compatibility. One existing cartridge to migrate.
Full design spec: `CAMPOREESCHEMA.md`. Full UML: see session history 2026-06-04.

### Prompt 1 — Schema + Migration ✅ 2026-06-04

- [x] `schemas/camporee-instance.schema.json` — leagues (required), rosters (required), terminology, sessions (optional) added; type removed; type_defaults updated to accept league ids
- [x] `schemas/game.schema.json` — type removed, league (required) + session (optional) added
- [x] `schemas/preset.schema.json` — new file with tier: unit|subunit|all required field
- [x] `scripts/migrate-schema-v3.js` — idempotent; 3 camporee.json, 119 games, 3 presets.json migrated; bracket_result preset tier: "all" (warned, expected)
- [x] `migrations/010_schema_v3_note.sql` — no-op placeholder documenting JSON-only migration

### Prompt 2 — Core schema.js + Collator ✅ 2026-06-04

- [x] `getGameTier(game, camporee)` added to `public/js/core/schema.js` — exported, browser+Node safe
- [x] `formatGameTitle()` — game.type checks replaced with game.league checks
- [x] `injectCommonFields()` in `src/servers/collator.js` — uses `typeDefaults[game.league]`; tier safety check skips presets whose tier doesn't match the game's league tier
- [x] `loadCamporeeData()` — typeCounters → leagueCounters; leagues passed to injectCommonFields

Flagged for post-schema-v3 cleanup:
- [ ] `collator.js` ~line 50: `entities.type IN ('patrol','troop')` — DB entity tier column, needs DB migration
- [ ] `collator.js` ~line 818: `entity_type: 'patrol'` hardcoded in POST /api/score audit log — should use actual entity tier

### Prompt 3 — Composer server + SPA ✅ 2026-06-04

- [x] `src/servers/composer.js` — GET returns leagues/sessions/rosters/terminology; POST writes league+session; library catalog uses league; manifest includes all v3 fields
- [x] `public/js/apps/composer.js` — DEFAULT_LEAGUES + updated DEFAULT_TYPE_DEFAULTS; leagues/sessions/rosters/terminology in this.data; game editor league selector dynamic; all game.type reads/writes replaced; export writes schemaVersion 3.0

### Prompt 4 — Collator views + utilities ✅ 2026-06-04

- [x] `public/js/official.js` — getLeagueForViewMode() helper; getFilteredGames(), renderMatrix(), renderExhibitionOverview(), openExhibitionDetail() updated
- [x] `public/js/utils.js` — getLeagueForViewMode() helper; getWinnersRegistry(), exportAwardsCSV(), renderAnnouncerSheet(), getFilteredGames(), populateScoresheetGroups(), buildScoresheetHTML() updated
- [x] `public/js/judge.js` — getEntityTypeForLeague() helper; renderStationList(), renderEntityList(), renderBracketLobby(), bracketCreateChallengeMatch() updated
- [x] `public/js/admin.js` — no changes (e.type references are DB entity columns, not game types)

### Prompt 5 — Tests + verification ✅ 2026-06-04

- [x] `tests/unit/schema.test.js` — 6 game fixtures updated: type → league
- [x] `tests/integration/collator.test.js` — fixture camporee.json + p1.json migrated to v3.0; type_defaults key fixed
- [x] `tests/integration/collator-circus.test.js` — TYPE_DEFAULTS keys updated; buildCircusZip() includes v3 fields; test 5+6 assertions updated
- [x] 22/22 unit + integration tests passing
- [x] Smoke test: Composer API, /games.json (34 games, 18 patrol-games / 12 troop-challenges / 4 exhibition), field injection, score submission — all green
- [x] 4 pre-existing E2E failures (Docker/Clerk) confirmed unrelated to schema-v3

---

## Active Backlog

### Infrastructure / Analytics

- ✅ **Analytics — Cloudflare** — basic traffic stats (page views, requests, bots vs humans, countries) available free via Cloudflare dashboard; no setup required since domain already runs through Cloudflare
- [ ] **Analytics — expand if needed** — Plausible ($9/mo, privacy-first, no cookie banner, adds referrer/journey data) or Google Analytics 4 (free, requires cookie consent) as next step when Cloudflare's basic stats aren't enough

### Scoring

- [ ] **Challenge Match ("True 2nd Place")** — bracket tournament logic; Matches/Match_Participants DB tables exist, trigger logic not yet implemented
- [ ] **Score reassignment operation** — `PATCH /api/scores/reassign` to move all scores from one entrant id to another; needed when a patrol is added on the fly by a judge (e.g. "Firehawks") and must be merged into the pre-registered entrant after the fact. Currently requires manual DB edit.

### Judge UI / Entrant Lookup

- [ ] **Entrant search with progressive disambiguation** — judge searches by patrol name; 1 result = confirm with unit name shown; multiple results = show unit name alongside each to disambiguate (e.g. "Troop2-MB" vs "Troop2-SJ"); 0 results = fall back to id lookup or browse by unit; still nothing = add new entrant flagged for official review
- [ ] **Display unit name alongside subunit name in judge entrant picker** — unit names are not required to be unique but must be shown with subunit name so judges can disambiguate duplicate patrol names across units (e.g. two "Sharks" patrols from different troops)

### Collator / Runtime

- [ ] **WebSocket leaderboard** — official.js currently polls every 15s; replace with WebSocket push
- [ ] **Practice Mode for judges** — flag to allow judges to test forms without persisting to the score queue
- [ ] **Exhibition results print/PDF** — results are stored but no ribbon label or print output built yet
- [ ] **Exhibition scoresheet custom columns in UI** — currently hardcoded in buildScoresheetHTML (Troop #, Patrol #, Patrol Name, # Members, # Participating); expose as configurable fields upstream in Composer/game definition
- [ ] **Close Game handshake end-to-end test** — manual testing done; automated test coverage pending

### Composer

- [ ] **Common Fields panel** — UI for editing type_defaults and previewing injected fields per game type
- [ ] **"Print All" scoresheet button** — currently only accessible in Collator tools (utils.html); should be available in Composer export flow

### Composer / UI


### AAA / Infrastructure

- [ ] **Judge token management UI** — director dashboard to generate, view, and revoke per-event judge access tokens; `judge_tokens` table (migration 009) is ready; need token generation API + UI
- [ ] **Post-cartridge-deploy official sync** — adding an official after the cartridge is deployed currently requires a full cartridge re-deploy; should support incremental sync
- [ ] **Email notification to invited collaborators/officials** — no notification is sent when a user is invited to an event in the Composer
- [ ] **Spectator leaderboard** — scores revealed only after the director declares a game final; prevents mid-event result peeking
- [ ] **Collator as a Service provisioning** — decide architecture: shared multi-tenant instance vs per-event containers; `collator_events` table not yet created
- [ ] **Public-facing documentation** — policy, behavior, and onboarding guide for cloud-hosted Camporee Conductor (`cloud.camporeeconductor.com`)

### Infrastructure

- [ ] **Server consolidation** — root-level legacy files (composer_server.js) still exist alongside src/servers/; clean up after confirming nothing depends on them

### Documentation

- [ ] **Event Director's Guide** — operational runbook covering cert renewal, router setup, cartridge load, and event-day checklist
- [ ] **Service worker lockup investigation** — page occasionally freezes completely (F12 unresponsive); suspected SW retry loop; review sync-manager.js and SW fetch handler for infinite retry paths
- [ ] **Post-event retrospective** — gather judge feedback, document what worked/broke at Circus 2026, inform v2 priorities
