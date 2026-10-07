# Camporee Conductor — Architecture Decisions

> Captured 2026-06-04 from design session. Updated 2026-06-06.
> Implementation status noted per section. Add guardrails to CLAUDE.md as work ships.

---

## 1. Data Storage Outside the Repository

**Decision:** All runtime data lives outside the repository directory, mounted via Docker bind mount.

**Why:** Data inside the repo (`./data/`) is destroyed on `rm -rf` + reclone. Production hazard.

**Status: ✅ COMPLETE (2026-06-05)**

`docker-compose.yml` uses `${DATA_DIR:-./data}` for all volume mounts. Dev sets `DATA_DIR=/home/<user>/camporee-data` in `.env`; VPS will use `DATA_DIR=/opt/camporee-conductor-data`. Runtime data was migrated out of the repo. App code references env-var-driven paths (`WORKSPACE_PATH`, `EVENT_PATH`, etc.) with no hardcoded `./data/` paths.

---

## 2. Per-User Workspace Isolation

**Decision:** The database is the security boundary, not the filesystem.

**Current state:** Already largely implemented. `GET /api/camporees` reads all workspace dirs but filters by `event_permissions`. All read/write routes are gated by `requireEventRole`. The DB-as-security-boundary pattern is in place.

**Status: ✅ COMPLETE.** `POST /api/camporee/:id` inserts an `owner` row on first save (when no permissions exist for the event). Workspace IDs are now always auto-generated UUIDs, eliminating any legacy non-UUID path.

**Design:**
- Workspace dirs remain flat by camporee UUID — no per-user subdirectories
- `event_permissions (event_id, user_id, role)` governs all access
- "My workspace" = `SELECT event_id FROM event_permissions WHERE user_id = ?`
- Sysadmin bypass already implemented

---

## 3. Games as First-Class Citizens

**Decision:** Games should eventually be independent objects with their own UUIDs, not nested inside camporee workspace directories.

**Current state:** Games live at `data/composer/workspaces/{camporeeId}/games/{gameId}.json`. This is acceptable for now.

**Target state (post-deploy):**
```
data/games/{gameId}/
  game.json          ← single file: library_uuid, league, content{}, scoring_model{}, variables, variants[]

data/camporees/{camporeeId}/
  camporee.json      ← metadata + [gameId, ...] manifest
  assets/
```

**Corrected 2026-10-06:** the original sketch here (separate `meta.json` / `story.md` / `instructions.md` / `rubric.json` files) predates schema v3.0 and was never reconciled with it. It's wrong — don't build it. The real `content` object (story/challenge/description/rules/etc.) and `scoring_model` already live as one JSON blob per `game.schema.json`, and `content` fields are already authored as markdown strings via EasyMDE in Composer/Curator and rendered with `marked.js` for the Game Guide. A game, forked out to its own pool, should stay exactly that same single-JSON shape — just relocated out of per-workspace nesting. No file-split needed or wanted.

**Why:** Games need to be shareable independently of the camporee that contains them. A camporee is a manifest of games, not a container. This also enables the Curator community library model.

**Lineage:** Confirmed single-level, not a chain. The field actually used in code today is `library_uuid` (not `source_game_id` — that name never got implemented), and a forked game's `library_uuid` points at the one template/library game it came from (`composer.js` — `template.library_uuid || template.id`). There is no grandparent tracking. That's an intentional, already-correct limit, not a gap — a chain can be added later (additive) if "full variation tree" browsing in Curator is ever needed. This is one of *three* separate fork/lineage edges in the system — see §16 for the other two (camporee↔template, template↔template), which are tracked separately and are at different stages of completeness.

**Not a pre-VPS blocker.** Current nested structure works for MVP. Refactor when Curator sharing is built.

---

## 4. Library Games vs. User Games

**Decision:** Three tiers of game content:

```
Library Game  (canonical, generic — e.g., "Knot Tying")           is_library_game=true
  └── Camporee Game (themed fork — e.g., "Rigging the Ship's Lines")
        └── further forks possible
```

