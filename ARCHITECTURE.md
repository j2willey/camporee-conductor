# Camporee Conductor — Architecture Decisions

> Captured 2026-06-04 from design session. These decisions inform all future development.
> Add relevant guardrails to CLAUDE.md as work is implemented.

---

## 1. Data Storage Outside the Repository

**Decision:** All runtime data lives outside the repository directory, mounted via Docker bind mount.

**Why:** Data inside the repo (`./data/`) is destroyed on `rm -rf` + reclone. Production hazard.

**Current state:** `docker-compose.yml` uses `./data/...` relative paths — data is inside the repo. **This must be fixed before VPS deploy.**

**Target implementation:**
- Add `DATA_DIR` to `.env` (default `./data` for local dev, `/opt/camporee-conductor-data` on VPS)
- `docker-compose.yml` replaces `./data/X:/app/data/X` with `${DATA_DIR}/X:/app/data/X` throughout
- App code already references env-var-driven paths (`WORKSPACE_PATH`, `EVENT_PATH`, etc.) — no app code changes needed
- VPS data survives `git pull`, repo replacement, and container rebuilds

---

## 2. Per-User Workspace Isolation

**Decision:** The database is the security boundary, not the filesystem.

**Current state:** Already largely implemented. `GET /api/camporees` reads all workspace dirs but filters by `event_permissions`. All read/write routes are gated by `requireEventRole`. The DB-as-security-boundary pattern is in place.

**Remaining gap:** No `event_permissions` row is inserted at camporee *creation* time if the event already has rows (legacy path). Verify the owner-insert path in `POST /api/camporee/:id` covers all creation scenarios cleanly.

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
  meta.json          ← title, source_game_id, owner_user_id, is_public, is_library_game
  story.md           ← themed narrative
  instructions.md    ← judge instructions
  rubric.json        ← scoring rubric

data/camporees/{camporeeId}/
  camporee.json      ← metadata + [gameId, ...] manifest
  assets/
```

**Why:** Games need to be shareable independently of the camporee that contains them. A camporee is a manifest of games, not a container. This also enables the Curator community library model.

**Lineage:** Every game copy gets a new UUID + `source_game_id` pointer back to its origin. Enables fork history, "variations of this game" in Curator, attribution.

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

**Decision:** Ship Model B as a stepping stone; Model A (zip vault) is the long-term target.

| | Model B (Index) | Model A (Vault) |
|---|---|---|
| How it works | Curator queries user workspaces where `is_public = true` | Curator stores tokenized cartridge zips |
| Templatization | Every consumer pays the cost | Paid once at submission; all downstream copies get clean token-ready template |
| Versioning | Hard — "template" is someone's live workspace | Natural — zip is immutable; new submission = new version |
| Implementation effort | Low | Higher |

The `CuratorService` abstraction keeps the backend swappable — Composer never knows which model is active.

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

**Decision:** Curator is the entry point for new users — not an empty Composer workspace.

**Flow:**
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

## Open Questions / Future Work

- [ ] Versioning of Curator templates (v1, v2, v3)
- [ ] "Promote to library" workflow for community-contributed games
- [ ] "Updated version available" notification for forks
- [ ] Raspberry Pi / offline "Camporee in a Box" deployment
- [ ] Community platform: Facebook Group + GitHub Discussions (when ready)
- [ ] `forked_from` analytics in Curator ("most forked games")
- [ ] Practice Mode — judges test scoring forms without persisting to score queue
