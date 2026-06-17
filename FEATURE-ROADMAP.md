# Camporee Conductor — Feature Roadmap

> Created 2026-06-17. Prioritized by impact on adoption: Tier 1 blocks any other district from
> using this; Tier 4 is growth and scale after the core is proven.

The four pillars — **Curator** (library), **Composer** (editor), **Collator** (operator),
**Judge** (sensor/collector) — are each noted per item.

---

## Tier 1 — Adoption Blockers

*Without these, only Jim can use this.*

### 1. Onboarding Wizard *(Composer)*
No-guidance blank Composer is a dead end for a new director. First login should detect zero events
and route to a Curator template pick or a "build from scratch" interview. `ARCHITECTURE.md §9–10`
has the design; nothing is built. See also: backlog items Wizard 1 and Wizard 2.

### 2. Director's Operational Guide *(External docs)*
A generic "here's how to run a Camporee with this tool" document doesn't exist. Without it, another
district's tech volunteer can't set up the laptop, router, certs, and cartridge without calling Jim.
The deleted `EVENT-DAY-RUNBOOK.md` was Jim-specific; this needs to be a generic, reusable guide.

### 3. Roster Import *(Collator / Composer)*
Troops register via Scoutbook. Today, someone types every troop and patrol by hand into the
Registration screen. Even a CSV import would remove the biggest manual data-entry step before a
real event. A Scoutbook/TroopMaster export format target would be the ideal end state.

### 4. Curator Director Self-Submission *(Curator)*
The library only grows if other directors can contribute. Currently sysadmin-only. Without this,
the Curator is Jim's private shelf, not a community resource. Needs an optional review gate before
a submission goes public. See backlog: "Director self-submission."

### 5. Judge Token Management UI *(Collator)*
The `judge_tokens` DB table (migration 009) is built. Without a UI to generate, list, and revoke
tokens, the judge route is wide open to anyone who guesses the URL — acceptable for a single-event
LAN but not for cloud deployment across multiple districts. See backlog: "Judge token management UI."

---

## Tier 2 — Event-Day Reliability

*These are felt the day of. If they fail, the event fails.*

### 6. Score Reassignment *(Collator)*
A patrol shows up day-of that wasn't pre-registered, gets added as a new entity, and submits
4 games before someone notices the duplicate. There's no way to merge scores to the correct entity
short of DB surgery. This will happen at every event. See backlog: "Score reassignment operation."

### 7. Judge Score Correction *(Judge)*
A judge hits Submit and immediately realizes they entered 45 instead of 54. Currently they must
find an official, who must find the score in admin.html and manually edit it. Judges need a
"correct my last submission" path — ideally available within a short window (e.g. 5 minutes)
without requiring official intervention.

### 8. Practice Mode for Judges *(Judge)*
Station setup happens the morning of. Judges want to test the form before patrols arrive. Today,
a test submission pollutes the real data. A practice mode that writes nowhere — or writes to a
clearly flagged scratch space — is essential for volunteer confidence. See backlog: "Practice Mode
for judges."

### 9. Sync Status Clarity *(Judge)*
The PWA queues offline and retries, but the judge's only signal is whether the submit button
appeared to work. There is no visible "3 scores queued, waiting for WiFi" indicator. If a phone
drops off the LAN silently, scores accumulate in the queue with no warning. A persistent status
badge (synced / queued / error) should be always visible on the judge screen.

---

## Tier 3 — Workflow Completeness

*The core loop works, but these fill visible gaps.*

### 10. Common Fields UI *(Composer)*
Presets (Patrol Yell, Flag, Spirit, 10 Essentials) are configured as raw JSON with no UI. A
director adding a new common field or changing a weight has no path except editing `presets.json`
directly. This is a significant gap for any non-technical adopter. See backlog: "Common Fields
panel."

### 11. Judge Form Preview from Composer *(Composer)*
When designing scoring fields, a director has no way to see what the judge will actually see on
their phone. The current path — export cartridge → upload to Collator → open judge app → find the
game — is too cumbersome. An inline "preview as judge" modal in the Scoring tab would close this
loop immediately.

### 12. Submission Confirmation Screen *(Judge)*
After a judge submits, the form just resets. There's no "you submitted Eagle Patrol: 85 points"
confirmation. For volunteers submitting scores for 30 patrols over 3 hours, visible confirmation
that the submit actually worked reduces errors and increases confidence.

### 13. Post-Event Results Export *(Collator)*
When the event ends, there is no "here's the full results file" output — no PDF, no Excel, no
printable final standings across all games. Officials must piece this together from the print tools.
A single post-event export (by game and by overall standing) is the artifact that goes to the
District Executive and becomes the official record.

---

## Tier 4 — Scale and Growth

*After the core adoption problem is solved.*

### 14. Multi-Event Collator *(Collator)*
Currently one event at a time — a cartridge upload wipes the previous event. A district running
both a spring Camporee and a fall merit badge event needs separate event slots. The `collator_events`
table is planned but not built.

### 15. Spectator Leaderboard *(Collator)*
Scores are currently visible to all on `official.html` in real time. A director should be able to
hide standings until they declare a game final — especially for close competitions where seeing
live scores could affect behavior. See backlog: "Spectator leaderboard."

### 16. AI Templatize *(Curator)*
The key flywheel for library growth. After an event, a director clicks "Share with Community" and
the AI strips PII/venue-specific content and injects `{{tokens}}` for localization. Without this,
sharing requires manual work that no one will do. See backlog: "AI Templatize tool" and
`ARCHITECTURE.md §8`.

### 17. Session / Division Configuration *(Composer — Phase 2/3)*
Already in the schema; UI is deliberately hidden. Time-slot grouping for judge display (Phase 2)
and separate rankings within a league (Phase 3). Not needed until the basic adoption problem is
solved. See backlog and `CAMPOREESCHEMA.md` for schema design.

---

## The Unlisted One

### TLS / Offline Deployment Self-Service *(Infrastructure / External)*

The current offline setup requires: obtain a domain, configure Cloudflare, run certbot DNS-01,
copy certs to the event laptop, configure dnsmasq on the GL.iNet router. This is the highest
technical barrier for any adopter and does not appear anywhere in the current backlog.

A non-technical district tech volunteer will hit this wall and stop — no operational guide fixes
it. The long-term answer is probably a pre-built offline appliance image (a bootable USB or a
pre-flashed GL.iNet package) where the TLS cert, Caddy config, DNS override, and Docker images
are pre-installed and the volunteer only sets the WiFi password. Until that exists, offline
deployment is gated on finding someone at the technical level of the original developer.
