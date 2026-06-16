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
- ✅ Landing page early-access form — expanded from email-only to 12-field form; POSTs JSON to `POST /composer/api/early-access`; submissions appended to `data/early-access/submissions.json`
- ✅ GET / landing page routing — `server.js` serves `landing.html` at root for single-composer deployments
- ✅ Subdomain routing + dedicated landing service — Caddyfile rewritten with 3-block subdomain config (`{$CADDY_HOST:localhost}` template); nginx replaced by dedicated `landing` Express service (`Dockerfile.landing`, port 3002)
- ✅ Landing page brand logo — `CamporeeConductor.png` badge in nav (40px) and hero (120px)
- ✅ Schema v3.0 — `game.type` removed → `game.league` (FK to `camporee.leagues[]`); AJV schemas, migration script, all client JS updated; 22/22 tests passing (2026-06-04)
- ✅ DATA_DIR — `docker-compose.yml` uses `${DATA_DIR:-./data}` for all data volume mounts; `.env.example` documents dev/VPS values; dev data migrated to `~/camporee-data/`; stale `camp0001`/`camp0002` workspaces deleted (2026-06-05)
- ✅ ARCHITECTURE.md — full design doc added (§1–11: data storage, workspace isolation, game lineage, library tiers, localization tokens, community model, Curator architecture, AI Templatize, three wizards, onboarding, adoption curve); Curator design section added (2026-06-05)
- ✅ CuratorService (Model A zip vault) — `src/lib/curator-service.js`; template storage as immutable zip files; LRU unpack cache (max 20); startup cache clear; `listTemplates`, `getTemplateMeta` (with token inventory), `getTemplateZip`, `submit`, `invalidateCache`, `clearCache` (2026-06-05)
- ✅ Curator template API — `GET /curator/api/templates` (public), `GET /curator/api/templates/:id/meta` (public), `GET /curator/api/templates/:id/zip` (requireAuth), `POST /curator/api/templates` (requireAuth + requireSysadmin); `/curator/api` forwarding via server.js (2026-06-05)
- ✅ "Use this template" endpoint — `POST /composer/api/from-template/:templateId`; unpacks zip into new UUID workspace, inserts owner permission row, writes audit log entry `event.created_from_template` (2026-06-05)
- ✅ Curator UI — Camporee Templates tab — mode toggle (Games / Camporee Templates) in Curator navbar; template sidebar + preview panel (title, theme, game list, token inventory); "Use This Template" button → POSTs to from-template, redirects to `/composer/?event={id}` (2026-06-05)
- ✅ `/curator/` redirect loop fix — `app.get('/curator', redirect)` with Express `strict: false` matched `/curator/` too, looping; replaced with `app.get(['/curator', '/curator/'], sendFile)` (2026-06-05)
- ✅ Legacy root-level server files deleted — `collator-server.js` and `composer_server.js` removed; no live references (2026-06-06)
- ✅ E2E tests pass regardless of Docker state — E2E webServers moved to ports 4000/4001 (Docker never binds there); `reuseExistingServer: false`; `TEST_MODE` bypass added to collator `requireOfficial`, page-redirect middleware, and `whoami`; `beforeAll` uploads minimal cartridge for tests needing a loaded event; 8/8 passing (2026-06-06)
- ✅ UUID workspace IDs — workspace folder names are now always auto-generated UUIDs; user provides a human-friendly Camporee Name stored as `meta.title`; server enforces UUID format on all workspace routes; first-time welcome pane shown when user has no camporees; per-user title uniqueness checked client-side (2026-06-06)
- ✅ **camporeeconductor.com LIVE** — VPS deployed; Clerk Production + Google OAuth configured; SESSION_SECRET set; 2GB swap added; Dockerfile npm install path fixed (2026-06-06)

---

## Schema v3.0 Work — COMPLETE (merged to main 2026-06-04)

