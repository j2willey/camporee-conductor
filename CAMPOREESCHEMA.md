# Camporee Interchange Schema (v2.9)

**The "Cartridge" Format for the Camporee Conductor Suite**

This document describes the structure of the **Camporee Config Zip** (`CamporeeConfig.zip`). This archive acts as the bridge between the **Camporee Composer** (Design Tool) and the **Camporee Collator** (Runtime Engine).

---

## 1. Archive Structure

The Zip file must contain the following flat structure (no sub-folders except `games/`):

* **`camporee.json`**: The root manifest containing event metadata, the master playlist, and common field injection configuration.
* **`presets.json`**: A library of reusable common scoring fields (e.g., "Patrol Flag", "Scout Spirit"). Defines the shared fields injected at runtime — not baked into game files.
* **`games/`**: A directory containing the individual game definitions.
    * `games/{gameId}.json`: The game-specific definition for a single station (common fields are NOT stored here).

---

## 2. The Manifest (`camporee.json`)

This file is the entry point. It tells the Collator which games to load, in what order, and how to inject common fields per game type.

```json
{
  "schemaVersion": "2.9",
  "officials": [
    { "user_id": "user_2abc123", "display_name": "Jane Smith",  "email": "jane@example.com" },
    { "user_id": null,           "display_name": "Bob Nguyen",  "email": "bob@example.com"  }
  ],
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
      "line2": "The Circus",
      "sync": false,
      "styles": {
        "1": { "fontSize": "24px", "fontWeight": "bold" },
        "2": { "fontSize": "18px" }
      }
    }
  },
  "playlist": [
    { "gameId": "the-high-wire-fire-act", "order": 1 }
  ],
  "type_defaults": {
    "patrol": {
      "prefix": ["p_flag", "p_yell", "p_spirit", "ten_ess"],
      "suffix": ["unscout", "off_notes", "off_score", "final_rank", "overall_points"]
    },
    "troop": {
      "prefix": [],
      "suffix": ["off_score", "final_rank", "overall_points"]
    }
  }
}
```

### Key Attributes

* **`meta.camporeeId`**: (UUID) The unique link between the Design Server and the Runtime Server.
* **`meta.theme_colors`**: CSS variable overrides applied to the Judge PWA and Collator dashboard UI. Keys map to `--theme-main`, `--theme-header`, `--theme-accent`.
* **`meta.awards_config`**: Configuration for the awards certificate renderer (text lines and per-placement styles).
* **`playlist`**: Defines the runtime sequence.
    * **`gameId`**: Must match a filename in the `games/` folder (minus extension).
    * **`order`**: The integer sort order (1, 2, 3...).
* **`officials`**: *(optional, defaults to `[]`)* Array of personnel who serve as official scorers or event administrators. Each entry:
    * **`display_name`** *(required)*: Human-readable name shown on admin screens.
    * **`email`** *(required)*: Contact address. Used to match against judge logins in the Collator.
    * **`user_id`** *(optional)*: Clerk user ID (`user_2abc...`). Set when the official has a Conductor account. `null` for offline-only events or officials without accounts.
* **`type_defaults`**: Maps each game type to an ordered list of preset IDs. The Collator's `injectCommonFields()` function reads this at serve time to prepend prefix fields and append suffix fields around the game's own scoring inputs. `exhibition` games are not listed here and receive no injected fields.

---

## 3. The Presets File (`presets.json`)

This file defines common reusable scoring fields **once**. Game files do NOT store copies of these fields. Instead, the Collator injects them at runtime based on `type_defaults`.

Each preset entry supports template syntax: `{{variable_name}}` in `label` or `placeholder` strings is substituted at serve time from the game's `variables` object.

```json
{
  "presets": [
    {
      "id": "ten_ess",
      "label": "10 Essentials: {{ten_essentials}}",
      "type": "number",
      "kind": "points",
      "weight": 1,
      "sortOrder": 40,
      "position": "prefix",
      "config": { "min": 0, "max": 5 }
    },
    {
      "id": "p_flag",
      "label": "Patrol Flag",
      "type": "checkbox",
      "kind": "points",
      "weight": 1,
      "sortOrder": 10,
      "position": "prefix",
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
      "audience": "admin",
      "config": { "min": 0 }
    }
  ]
}
```

### Key Preset Attributes

* **`position`**: `"prefix"` — injected before game-specific fields. `"suffix"` — injected after game-specific fields.
* **`sortOrder`**: Used to order fields within the prefix or suffix group.
* **`audience`**: `"judge"` (default, visible to field judges) or `"admin"` (Collator dashboard only, e.g., Official Score, Final Ranking).

---

## 4. Game Definitions (`games/*.json`)

Each file represents a single station. Game files contain **only game-specific scoring inputs**. Common fields (Patrol Flag, Scout Spirit, 10 Essentials, Official Score, etc.) are **not stored here** — they are injected by the Collator at runtime from `presets.json` based on `type_defaults`.