- Library games are scouting primitives — stable, sysadmin-curated
- User games are themed copies owned by their creator
- Changes to library games never affect existing forks (stability by design)
- Future: "promote to library" workflow for well-regarded community games
- `is_library_game` flag on game records; toggle via sysadmin panel

---

## 5. Localization Tokens

**Decision:** Game stories and camporee content use `{{token}}` syntax for localizable fields.

**Why:** Enables Wizard 2 (localize a template) to replace all council/venue/date references in one pass rather than manual find/replace.

**Standard token set:**
```
{{venue_name}}       — e.g., "Camp Chesebrough"
{{event_date}}       — e.g., "May 15–17, 2026"
{{council_name}}     — e.g., "Mount Diablo Silverado Council"
{{district_name}}    — e.g., "Coyote Creek District"
{{director_name}}
{{contact_email}}
```

Note: `{{variable_name}}` syntax already exists for `game.variables` template substitution in preset labels. Localization tokens extend the same convention to game stories and camporee-level content.

Apply tokens to all Coyote Creek seed content when preparing it for the Curator library.
Game creation UI should guide contributors toward using tokens for these fields.

---

## 6. Community Model

**Decision:** Private by default. Sharing is encouraged, not required.

**Sharing lifecycle:**
1. Director creates and runs camporee (private)
2. Post-event: system prompts *"Want to share this camporee with the community?"*
3. Director runs AI Templatize tool → reviews → approves → content lands in Curator

**Collaboration (per-camporee):**
- `owner` — full control, can share/delete
- `editor` — can modify content
- `viewer` — read-only (useful for co-directors)
- Sharing invite via email already implemented in the collaborator modal

---

## 7. Curator Architecture

### Storage Format

**Decision:** Curator stores templates as **cartridge zip files**. A zip is atomic — either it exists complete or it doesn't. Unpacked directories risk silent partial corruption (a game goes missing, a file is half-written).

```
data/curator/templates/{templateId}.zip   ← canonical, permanent, backed up
data/curator/cache/{templateId}/          ← unpacked on demand, evictable, not backed up
```

**Read cache:** Curator maintains a bounded LRU cache of unpacked templates. On preview or "use this template" request: check cache → miss → unzip into cache → serve. Cache is safe to `rm -rf` at any time (cold start only costs one unzip per template). Lives inside `DATA_DIR` so it survives container restarts but is excluded from backups.

### Curator vs. Composer Responsibilities

**Curator is read-only from the user's perspective.** It stores templates and serves the browse/preview catalog. It has no concept of user workspaces.

**Composer acts on Curator content.** "Use this template" is a Composer action — Composer fetches the zip from Curator, unpacks it into a new user workspace (new UUID, new `event_permissions` row), then optionally triggers Wizard 2 for localization.

**`CuratorService` interface:**
```javascript
CuratorService.listTemplates()        // catalog browse — reads camporee.json from each zip
CuratorService.getTemplateMeta(id)    // title, theme, game count, token list, etc.
CuratorService.getTemplateZip(id)     // returns zip buffer — Composer unpacks into workspace
CuratorService.submit(zip, meta)      // accept a tokenized cartridge from AI Templatize flow
```

No `fork()` on Curator. Curator never writes to user workspaces and is stateless with respect to who's logged in (beyond gating `submit()`).

### Model A (Vault) vs. Model B (Index)

**Decision:** ✅ **Model A (zip vault) shipped directly (2026-06-05).** Model B was skipped.

| | Model B (Index) | Model A (Vault) |
|---|---|---|
| How it works | Curator queries user workspaces where `is_public = true` | Curator stores tokenized cartridge zips |
| Templatization | Every consumer pays the cost | Paid once at submission; all downstream copies get clean token-ready template |
| Versioning | Hard — "template" is someone's live workspace | Natural — zip is immutable; new submission = new version |
| Implementation effort | Low | Higher |

`CuratorService` (`src/lib/curator-service.js`) implements the vault interface. `POST /curator/api/templates` accepts a cartridge zip; `GET /curator/api/templates/:id/zip` returns it; `POST /composer/api/from-template/:id` unpacks it into a new UUID workspace. An LRU unpack cache (max 20 entries) lives at `data/curator/cache/`.

### Template Edit Mode (Obscured)