All 5 prompts done. Flagged for future cleanup:
- [ ] `collator.js` ~line 50: `entities.type IN ('patrol','troop')` — DB entity tier column still uses pre-v3 strings; needs a future DB migration when roster model is upgraded
- [ ] `collator.js` ~line 818: `entity_type: 'patrol'` hardcoded in POST /api/score audit log — should resolve from actual entity tier
- ✅ **Upgrade Curator-stored Circus cartridge to v3.0** — Circus workspace was already v3.0; added `event_permissions` owner row for Jim; removed `TYPE_TO_LEAGUE` fallback from `seed-demo.js`; orphaned pre-v3 Curator zip (`camporees/Coyote_Creek_District_Camporee_2026.zip`) and `camporee-catalog.json` deleted from data dir (2026-06-16)

---

## Active Backlog

### Pre-VPS Blockers

- ✅ **Clerk Production instance** — configured; Google OAuth working (2026-06-06)
- ✅ **Set SESSION_SECRET** — real value set on VPS (2026-06-06)
- [ ] **Full browser smoke test** — Google sign-in → create camporee (UUID/name flow) → invite collaborator → verify `event_permissions` row in DB
- ✅ **E2E test fix** — 8/8 Playwright tests pass regardless of Docker state (ports 4000/4001; 2026-06-06)

### Site Demo / Buy-In Experience

See `SITE_DEMO_DESIGN.md` for full design. Two-phase rollout: Phase 1 (Clerk auth, preview accounts) → Phase 2 (no-auth playground, future).

- ✅ **SSE Officials View** — replaced 15s polling with Server-Sent Events push; `broadcastScoreUpdate()` fires after every score write (2026-06-12)
- ✅ **Demo Collator container** — `demo-collator` Docker service at `demo.camporeeconductor.com`; `DEMO_MODE=true`; password "Camporee" + email access log (2026-06-12)
- ✅ **Demo seeded state + nightly reset cron** — `scripts/seed-demo.js` wipes DB + seeds 288 patrol scores; cron at 3am nightly (2026-06-12)
- ✅ **Judge Phone Emulator page** — `public/demo-phone.html`; CSS phone bezel wrapping judge PWA iframe side-by-side with Officials leaderboard; `?autorefresh=1` enables SSE auto-push (2026-06-12)
- [ ] **VPS: complete demo collator deploy** — place cartridge zip, rebuild container, run initial seed, add cron; DNS record already created on Cloudflare
- [ ] **Offline/Online toggle in Judge Emulator** — localStorage flag causes judge app to queue locally (OFFLINE) or flush+sync (ONLINE); reuses `sync-manager.js`; same infrastructure as per-judge DEMO mode
- [ ] **Composer demo event for preview accounts** — link Phase 1 preview account holders to demo camporee on first login
- [ ] **Landing page video/slide deck embed** — content Jim creates; embed is trivial when ready
- [ ] **Phase 2: No-auth playground** — (future, after Phase 1 feedback incorporated)
- [ ] **Offline/Online toggle in Judge Emulator** — localStorage flag causes judge app to queue locally (OFFLINE) or flush+sync (ONLINE); reuses `sync-manager.js`; same infrastructure as per-judge DEMO mode
- [ ] **Composer demo event for preview accounts** — link Phase 1 preview account holders to demo camporee on first login
- [ ] **Landing page video/slide deck embed** — content Jim creates; embed is trivial when ready
- [ ] **Phase 2: No-auth playground** — (future, after Phase 1 feedback incorporated)

### Infrastructure / Analytics

- ✅ **Analytics — Cloudflare** — basic traffic stats available free via Cloudflare dashboard; no setup required
- [ ] **Analytics — expand if needed** — Plausible ($9/mo, privacy-first) or GA4 (free, cookie consent required) when Cloudflare basic stats aren't enough

### Scoring

- [ ] **Challenge Match ("True 2nd Place")** — bracket tournament logic; `Matches`/`Match_Participants` DB tables exist, trigger logic not yet implemented
- [ ] **Score reassignment operation** — `PATCH /api/scores/reassign` to move all scores from one entrant id to another; needed when a patrol is added on the fly and must be merged into a pre-registered entrant

### Judge UI / Entrant Lookup

- [ ] **Entrant search with progressive disambiguation** — 1 result = confirm with unit name; multiple = show unit name alongside each; 0 = fall back to id lookup or add new (flagged for official review)
- [ ] **Display unit name alongside subunit name in judge entrant picker** — prevents ambiguity when two "Sharks" patrols exist from different troops

