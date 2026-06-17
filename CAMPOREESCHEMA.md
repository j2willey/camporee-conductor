# Camporee Interchange Schema (v3.0)

**The "Cartridge" Format for the Camporee Conductor Suite**

This document describes the structure of the **Camporee Config Zip** (`CamporeeConfig.zip`). This archive acts as the bridge between the **Camporee Composer** (Design Tool) and the **Camporee Collator** (Runtime Engine).

> **Schema v3.0** merged to `main` on 2026-06-04. The prior schema (v2.9) used a hardcoded `type: patrol | troop | exhibition` field on games. v3.0 replaces this with a flexible `league` / `session` / `roster` model described below. The `type` field is **removed** — do not reference it in new code.

---

## Design Philosophy

Schema v3.0 separates concerns that were conflated in v2.9:

| Concern | v2.9 | v3.0 |
|---|---|---|
| Which leaderboard does a game contribute to? | `game.type` | `game.league → League.id` |
| Which judges see this game and when? | implicit from `type` | `game.session → Session.id` (optional) |
| How are participants organized? | hardcoded Patrol/Troop | `rosters: { units, subunits }` |
| What are participants called? | hardcoded "Patrol", "Troop" | `terminology` object |
| Separate rankings within a league? | not supported | `league.divisions[]` (placeholder) |

**Phased rollout:**
- **Phase 1 (now):** League and Roster. Exposed in Composer UI. This is what gets built on `schema-v3`.
- **Phase 2 (future):** Session — judge display grouping by time slot. Schema ready, UI hidden.
- **Phase 3 (future):** Division — separate rankings within a league. Schema ready, UI hidden.

---

## 1. Archive Structure

The Zip file must contain the following flat structure (no sub-folders except `games/`):

* **`camporee.json`** — Root manifest: event metadata, terminology, leagues, sessions, roster, playlist, and common field injection config.
* **`presets.json`** — Library of reusable common scoring fields injected at runtime.
* **`games/`** — Individual game definitions.
    * `games/{gameId}.json` — Game-specific definition for a single station.

---

## 2. The Manifest (`camporee.json`)

### 2a. Full Structure

```json
{
  "schemaVersion": "3.0",

  "meta": {
    "camporeeId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Coyote Creek Camporee 2026",
    "theme": "The Circus",
    "year": 2026,
    "director": "Jim Willey",
    "theme_colors": {
      "main": "#C62828",
      "header": "#1565C0",
      "accent": "#F9A825"
    },
    "awards_config": {
      "line1": "Coyote Creek District Camporee 2026",
      "line2": "The Circus"
    }
  },

  "terminology": {
    "unit": "Troop",
    "subunit": "Patrol",
    "member": "Scout",
    "event": "Camporee",
    "organizer": "Event Director"
  },

  "leagues": [
    {
      "id": "patrol-games",
      "label": "Patrol Games",
      "tier": "subunit",
      "registration": "registered",
      "divisions": []
    },
    {
      "id": "exhibition",
      "label": "Exhibition Events",
      "tier": "subunit",
      "registration": "registered",
      "divisions": []
    },
    {
      "id": "troop-challenges",
      "label": "Troop Challenges",
      "tier": "unit",
      "registration": "registered",
      "divisions": []
    }
  ],

  "sessions": [],

  "rosters": {
    "units": [
      { "id": 1, "name": "Troop 99" },
      { "id": 2, "name": "Troop 2 MB" },
      { "id": 3, "name": "Troop 2 SJ" }
    ],
    "subunits": [
      { "id": 101, "name": "Fire Hawks", "unit_id": 1 },
      { "id": 102, "name": "Sharks",     "unit_id": 2 },
      { "id": 103, "name": "Sharks",     "unit_id": 3 }
    ],
    "individuals": []
  },

  "officials": [
    { "user_id": "user_2abc123", "display_name": "Jane Smith", "email": "jane@example.com", "role": "director" }
  ],

  "playlist": [
    { "gameId": "the-high-wire-fire-act", "order": 1 }
  ],

  "type_defaults": {
    "patrol-games": {
      "prefix": ["p_flag", "p_yell", "p_spirit", "ten_ess"],
      "suffix": ["unscout", "off_notes", "off_score", "final_rank", "overall_points"]
    },
    "exhibition": {
      "prefix": [],
      "suffix": ["off_score", "final_rank", "overall_points"]
    },
    "troop-challenges": {
      "prefix": [],
      "suffix": ["off_score", "final_rank", "overall_points"]
    }
  }
}
```

### 2b. `terminology`

Configures all display labels for participant tiers. Used by Composer, Collator, judge UI, and print outputs. **UI labels are still hardcoded in Phase 1** — terminology is in the schema and travels in the cartridge, but UI lookups are Phase 2 work.

