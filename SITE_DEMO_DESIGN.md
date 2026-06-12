# Camporee Conductor — Site Demo Design

> Captured from design discussion 2026-06-06. Implementation planned for 2026-06-11+.

## Goal

Give Camporee Directors and District Executives a hands-on, end-to-end experience of the full suite — Composer, Collator Officials View, and Judge PWA — so they can evaluate whether it solves their problems before committing to adoption.

This is the primary buy-in mechanism. A video or slide deck alone won't close it. They need to touch it.

---

## Two-Phase Rollout

### Phase 1 — Controlled Preview (current focus)
- Clerk authentication required
- Jim grants Preview Accounts to the first 5–50 sign-ups via early-access form
- Relationship-based: Jim engages each cohort, gathers feedback, iterates
- Demo experience uses a pre-loaded demo event in the real Composer + shared Demo Collator

### Phase 2 — No-Auth Playground (future, backlogged)
- Anyone landing on camporeeconductor.com can click "Try Demo" with no sign-in
- Ephemeral or shared session; isolated from production data
- Design TBD when Phase 1 feedback is incorporated

---

## Demo Components

### 1. Shared Demo Collator (`demo.camporeeconductor.com`)
- Permanently running Collator instance on VPS
- Pre-loaded with a polished demo cartridge (Circus Camporee or derivative)
- No authentication required — fully open
- Dummy Troop and Patrol rosters registered
- **Seeded state on reset**: ~half the Patrol games already scored with rankings visible
  - Cold-arrival prospect sees a live-feeling event, not an empty shell
- **Nightly cron reset**: restores DB to seeded state each night
- All scores submitted by demo visitors are effectively demo data; wiped on reset

### 2. Composer Demo Event (Phase 1)
- Preview account holders sign in with Google/Clerk
- They are placed into (or linked to) the same demo camporee used by the Demo Collator
- Read-explore mode: they can navigate the Composer and see how the event is structured
- Future (Phase 2): no-auth sandbox with ephemeral session

### 3. Judge Phone Emulator
- A page served by the Demo Collator (e.g., `/demo-phone` or `/judge-demo`)
- **Layout is responsive to screen size:**
  - **Wide screen (43" etc.)**: phone-frame iframe displayed side-by-side with the Officials View in the same tab
  - **Small/laptop screen**: opens as a new tab; phone frame fills the tab
- Phone frame is pure CSS: rounded bezel, notch styling, phone aspect ratio
- The iframe content is the **real judge PWA** pointed at the Demo Collator — zero code duplication
- No new PWA code; the emulator is presentation only

### 4. Offline/Online Toggle (in Judge Emulator)
- A prominent toggle button in the judge emulator's UI (menu bar or top strip)
- **OFFLINE state**: the judge app queues score submissions in localStorage instead of posting to the server (reuses `sync-manager.js` infrastructure; flag stored in localStorage)
- **ONLINE state**: flushes the queue, syncs all queued scores to the Demo Collator in one batch
- Simulates two real-world scenarios a director needs to see:
  - (a) Judge has wifi — scores sync immediately
  - (b) Judge goes offline mid-event — scores accumulate, then sync on reconnect
- This same app-level infrastructure will be reused for per-judge DEMO Mode on production Collators (separate feature)

---

## The Demo Experience — "Money Shot" Sequence

1. Preview account holder signs in with Google → lands in Composer with demo camporee pre-loaded
2. Explores game structure, league setup, roster — sees how event is designed
3. Clicks "Open Demo Collator" → `demo.camporeeconductor.com` opens (new tab or side panel)
4. Sees Officials View with ~half the games scored, rankings visible, leaderboard populated
5. Opens Judge Emulator (phone frame) — looks and feels like a phone browser
6. Selects an unscored game, picks a patrol, enters scores, submits
7. Switches back to Officials View — standings update in **near-real-time** (WebSocket)
8. Toggles **OFFLINE** in the emulator — scores a few more patrols
9. Toggles **ONLINE** — watches the batch sync flush and standings update
10. Optionally: prints awards from the Collator utils panel

This sequence demonstrates the full value proposition without requiring any infrastructure of their own.

---

## Technical Prerequisites (build before demo infrastructure)

### WebSocket Officials View (load-bearing for the demo)
- `official.js` currently polls every 15s — too slow for the demo "wow" moment
- A prospect who submits a score and waits 15s for the leaderboard to update will think it's broken
- Replace polling with WebSocket push on score submission
- This is already on the backlog; it becomes a demo prerequisite, not just a nice-to-have

---

## Deferred / Not In Scope

| Item | Reason |
|---|---|
| **Standalone kiosk/projected leaderboard** | Would steal suspense from awards ceremony; encourages early departure |
| **Phase 2 no-auth playground** | After Phase 1 feedback incorporated |
| **Landing page video/slide deck** | Jim's content to create; embed is trivial when ready |
| **Composer sandbox (edit without committing)** | Complex; Phase 2 consideration |

---

## Rough Implementation Order

1. **WebSocket Officials View** — prerequisite; build first
2. **Demo Collator container** — new Docker service; shared fixed cartridge; nightly reset cron
3. **Seeded state script** — script that loads the cartridge + seeds ~50% of patrol game scores
4. **Judge Phone Emulator page** — CSS phone frame + iframe; responsive layout logic
5. **Offline/Online toggle** — app-level localStorage flag in judge PWA + sync-manager.js hookup
6. **Composer demo event** — link preview account holders to demo camporee on first login
7. **Phase 2: No-auth playground** — (future)