### Collator / Runtime

- [ ] **WebSocket leaderboard** — `official.js` currently polls every 15s; replace with WebSocket push
- [ ] **Practice Mode for judges** — flag to allow judges to test scoring forms without persisting to the score queue
- [ ] **Exhibition results print/PDF** — results stored but no ribbon label or print output built yet
- [ ] **Exhibition scoresheet custom columns in UI** — Troop #, Patrol #, etc. currently hardcoded in `buildScoresheetHTML`; expose as configurable upstream in Composer
- [ ] **Close Game handshake end-to-end test** — manual testing done; automated test coverage pending

### Composer

- [ ] **Common Fields panel** — UI for editing `type_defaults` and previewing injected fields per game type
- [ ] **"Print All" scoresheet button** — currently only in Collator tools (utils.html); should be in Composer export flow

### AAA / Infrastructure

- [ ] **Judge token management UI** — director dashboard to generate, view, and revoke per-event judge access tokens; `judge_tokens` table (migration 009) ready; need `POST /api/events/:eventId/judge-tokens` + UI
- [ ] **Post-cartridge-deploy official sync** — adding an official after cartridge deploy requires full re-deploy; needs incremental sync
- [ ] **Email notification to invited collaborators/officials** — no notification sent when a user is invited via the Composer Share modal
- [ ] **Spectator leaderboard** — scores revealed only after director declares a game final
- [ ] **Collator as a Service provisioning** — architecture decision: shared multi-tenant instance vs per-event containers; `collator_events` table not yet created
- [ ] **Public-facing documentation** — policy, behavior, and onboarding guide for cloud-hosted Camporee Conductor

### Infrastructure

- ✅ **Server consolidation** — `collator-server.js` and `composer_server.js` deleted (2026-06-06)

### Curator / Community Library

Model A zip vault is live. Remaining work builds on top of it:

- [ ] **Director self-submission** — POST /curator/api/templates currently requires sysadmin; open it to authenticated directors (with optional review gate before going public)
- [ ] **Localization tokens — apply to seed content** — tokenize Coyote Creek Circus camporee (`{{venue_name}}`, `{{event_date}}`, `{{council_name}}`, etc.) to make it a clean community template; guide contributors toward tokens in the game editor
- [ ] **AI Templatize tool** — converts a run camporee into a Curator-ready template: strips PII, injects localization tokens, suggests theme name; director review/approve flow before submission. See `ARCHITECTURE.md §8`
- [ ] **Wizard 2 — Localize a template** — triggered after "Use this template" creates a workspace; interview for localization fields; single-pass `{{token}}` replacement across all game stories and camporee manifest. See `ARCHITECTURE.md §9`
- [ ] **Wizard 1 — Build from scratch** — interview director for theme/dates/venue; scaffold camporee; suggest matching library games. See `ARCHITECTURE.md §9`
- [ ] **New user onboarding** — detect zero `event_permissions` rows on first login; redirect to Curator with Wizard 1/2 entry points rather than empty Composer workspace. See `ARCHITECTURE.md §10`
- [ ] **Post-event share prompt** — after event date passes, prompt director to share camporee with community; key mechanism for library growth
- [ ] **Template versioning** — new submission = new version; "updated version available" notification for workspaces forked from older template versions
- [ ] **Games as first-class citizens** — refactor nested `workspaces/{id}/games/` into flat `data/games/{gameId}/` pool with `source_game_id` for fork lineage; `is_library_game` flag; "promote to library" workflow. See `ARCHITECTURE.md §3–4`
- [ ] **`is_public` flag on camporees** — foundation for community browsing; Curator can surface `WHERE is_public = true` events

### Documentation

- [ ] **Event Director's Guide** — operational runbook: cert renewal, router setup, cartridge load, event-day checklist
- [ ] **Service worker lockup investigation** — page occasionally freezes completely (F12 unresponsive); suspected SW retry loop; review `sync-manager.js` and SW fetch handler for infinite retry paths
- [ ] **Post-event retrospective** — gather judge feedback from Circus 2026, document what worked/broke, inform v2 priorities