| Field | Default | Meaning |
|---|---|---|
| `unit` | `"Troop"` | Primary competitive entity. Always present. |
| `subunit` | `"Patrol"` | Sub-entity within a unit. `null` = single-tier event. |
| `member` | `"Scout"` | Individual member of a unit/subunit. |
| `event` | `"Camporee"` | Name of the event type. |
| `organizer` | `"Event Director"` | Role of the person running the event. |

Single-tier event example (Cub Scout Pack event with Dens only):
```json
"terminology": { "unit": "Den", "subunit": null, "member": "Cub Scout", "event": "Pack Campout" }
```

### 2c. `leagues`

Defines the scoring pools for the event. Every game references a league by `id`. League determines which leaderboard a game's scores roll into.

| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key. Referenced by `game.league`. |
| `label` | string | Display name (e.g., "Patrol Games"). |
| `tier` | `"unit"` \| `"subunit"` \| `"individual"` | Which roster tier competes in this league. |
| `registration` | `"registered"` \| `"open"` | `registered` = entrants from roster (with add-unlisted escape hatch). `open` = judge enters entrant names at station (walk-up). |
| `divisions` | `Division[]` | **Phase 3 placeholder.** Empty array for now. |

**Naming convention for default BSA leagues:**
- `patrol-games` → `tier: subunit`
- `troop-challenges` → `tier: unit`

**`type_defaults` is keyed by league `id`** (not the old `patrol`/`troop` strings). The Collator's `injectCommonFields()` reads `type_defaults[game.league]` to determine which presets to inject.

### 2d. `sessions` *(Phase 2 — optional)*

Array of named time slots for judge display grouping. When absent or empty, all games are visible to all judges in a flat list (current behavior). When populated, the judge UI presents a session picker.

```json
"sessions": [
  { "id": "morning",           "label": "Morning Patrol Games",  "start": "09:00", "end": "12:00" },
  { "id": "afternoon-patrol",  "label": "Patrol Challenges",     "start": "13:00", "end": "15:00" },
  { "id": "afternoon-troop",   "label": "Troop Challenges",      "start": "14:00", "end": "16:00" },
  { "id": "all-day",           "label": "All Day Events" }
]
```

`start` and `end` are optional. Judge selects session manually — there is no auto-switching.

**Session is independent of league.** A morning session can contain both subunit and unit games. A game's `session` controls display; its `league` controls scoring.

### 2e. `rosters`

Defines all competing entities for the event. Replaces the ad-hoc troop/patrol fields that were scattered across the previous schema.

```json
"rosters": {
  "units": [
    { "id": 1, "name": "Troop 99" }
  ],
  "subunits": [
    { "id": 101, "name": "Fire Hawks", "unit_id": 1 }
  ],
  "individuals": []
}
```

**Roster base class concept:** `UnitRoster`, `SubUnitRoster`, and `IndividualRoster` all share the same base structure — `id` (integer, immutable) and `name` (string, mutable). The `id` is the stable identity; `name` can change mid-event without breaking score records.

**Id range conventions** (not schema-enforced, documented for consistency):
- `1–99` → units
- `100–999` → subunits
- `1000–9999` → individuals (future)

**Duplicate names are allowed.** Two patrols named "Sharks" from different troops is valid. Judge UI always displays `{subunit name} — {unit name}` together to disambiguate. `id` is the positive match.

**Judge entrant lookup flow:**
1. Search by name → 1 result: confirm with unit name shown
2. Search by name → multiple results: show unit name alongside each
3. Search by name → 0 results: fall back to id lookup or browse by unit
4. Still nothing: judge adds new entrant (name + unit) flagged for official review
5. Officials reconcile via score reassignment (`PATCH /api/scores/reassign` — backlog)

`subunits` is `null` for single-tier events. `individuals` is always present as `[]` (Phase 3 placeholder).

**Future:** `rosters` currently holds participant structure only (not a member roll). A future version may add `members[]` per unit/subunit.

---

## 3. The Presets File (`presets.json`)

Common reusable scoring fields defined once. Injected at runtime by the Collator's `injectCommonFields()`. Game files do NOT store copies.

`position` is now `"prefix" | "suffix"`. The `tier` field on each preset replaces the old hardcoded patrol/troop logic:

| `tier` value | Injected for |
|---|---|
| `"subunit"` | Games in subunit leagues (formerly "patrol") |
| `"unit"` | Games in unit leagues (formerly "troop") |
| `"all"` | All scored games regardless of tier |

