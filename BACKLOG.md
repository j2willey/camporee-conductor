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

---

## Active Backlog

### Scoring

- [ ] **Challenge Match ("True 2nd Place")** — bracket tournament logic; Matches/Match_Participants DB tables exist, trigger logic not yet implemented

### Collator / Runtime

- [ ] **WebSocket leaderboard** — official.js currently polls every 15s; replace with WebSocket push
- [ ] **Practice Mode for judges** — flag to allow judges to test forms without persisting to the score queue
- [ ] **Exhibition results print/PDF** — results are stored but no ribbon label or print output built yet
- [ ] **Exhibition scoresheet custom columns in UI** — currently hardcoded in buildScoresheetHTML (Troop #, Patrol #, Patrol Name, # Members, # Participating); expose as configurable fields upstream in Composer/game definition
- [ ] **Close Game handshake end-to-end test** — manual testing done; automated test coverage pending

### Composer

- [ ] **Common Fields panel** — UI for editing type_defaults and previewing injected fields per game type
- [ ] **"Print All" scoresheet button** — currently only accessible in Collator tools (utils.html); should be available in Composer export flow

### Infrastructure

- [ ] **Server consolidation** — root-level legacy files (composer_server.js) still exist alongside src/servers/; clean up after confirming nothing depends on them
- [ ] **Node.js version pin** — add .nvmrc to prevent build failures on future Node versions

### Documentation

- [ ] **Event Director's Guide** — operational runbook covering cert renewal, router setup, cartridge load, and event-day checklist