### 4a. Composer Storage Format

This is the format written to disk by the Composer and stored inside the `CamporeeConfig.zip`.

```json
{
  "id": "the-high-wire-fire-act",
  "type": "patrol",
  "sortOrder": 10,
  "schemaVersion": "2.9",
  "content": {
    "title": "The High-Wire Fire Act",
    "story": "The circus needs fire...",
    "challenge": "Light a fire and keep it burning.",
    "description": "Each patrol must...",
    "rules": ["No lighter fluid.", "Fire must be self-sustaining for 60 seconds."],
    "time_and_scoring": "15 minutes. Points for speed and technique.",
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
      },
      {
        "id": "burn_time",
        "label": "Burn Time (seconds)",
        "type": "number",
        "kind": "points",
        "weight": 1,
        "sortOrder": 110,
        "config": { "min": 0, "max": 60 }
      }
    ]
  }
}
```

### 4b. Collator Runtime Format

The Collator's `/games.json` endpoint serves a transformed version. `normalizeGameDefinition()` in `public/js/core/schema.js` performs this translation:

* `scoring_model.inputs[]` is renamed to `fields[]`
* Each field's `config` sub-object is **spread to root** — `min`, `max`, `placeholder`, `options`, `defaultValue` appear at the top level of each field object alongside `id`, `label`, `type`, etc.
* Common fields are **injected** around the game-specific fields: `[prefix presets] → [game-specific fields] → [suffix presets]`
* `{{variable_name}}` template strings in preset labels/placeholders are substituted from `game.variables`

Example of a field in Collator format (after normalization and injection):

```json
{
  "id": "burn_time",
  "label": "Burn Time (seconds)",
  "type": "number",
  "kind": "points",
  "weight": 1,
  "sortOrder": 110,
  "min": 0,
  "max": 60
}
```

### 4c. Key Game Attributes

* **`variables`**: Optional `{ key: value }` map. Values are substituted into `{{variable_name}}` placeholders in injected preset labels. For example, `"ten_essentials": "matches"` causes the "10 Essentials: {{ten_essentials}}" preset label to render as "10 Essentials: matches".
* **`scoring_model.method`**: Win condition.
    * `"points_desc"`: Highest score wins.
    * `"points_asc"`: Lowest score wins.
    * `"timed_asc"`: Lowest time wins.
    * `"timed_desc"`: Highest time wins.

---

## 5. Game Types

| Type | Common Fields Injected | In-App Scoring | Description |
| :--- | :--- | :--- | :--- |
| `patrol` | Full prefix + suffix (flag, yell, spirit, 10 essentials, etc.) | Yes | Standard patrol competition station. The most common type. |
| `troop` | Suffix only (admin fields: Official Score, Final Ranking, Overall Points) | Yes | Troop-wide events, e.g., Gateway construction. No per-patrol common fields. |
| `exhibition` | None | No | Activities with no patrol scoring (e.g., slack line, climbing wall). Results entered manually outside the app. |

---

## 6. Scoring Field Object

This object defines a single input widget on the Judge's tablet. It is used in `scoring_model.inputs[]` (Composer format) and in `presets.json`. In the Collator runtime format (`fields[]`), the `config` sub-object is spread to root.

```json
{
  "id": "field_17024332",
  "label": "Knot Time",
  "type": "stopwatch",
  "kind": "metric",
  "weight": 0,
  "audience": "judge",
  "sortOrder": 10,
  "config": {
    "min": 0,
    "max": 300,
    "placeholder": "Enter seconds..."
  }
}
```

### Supported Field Types (`type`)

| Type | Description |
| :--- | :--- |
| **`number`** | Numeric keypad input. Used for points, counts, and deductions. |
| **`stopwatch`** | A specialized widget with "Start/Stop" and MM:SS input. |
| **`text`** | Single-line text input (short notes). |
| **`textarea`** | Multi-line text block (judge comments). |
| **`range`** | A slider control (requires `min` and `max` in `config`). |
| **`select`** | A dropdown menu (requires `options` array in `config`). |
| **`checkbox`** | A simple toggle switch (True/False). |

### Scoring Logic (`kind`)

| Kind | Behavior |
| :--- | :--- |
| **`points`** | Value is **added** (+) to the total score. |
| **`penalty`** | Value is **subtracted** (−) from the total score (rendered in red). |
| **`metric`** | Value is recorded but **ignored** for scoring (e.g., time recorded in a points-based game). |
| **`info`** | Metadata only (e.g., judge name). Not scored. |
| **`entryname`** | Captures the patrol or troop name. Not scored. |

### Visibility (`audience`)

* **`judge`**: Visible to field judges and all dashboard views. This is the default.
* **`admin`**: Hidden on the field tablet. Visible only in the Collator dashboard (used for official adjustments, final rankings, and overall points).