```json
{
  "presets": [
    {
      "id": "p_flag",
      "label": "Patrol Flag",
      "type": "checkbox",
      "kind": "points",
      "weight": 1,
      "sortOrder": 10,
      "position": "prefix",
      "tier": "subunit",
      "config": {}
    },
    {
      "id": "off_score",
      "label": "Official Score",
      "type": "number",
      "kind": "points",
      "weight": 1,
      "sortOrder": 600,
      "position": "suffix",
      "tier": "all",
      "audience": "admin",
      "config": { "min": 0 }
    }
  ]
}
```

Template syntax `{{variable_name}}` in `label` or `placeholder` is substituted from `game.variables` at serve time.

---

## 4. Game Definitions (`games/*.json`)

### 4a. Composer Storage Format (v3.0)

```json
{
  "id": "the-high-wire-fire-act",
  "league": "patrol-games",
  "session": null,
  "sortOrder": 10,
  "schemaVersion": "3.0",
  "content": {
    "title": "The High-Wire Fire Act",
    "story": "The circus needs fire...",
    "challenge": "Light a fire and keep it burning.",
    "description": "Each patrol must...",
    "rules": ["No lighter fluid."],
    "time_and_scoring": "15 minutes.",
    "setup": "Clear a 10-foot circle.",
    "reset": "Douse fire and clear ash.",
    "staffing": "2 judges minimum.",
    "supplies": "Tinder bundle, kindling, wood.",
    "notes": "Have water bucket on standby."
  },
  "variables": {
    "ten_essentials": "matches"
  },
  "scoring_model": {
    "method": "points_desc",
    "inputs": [
      {
        "id": "fire_lit",
        "label": "Fire Lit",
        "type": "checkbox",
        "kind": "points",
        "weight": 50,
        "sortOrder": 100,
        "config": {}
      }
    ]
  }
}
```

**Key changes from v2.9:**
- `type` field **removed entirely**
- `league: string` — references `camporee.leagues[].id`. Required on all games.
- `session: string | null` — references `camporee.sessions[].id`. Optional (Phase 2). `null` = always visible.

### 4b. Collator Runtime Format

`normalizeGameDefinition()` in `public/js/core/schema.js` transforms the Composer format for the Collator:

- `scoring_model.inputs[]` → `fields[]`
- Each field's `config` sub-object is **spread to root**
- Common fields injected: `[prefix presets] → [game-specific fields] → [suffix presets]`
- Presets selected by looking up `type_defaults[game.league]` in `camporee.json`
- `{{variable_name}}` template strings substituted from `game.variables`

The runtime `fields[]` array also receives injected fields from presets that match the game's league tier.

### 4c. Key Game Attributes

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Unique game identifier. Matches filename. |
| `league` | ✅ | FK → `camporee.leagues[].id`. Determines leaderboard. |
| `session` | ☐ | FK → `camporee.sessions[].id`. Null = always visible. Phase 2. |
| `sortOrder` | ✅ | Display order within the game list. |
| `variables` | ☐ | Template substitution map for preset labels. |
| `scoring_model.method` | ✅ | Win condition (see below). |

**`scoring_model.method` values:**
- `points_desc` — highest score wins
- `points_asc` — lowest score wins
- `timed_asc` — lowest time wins
- `timed_desc` — highest time wins

---

## 5. League Reference (replaces "Game Types")

The old `type: patrol | troop | exhibition` enum is **gone**. Leagues replace it entirely.

**Default BSA leagues for a standard two-tier camporee:**

| League id | label | tier | Notes |
|---|---|---|---|
| `patrol-games` | Patrol Games | `subunit` | Standard patrol scoring stations — rubric-based |
| `exhibition` | Exhibition Events | `subunit` | Participation-based — flat points per patrol per activity |
| `troop-challenges` | Troop Challenges | `unit` | Troop-level events |

Both `patrol-games` and `exhibition` are `tier: subunit`. Points from both leagues aggregate into the Overall Patrol leaderboard automatically — no manual score adjustment needed.

**Exhibition events** in the old schema had `type: exhibition` and received no scoring. In v3.0, exhibition is a proper league. Games in the `exhibition` league use a flat participation scoring field (e.g., a single checkbox or number field worth 50 points). The judge records which patrols participated; each gets the flat bonus toward Overall Patrol.

Individual rankings within an exhibition activity (e.g., archery 1st/2nd/3rd) are handled outside the app for now. When the `individual` tier is implemented, a second game definition (e.g., `archery-individual`) in a separate individual league will handle this. For now, individual awards are printed manually.

---

## 6. Roster Reference

### Roster Base Class

All roster entries share:

| Field | Type | Description |
|---|---|---|
| `id` | integer | Immutable unique identifier. Assigned at registration. |
| `name` | string | Mutable display name. Not a unique key. |