Curator templates are normally immutable once submitted. To update a canonical template (fix a game story, improve a rubric), an authorized user can enter **Template Edit Mode** in Composer:

- Composer loads the template zip into a temporary workspace, preserving the original `templateId`
- User edits content normally
- On save: writes back to `curator/templates/{templateId}.zip`, invalidates cache entry
- This mode is **restricted to sysadmins** and not exposed in the default Composer UI — it requires a deliberate navigation path to reduce accidental overwrites
- Audit log entry written on every template update

This is analogous to editing a Wikipedia article vs. reading it — the action exists, but the default path is consumption, not editing.

---

## 8. AI Templatize Tool

**Decision:** A review/approve tool (not a step-by-step wizard) that converts a real camporee into a Curator-ready template using the Claude API.

**What it does:**
- Scans game stories for concrete proper nouns (venue, council, leader names)
- Replaces them with `{{localization_tokens}}`
- Strips council-specific scoring adjustments
- Suggests canonical theme name and Curator description
- Flags ambiguous items for director review
- Director approves → AI Templatize produces a tokenized cartridge zip → saved to `curator/templates/{newId}.zip`

The zip IS the submission artifact. No further processing at submission time.

**Side effect:** Teaches directors what localization tokens are, improving future contribution quality.

---

## 9. The Three Wizards

### Wizard 1 — Build from Scratch
Interview: theme, name, dates, venue, council/district, expected patrol/event count.
System suggests matching games from library based on theme.
Output: scaffolded camporee in Composer, ready to populate.

### Wizard 2 — Localize a Template
Triggered when director selects a Curator template and Composer pulls it into a new workspace.
Interview: localization fields only (dates, venue, council, director info).
System does single-pass `{{token}}` replacement across all game stories and camporee manifest.
Output: personalized camporee, ~90% done.

### Tool — AI Templatize for Submission
See §8. Not a wizard. Review/approve flow for community contribution.

---

## 10. New User Onboarding

**Decision:** Curator is the intended entry point for new users — not an empty Composer workspace.

**Partial implementation (2026-06-06):** Composer detects an empty camporee list on load and shows a "first-time welcome" pane with a Camporee Name field and "Create My First Camporee" button. The Curator redirect flow below is not yet implemented.

**Full target flow:**
```
New user logs in
  → Composer detects zero rows in event_permissions for this user
  → Redirects to Curator with onboarding context
  → "Start from scratch" → Wizard 1
  → "Start from a theme" → browse Curator → fork → Wizard 2
  → Lands in populated Composer workspace
```

---

## 11. Anticipated Adoption Curve

**Phase 1 (now → ~20 camporees):** Library is sparse. Directors create games or make themed copies. Every event run is a library contribution. Coyote Creek Circus theme is the seed content.

**Phase 2 (critical mass):** "Copy whole camporee" becomes dominant. Directors mostly localize — dates, venue, council.

**Phase 3 (maintenance mode):** Fork a themed template, run Wizard 2, done. Game creation is rare.

**Implication:** Near-term priority is frictionless game and camporee *creation* so early adopters contribute. The library only gets valuable if the first 10–20 directors leave something behind. Post-event share prompt is the key mechanism.

---

## 12. Common Field Flattening — Serve-Time, Not Export-Time

**Decision (confirmed 2026-10-06):** Common fields (`presets.json`) stay unflattened in the cartridge all the way through export and Curator storage. Flattening into one merged `fields[]` array happens only at the Collator, dynamically, on every `/games.json` request (`injectCommonFields()` in `collator.js`).

**Why:** It was briefly reconsidered whether flattening should happen earlier — either at Composer export time (baking presets into each game file before it ever leaves the Composer) or pushed later, all the way to the judge app client (shipping `presets.json` and game files separately and letting `judge.js` merge them). Both were rejected:

- **Export-time flattening** would fragment the cartridge into two incompatible shapes (flattened "for Collator" vs. unflattened "for Curator templates"), and would kill the ability to retune a Common Field's weight after export without regenerating the whole cartridge.
- **Client-side flattening** doesn't actually save anything — `official.js`, the print/scoresheet tools in `utils.js`, and score aggregation in `collator.js` *all* need merged fields server-side already, independent of the judge app. Moving the merge to `judge.js` would mean maintaining the same prefix/suffix/tier merge algorithm in two places instead of one, which is worse to maintain whether a human or an AI assistant is doing the maintaining.

