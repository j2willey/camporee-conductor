# Site Demo Implementation Plan

> Created 2026-06-12. Pick up from here if session is lost.
> Source of truth for demo build-out. Update status inline as steps complete.

---

## Context

Goal: give Camporee Directors and District Execs a hands-on demo of the full suite
(Composer → Officials View → Judge PWA) so they evaluate it before adopting.

Full design: `SITE_DEMO_DESIGN.md`

---

## Build Order & Status

### Step 1 — SSE Officials View ✅ IN PROGRESS
**Why first:** Officials view currently polls every 15s. Demo prospect submits a score
and waits 15s = thinks it's broken. Must fix before demo infrastructure matters.

**What SSE is (not WebSocket):**
- WebSocket = two-way persistent connection. Needs `ws` package + HTTP server refactor.
- SSE = one-way push (server → browser). Plain HTTP, no packages. Browser auto-reconnects.
- Officials write scores via normal HTTP POST/PUT (unchanged). SSE just taps their browser
  when something changes. One-directional push is all we need.

**Files changed:**
- `src/servers/collator.js` — `GET /api/sse` endpoint + `broadcastScoreUpdate()` called after
  `POST /api/score`, `PUT /api/scores/:uuid`, `POST /api/scores/close-game`,
  `PUT /api/official/flags/:gameId/:entityId`
- `public/js/official.js` — replace `setInterval` with `EventSource`
- `Caddyfile` — add `flush_interval -1` to collator block (required for SSE through Caddy)

**Decisions:**
- SSE endpoint is public (no requireOfficial) — matches official.html which is also public
- `/api/sse` added to `requireConfig` bypassRoutes (safe even if no cartridge loaded)
- EventSource lives on the same variable previously named `autoRefreshInterval` (renamed `sseSource`)

---

### Step 2 — Demo Collator Container ⬜ NOT STARTED

**New Docker service:** `demo-collator`, port 3003, `DEMO_MODE=true COLLATOR_MODE=offline`

**Auth model (decided):** Same identify.html workflow as offline collator, with two changes:
1. Password field added. Universal password: `"Camporee"` (case-insensitive). Any email + correct
   password gets in — no `officials[]` check against camporee.json.
2. Access log: `{email, ip, timestamp}` appended as NDJSON to `data/demo-access.log` (gitignored).

**UI change for identify.html:** On page load, hit `GET /api/demo-mode` (public, returns `{demo: true}`).
If demo, show password field + hint: "Password: Camporee — explore freely!"

**Files to change:**
- `docker-compose.yml` — add `demo-collator` service
- `Caddyfile` — add `demo.{$CADDY_HOST:localhost}` block with `flush_interval -1`
- `src/servers/collator.js`:
  - Read `DEMO_MODE = process.env.DEMO_MODE === 'true'`
  - `GET /api/demo-mode` — public, returns `{ demo: DEMO_MODE }`
  - `POST /api/auth/identify` — in DEMO_MODE: accept any email + password "camporee",
    log to `data/demo-access.log`, set session role='official'
- `public/identify.html` — fetch `/api/demo-mode` on load; conditionally show password
  field + hint

**Cartridge:** Use Circus 2026 actual data (no fictionalization needed for now).

---

### Step 3 — Seeded State Script + Nightly Cron ⬜ NOT STARTED

**Script:** `scripts/seed-demo.js`
- Reads env `DEMO_CARTRIDGE_PATH` (path to CamporeeConfig.zip)
- Wipes demo collator's `camporee.db`
- Unpacks cartridge into `EVENT_PATH`
- Inserts entities (troops + patrols) from `camporee.json` rosters
- Inserts ~50% of patrol game scores with plausible values (derived from game scoring model)
- Exits with summary

**Cron:** VPS crontab or docker-compose healthcheck. Nightly at 3am:
```
0 3 * * * docker exec demo-collator node scripts/seed-demo.js
```

---

### Step 4 — Judge Phone Emulator ⬜ NOT STARTED

**New file:** `public/demo-phone.html`

**Layout:**
- Wide (>900px): two-panel flex row
  - Left 40%: CSS phone bezel (`border-radius`, notch, `aspect-ratio: 9/19`)
    containing `<iframe src="./judge.html">`
  - Right 60%: `<iframe src="./official.html">` (auto-refresh via URL param)
- Narrow (≤900px): phone iframe fills full page, official panel hidden

**No offline/online toggle in this phase** — deferred to future session.

**Served by demo-collator** at `/demo-phone.html` (static file, public).

---

### Step 5 — Composer Demo Event ⬜ DEFERRED
On first login for preview accounts, link to demo camporee read-only. Depends on
browser smoke test + preview account access flow being working.

---

## Key Decisions Log

| Decision | Choice | Reason |
|---|---|---|
| Push mechanism | SSE (not WebSocket) | One-directional, no packages, works through Caddy |
| Demo auth | Password "Camporee" + email logging | Filters accidental visitors; logs who's testing |
| Demo cartridge | Circus 2026 actual data | Good enough for now; tokenization is separate backlog item |
| Offline toggle | Deferred | "Easy route" — phone emulator ships without it |
| Admin/utils in demo | Accessible (after identify) | Nightly reset handles any mess |