### UnitRoster

```json
{ "id": 1, "name": "Troop 99" }
```

### SubUnitRoster

```json
{ "id": 101, "name": "Fire Hawks", "unit_id": 1 }
```

`unit_id` references the parent `UnitRoster.id`. `null` for single-tier events.

### IndividualRoster *(Phase 3 placeholder)*

```json
{ "id": 1001, "name": "John Smith", "subunit_id": 101, "unit_id": 1 }
```

Not yet implemented. Future use for pre-registered or walk-up individual competitors.

---

## 7. Division *(Phase 3 placeholder)*

Divisions allow separate rankings within a league without creating separate leaderboards. Classic use case: experienced patrol division vs. new scout patrol division — same games, separate winners.

```json
"divisions": [
  { "id": "open",      "label": "Open Division" },
  { "id": "new-scout", "label": "New Scout Division" }
]
```

Each subunit (patrol) would be assigned to a division. Scoring engine computes rankings per division within the league. **Not yet implemented.** The `divisions` array is present in the schema as an empty `[]` on every league. Do not implement division logic until explicitly instructed.

---

## 8. Scoring Field Object

Unchanged from v2.9. Defined in `scoring_model.inputs[]` (Composer) and `presets.json`. Spread to root in Collator runtime format.

```json
{
  "id": "burn_time",
  "label": "Burn Time (seconds)",
  "type": "number",
  "kind": "points",
  "weight": 1,
  "sortOrder": 110,
  "audience": "judge",
  "config": { "min": 0, "max": 60 }
}
```

### Field Types (`type`)

| Type | Description |
|---|---|
| `number` | Numeric input |
| `stopwatch` | Start/Stop timer with MM:SS input |
| `text` | Single-line text |
| `textarea` | Multi-line text |
| `range` | Slider (requires `min`, `max` in `config`) |
| `select` | Dropdown (requires `options` in `config`) |
| `checkbox` | Toggle (True/False) |

### Scoring Logic (`kind`)

| Kind | Behavior |
|---|---|
| `points` | Added (+) to total score |
| `penalty` | Subtracted (−) from total score |
| `metric` | Recorded but not scored |
| `info` | Metadata only, not scored |
| `entryname` | Captures participant name, not scored |

### Visibility (`audience`)

- `judge` — visible on field tablet (default)
- `admin` — Collator dashboard only

---

## 9. Deployment Modes

Unchanged from v2.9. See `COLLATOR_MODE=offline` vs `cloud` in CLAUDE.md.

---

## 10. Migration from v2.9

**Status: ✅ Complete — 2026-06-04**

Migration script: `scripts/migrate-schema-v3.js`
Result: 3 camporee.json, 119 game files, 3 presets.json migrated. Script is idempotent.

| v2.9 | v3.0 | Status |
|---|---|---|
| `game.type: "patrol"` | `game.league: "patrol-games"` | ✅ migrated |
| `game.type: "troop"` | `game.league: "troop-challenges"` | ✅ migrated |
| `game.type: "exhibition"` | `game.league: "exhibition"` | ✅ migrated |
| `type_defaults.patrol` | `type_defaults["patrol-games"]` | ✅ migrated |
| `type_defaults.troop` | `type_defaults["troop-challenges"]` | ✅ migrated |
| no exhibition in type_defaults | `type_defaults["exhibition"]` — prefix: `[]`, suffix: `["off_score", "final_rank", "overall_points"]` | ✅ added |
| No `terminology` | Add default BSA terminology object | ✅ added |
| No `leagues` | Add default leagues array | ✅ added |
| No `rosters` | Add `rosters: { units: [], subunits: [], individuals: [] }` | ✅ added |
| No `sessions` | Add `sessions: []` | ✅ added |
| `preset.tier` missing | `tier: "subunit" \| "unit" \| "all"` on all presets | ✅ added |

The script reads and writes:
- `data/curator/` — game template library (empty at time of migration)
- `data/composer/workspaces/` — 3 Composer event workspaces
- `data/collator/active-event/` — active cartridge

All presets.json files received `tier` field per the mapping in `scripts/migrate-schema-v3.js`.
The `bracket_result` preset (not in the standard tier map) received `tier: "all"` as the safe default.

---

## 11. Schema Version History

| Version | Date | Summary |
|---|---|---|
| 2.9 | 2026-03 | Hardcoded `type: patrol\|troop\|exhibition`. Common field injection via `type_defaults`. |
| 3.0 | 2026-06 | `type` removed. `league` (FK), `session` (optional FK), `terminology`, `leagues[]`, `sessions[]`, `rosters{}` added. Division and Individual as placeholders. |