**Status: ✅ Confirmed as current, correct behavior.** No code change needed — this already matches `CAMPOREESCHEMA.md` §3 and the `Common Field Injection` section of `CLAUDE.md`. The judge app never distinguishes injected fields from game-specific ones; it only ever sees the merged `fields[]`.

---

## 13. Curator/Composer Service Boundary — Decoupling Readiness

**Decision (confirmed 2026-10-06):** Curator and Composer stay bundled in one process (`src/servers/composer.js`) for now. There is no plan to split them imminently.

**Why it's still worth recording:** The long-term intent has always been to decouple them — so each can scale or be upgraded independently, and so a self-hosted Composer could point at a shared, centrally-run Curator. That's a real, deliberate direction, not an afterthought — which is exactly why the existing `CuratorService` interface (`src/lib/curator-service.js`: `listTemplates`, `getTemplateMeta`, `getTemplateZip`, `submit`, cache invalidation) was kept as a clean seam rather than letting Curator logic bleed directly into Composer routes/views. Any future network boundary gets inserted at that interface.

**Status: Intentionally deferred.** Don't build the network split now — there's no second self-hoster yet to justify it. Do keep new Curator-related code behind `CuratorService` rather than reaching into Composer internals, so the seam stays real.

---

## 14. Unit/Subunit Contact Info *(designed, not yet implemented)*

**Decision (confirmed 2026-10-06):** Add optional contact fields so officials can reach a unit directly during an event — this was Tier 1 item 3 in `FEATURE-ROADMAP.md` ("Scoutmaster Contact Tracking"), now fully specified:

- `UnitRoster` gains optional `contact_name` and `contact_phone` — a Scoutmaster/Team-Lead is a per-Troop(/Group/Team) role, not per-Patrol.
- `SubUnitRoster` gains the *same* two optional fields, which override the parent unit's contact when present. When absent, officials/print output fall back to the parent `UnitRoster`'s contact. This covers both the common case (one contact per Troop) and the real case Jim described (some Patrols/Squads have their own leader).
- `terminology` gains a new optional field, `unit_leader` (default: `"Scoutmaster"`) — same pattern as the existing `organizer` field, so the role label generalizes alongside `unit`/`subunit` without a schema change later (see §15 below on why that generalization is worth keeping cheap).
- **Entry surface — both, not either/or:** the Collator's own roster UI (`admin.html` → `entities` table) is the *primary* workflow — Jim's own camporees do all roster/contact data entry live, at the event, through the Collator. But the Composer's `rosters{}` editor should support the same two fields for directors who want to pre-populate before the event. Neither surface should be built to the exclusion of the other.

**Status: Not yet implemented.** This section is the spec to build against — `schemas/camporee-instance.schema.json` (`rosters.units[]`, `rosters.subunits[]`, `terminology`) and the Collator's `entities` table both need the new optional columns/fields when this is picked up.

---

## 15. Scouting-First, Generalize-When-Free

**Decision (confirmed 2026-10-06):** Camporee Conductor's proven, funded use case is Scouting Camporees, and that stays the priority. But a secondary, explicit goal — not load-bearing, but real — is demonstrating this architecture's extensibility beyond Scouting (schools, non-Scouting camps, team-building events) as a portfolio/GitHub signal.

**Why it's cheap:** The schema already has exactly the mechanism this needs — `terminology` (`unit`/`subunit`/`member`/`event`/`organizer`, now also `unit_leader` per §14) lets "Troop"/"Patrol" relabel to "Team"/"Squad" or "Group"/"Den" with zero schema change. The practical rule going forward: when a new field or doc needs a name, default to the generic term when it costs nothing extra (as already done for `terminology` and `unit_leader`), but don't block or delay Scouting-specific work to chase generality. UI labels remain hardcoded BSA terms in Phase 1 regardless (per `CAMPOREESCHEMA.md` §2b) — that doesn't change.

---

