# Camporee Conductor — Feature Roadmap

> Created 2026-06-17. Updated 2026-06-17 with real-world feedback from Circus 2026.
> Prioritized by impact on adoption: Tier 1 blocks any other district from using this;
> Tier 4 is growth and scale after the core is proven.

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
Needs to cover: cartridge creation, pre-event cert setup, router config, event-day startup, and
troubleshooting common judge phone issues.

### 3. Scoutmaster Contact Tracking + Patrol Pre-Entry *(Collator / Composer)*
Troop entry is fast (`T123 / Troop 123`) and not the pain point. Patrols are more numerous, have
longer names, and are often unknown until days before the event — Scoutmasters frequently don't
finalize patrol counts until the week of. Pre-entry of patrols only becomes worth building once
we also track Scoutmaster/Person-in-Charge contact info (name + phone number), so officials can
text a unit directly when there's a scoring issue. The two features should be built together.

### 4. Curator Director Self-Submission with Curation Gate *(Curator)*
Widen submission access to any authenticated director — but do not make it fully open. Without
an editorial layer the library will fill with 5–10 "Star Wars"-themed camporees that are barely
different from each other, or multiple near-identical "Western" and "Roman" themes. The goal is
a useful draw-from resource, not an archive of every camporee ever run. Recommended model: director
submits → flagged for sysadmin review → approved + tagged before appearing publicly. A "Featured"
tier for best-in-class submissions would further surface quality content.

### 5. Judge Token Management UI + Delivery *(Collator)*
The `judge_tokens` DB table (migration 009) is built. The UI needs: generate token, view active
tokens, revoke token. More importantly — delivery: email or text judges their token before the
event, with an option to pre-assign the token to a specific game. This eliminates the URL-sharing
problem and gives officials a record of which volunteer judged which station.

---

## Tier 2 — Event-Day Reliability

*These are felt the day of. If they fail, the event fails.*

### 6. Score Reassignment + Patrol Rename *(Collator)*
Two related but distinct real-world scenarios from Circus 2026:

- **Score reassignment:** A patrol added day-of as a new entity submits scores before someone
  notices a duplicate registration. No merge path exists short of DB surgery.
- **Patrol rename mid-event:** A patrol legally changed their name during the Camporee. The schema
  correctly makes `id` immutable and `name` mutable, but the Collator UI needs a supported rename
  flow that doesn't require touching the DB directly.

### 7. Sync Status Clarity + Device Diagnostics *(Judge)*
Confirmed real issue from Circus 2026 — several judges had problems, some potentially iPhone/Safari
related. Two parts:

- **Visible sync status:** A persistent badge showing synced / queued / error should always be
  visible on the judge screen. The PWA queues silently; judges have no signal that they're offline.
- **Device capture at identify:** When a judge identifies themselves, capture `navigator.userAgent`
  and record it in the judge log. When debugging "judge X's scores didn't arrive," officials
  currently have no way to know what phone or browser was involved.

### 8. Offline/Online Scoring Clarity *(Judge)*
Judges CAN update a submitted score through the judge app (tested and confirmed). The problem only
arises when the score has already synced to the Collator in a connected scenario — after that, only
an official can edit it via admin.html. The real issue is that judges don't know which state they're
in. The sync status badge (item 7) addresses much of this. A note in the UI distinguishing "edit
before sync" vs "contact an official" would complete the picture.

*Note: "Practice Mode" urgency is reduced — the Troop 0 / fake patrol workaround (create a dummy
troop with test patrols, exclude from scoring) is a viable interim approach.*

---

## Tier 3 — Workflow Completeness

*The core loop works, but these fill visible gaps.*

### 9. Common Fields UI *(Composer)*
Presets (Patrol Yell, Flag, Scout Spirit, 10 Essentials) are the event-wide scoring fields injected
into every game at runtime by the Collator. They live in `presets.json` with weights and ordering
controlled in `type_defaults`. There is no Composer UI to add, remove, reorder, or reweight them —
a director must edit JSON directly. This is the one place the Composer still requires technical
knowledge to configure.

### 10. Judge Form Preview Enhancements *(Composer)*
A preview button already exists in the Scoring tab and shows the judge's view. Enhancements worth
considering: show the injected Common Fields alongside the game-specific fields (currently the
preview may not show the full merged form), and allow interaction with the preview to verify
field behavior (min/max, required flags, step values).

### 11. Last-Submission Status Bar *(Judge)*
Rather than a modal confirmation after every submit, a persistent status bar showing the last
submission is preferable: `Last submitted: Eagle Patrol · 85 pts · 2:34 PM`. This gives judges
confidence without interrupting the flow for 30 consecutive patrol submissions.

### 12. Post-Event Results Summary *(Collator)*
When the event ends, there is no single-document output. The ideal artifact is a human-readable
summary designed for a District Newsletter: event name, date, theme, final standings per competition
(1st/2nd/3rd), and game-by-game results. Officials currently piece this together manually from
print tools. A one-click "Event Summary" export (PDF or formatted HTML) is the document that goes
to the District Executive and gets published.

---

## Tier 4 — Scale and Growth

*Build these when there are enough users to need them.*

### 13. Multi-Event Collator *(Collator)*
Currently one event at a time — a cartridge upload wipes the previous event. Defer until users
confirm this is a real pain point. The `collator_events` table is planned but not built.

### 14. Spectator Leaderboard *(Collator)*
Scores are currently visible to all on `official.html` in real time. The preferred model is to
hold suspense until the Awards Ceremony — directors already want this behavior. Build only if
users request it.

### 15. AI Templatize *(Curator)*
The flywheel for library growth: after an event, a director clicks "Share with Community" and the
AI strips PII/venue-specific content and injects `{{tokens}}`. Higher importance once the library
has enough unique themes that deduplication becomes a real problem. See `ARCHITECTURE.md §8`.

### 16. Session / Division Configuration *(Composer — Phase 2/3)*
Already in the schema; UI deliberately hidden. Time-slot grouping for judge display (Phase 2) and
separate rankings within a league (Phase 3). Build when there are enough events with complex enough
structures to warrant it.

---

## The Unlisted One

### TLS / Cert Setup for Offline Collator Deployments *(Infrastructure / Docs)*

The cert/TLS concern is specifically for the offline (laptop-at-venue) Collator scenario. Android
requires HTTPS for PWA service workers, and obtaining a valid cert before the event while offline
capability is needed on the day is the highest technical barrier for any new adopter running their
own event.

The goal is **not** to have other districts self-host the full stack (Curator + Composer should
remain on camporeeconductor.com). The goal is to make the offline Collator setup — domain,
Cloudflare DNS-01, certbot, router dnsmasq — simple and documented enough that a non-developer
district volunteer can follow it. A step-by-step guide with copy-paste commands, ideally as part
of the Director's Operational Guide (item 2), is the right solution. A pre-flashed appliance
image is the long-term ideal.