## 16. Fork & Lineage Tracking — Three Separate Edges *(clarified 2026-10-07)*

Three distinct "where did this come from" relationships exist in the system. They're easy to conflate but are tracked independently, at different levels of completeness:

| Edge | Field | Status |
|---|---|---|
| Game → Library Game | `library_uuid` on the game file | ✅ Implemented. Single parent, no ancestry chain (see §3 Lineage). |
| Composer workspace (camporee) → Curator Template | `source_template_id` on `camporee.json`, set by `POST /api/from-template/:templateId` (`composer.js:1052`) | ✅ Implemented. Single parent. |
| Curator Template → Curator Template (a template derived from another template) | *(none yet)* | 🔲 **Not implemented.** `CuratorService.submit()` (`curator-service.js:138`) mints a fresh random UUID per submission and stores only `{id, title, theme, year, gameCount, submittedBy, submittedAt}` — nothing propagates a prior template's id into the catalog, even if the submitted zip's own `camporee.json` still happens to carry a `source_template_id` from edge 2. |

**Why edge 3 doesn't exist yet, and isn't a bug:** the flow that would actually *create* it — a director personalizing a template-derived camporee and submitting the result back as a new community template — isn't built. AI Templatize (§8) is still backlog, and today the only way a new template enters the Curator catalog is a raw sysadmin zip upload (`POST /curator/api/templates`, sysadmin-only). There's nothing yet producing a "this template came from that template" moment for the catalog to record.

**When it's time to build it:** fold this into the existing Open Questions items below ("Versioning of Curator templates" and "`forked_from` analytics") rather than treating it as a fourth separate item — they're the same gap. `CuratorService.submit()` should accept and persist an optional `derived_from_template_id` in the catalog entry at that point.

---

## 17. Shared Asset Pool — Images in Camporee Content *(designed, not yet implemented)*

**Decision (confirmed 2026-10-07):** Add a flat `assets/` folder at the cartridge root. Any markdown content field — a game's `content.*` or the new Program Guide/theme-level content in §18 — references images by relative path into that one shared pool, same "define once, reference everywhere" principle `presets.json` already uses. This is an explicit, additive schema v3.1 change: `CAMPOREESCHEMA.md` §1 currently says "no sub-folders except `games/`."

**Why bundled, never external URLs:** forced by two principles already committed to elsewhere, not a style preference. (1) Offline-first is the product's core promise — an externally-hosted image fails the moment there's no internet at the venue. (2) Zip atomicity (§7 — "a zip is atomic, either it exists complete or it doesn't") — a bare URL is exactly the silent-partial-corruption risk that principle exists to prevent.

**`content.marketing_image_url`** (existing schema field, confirmed unused anywhere in code) is the wrong shape for this — a bare external URL — and should be deprecated in favor of an assets-relative-path reference when this is built.

**Confirmed by real evidence, not speculation:** reviewing two actual Program Guides (2024 "Safari Nzuri," 2026 "The Circus") shows the "Theme Ticklers" sections (African geography/animal reference grids, Circus personalities) are image-heavy and theme-level, not per-game — so the pool must be usable from camporee/theme-level content too, not just `games/*.json`.

**Implementation needs (not built):** the schema addition itself, and a static-serving route on each server (Composer workspace, Collator active-event, Curator unpack cache) so `marked.js`-rendered `<img>` tags actually resolve in a browser.

---

## 18. Program Guide — Composition Tiers *(designed, not yet implemented)*

**New concept — distinct from the per-game Game Guide** (`gameguide.md`, which is single-station, judge+competitor facing). The **Program Guide** is camporee-wide: it prepares Units (adult leaders and youth) to attend — theme intro, registration, logistics, rules, schedule, awards structure. No code exists for this today.

**Confirmed by reviewing two real historical Program Guides** (2024 "Safari Nzuri" and 2026 "The Circus," both at Chesebrough Scout Reservation) that content splits into **four tiers, not two**:

1. **Theme Template** *(Curator)* — theme intro/welcome copy, theme ticklers (pop culture, notable personalities, image reference grids per §17), theme-flavored section framing. Shareable via Curator exactly like today's Camporee Templates.
2. **Venue Profile** *(Composer-side, not Curator)* — site-specific: driving directions, GPS coordinates, campsite logistics, site-specific hazards/rules. Confirmed **word-for-word identical** between the 2024 and 2026 guides — same campground, different themes, two years apart. Owned by the Composer account/instance (or a self-hosted instance per §13), never submitted to Curator — it's private/operational, not community content. A director may maintain several Venue Profiles and pick one per event; this can change year to year even for the same council.
3. **Council/District Profile** *(Composer-side, not Curator)* — org-specific but neither venue- nor theme-specific: OA Chapter/Lodge names, District Roundtable info, District Executive contact, and the near-verbatim generic conduct/safety boilerplate (uniforms, fires, water, trash, wildlife, emergencies, first aid) confirmed near-identical across both guides. Independent of Venue Profile — multiple districts can and do share one venue, so these are two separate reusable objects, never nested one inside the other.
4. **Event-Specific fill-in** — the true per-event data: dates, specific fee amounts/deadlines, registration/RSVP URLs, schedule times, and (per Jim) possibly contact info that can change year to year even within the same council.

**Per-game summary section** in the Program Guide pulls a short teaser excerpt from each game's own `content.story`/`content.challenge` ("to set the mood/expectations") — never the full Game Guide content, avoiding the duplicate-authoring drift risk visible in the 2024 guide's hand-typed "Legend:" blurbs. **Open implementation detail, not decided:** whether the teaser is a simple truncation of existing content, a new dedicated field, or AI-assisted (Gemini is already used for game-guide writing, so an AI-generated teaser at generation time is a natural fit) — pick this when the feature is actually built.

**Schedule / timetable section stays out of scope indefinitely.** The Weekend Events Schedule and Visual Schedule grid are built in an external tool (spreadsheet) and imported as a static image — confirmed as the plan for now, explicitly not on the roadmap to bring in-house. This is the first concrete real-world consumer of the §17 asset pool.

**Status: Fully designed, zero code exists.** When picked up, needs: the `assets/` pool (§17), a new Venue Profile object + storage, a new Council/District Profile object + storage, and a Program Guide generation/export path analogous to the existing `gameguide.md` Handlebars pipeline but camporee-scoped.

---

## Open Questions / Future Work

- [ ] Versioning of Curator templates (v1, v2, v3) — includes template→template lineage tracking, see §16
- [ ] "Promote to library" workflow for community-contributed games
- [ ] "Updated version available" notification for forks
- [ ] Raspberry Pi / offline "Camporee in a Box" deployment
- [ ] Community platform: Facebook Group + GitHub Discussions (when ready)
- [ ] `forked_from` analytics in Curator ("most forked games") — same gap as above, see §16
- [ ] Practice Mode — judges test scoring forms without persisting to score queue
- [x] **`SCHEMA.md` accuracy — resolved 2026-10-07.** It was never stale — `scripts/generate-docs.js` (run via `npm run docs:schema`) was deliberately regenerating it correctly all along, just scoped to only `game.schema.json` + its `content`/`scoring` sub-schemas. Extended the generator to also cover `camporee-instance.schema.json` (including nested `meta`, `terminology`, `leagues[]`, `sessions[]`, `rosters.*`, `type_defaults`, `officials[]`, `playlist[]`), `preset.schema.json`, `library-catalog.schema.json`, and `camporee-catalog.schema.json`, then regenerated. `SCHEMA.md` is now the complete, drift-proof field-level reference (re-run `npm run docs:schema` after any `schemas/*.json` change); `CAMPOREESCHEMA.md` remains the narrative "why/how it fits together" companion doc with worked examples and phased-rollout context.
- [ ] Implement Unit/Subunit contact info per §14 above (`contact_name`/`contact_phone` on both roster tiers + `terminology.unit_leader`, editable in both Composer and Collator)
- [ ] Implement shared `assets/` image pool per §17 above (schema v3.1 addition + static-serving routes on Composer/Collator/Curator)
- [ ] Implement Program Guide generation per §18 above — needs Venue Profile object, Council/District Profile object, and a camporee-scoped Handlebars pipeline analogous to `gameguide.md`
