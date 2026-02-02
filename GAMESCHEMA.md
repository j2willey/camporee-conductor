# Game Configuration Schema

This document describes the structure of the JSON configuration files used to define games and scoring criteria in the Coyote Collator application.

## Directory Structure

*   `config/games/*.json`: Definitions for individual games (Patrol, Troop, or Exhibition).
*   `config/common.json`: Definitions for scoring fields common to all games (e.g., "Patrol Spirit").

## Game Definition (`config/games/*.json`)

Each file represents a single game/activity.

```json
{
  "id": "p1",
  "name": "Boiling the Ocean",
  "type": "patrol",
  "fields": [
    ... // Array of Field Definitions
  ]
}
```

### Root Attributes

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier. Format convention: `p#` for Patrol, `t#` for Troop, `e#` for Exhibition. |
| `name` | `string` | Display name of the game. |
| `type` | `string` | Category of the game. Allowed values: `"patrol"`, `"troop"`, `"exhibition"`. |
| `fields` | `array` | List of scoring fields specific to this game. |

---

## Field Definition

Fields define a single input on the scoring form. These are used in both the `fields` array of a game and in `common.json`.

```json
{
    "id": "time_to_boil",
    "label": "Time to Boil",
    "type": "time_mm_ss",
    "kind": "metric",
    "audience": "judge",
    "sortOrder": 10
}
```

### Field Attributes

| Attribute | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Unique key for the score payload. Must be unique within the game. |
| `label` | `string` | Yes | Display text for the label. |
| `type` | `string` | Yes | Input type (see Supported Field Types below). |
| `min` | `number` | No | Minimum value (for `number` or `range` types). |
| `max` | `number` | No | Maximum value (for `number` or `range` types). |
| `defaultValue` | `any` | No | Initial value. |
| `placeholder` | `string` | No | Helper text inside the input. |
| `options` | `string[]`| No | Array of strings for `select` type. |
| `audience` | `string` | No | Controls visibility. `"judge"` (default): visible to field judges. `"admin"`: hidden from judges, visible/editable only by admin. |
| `kind` | `string` | No | Controls summation behavior. `"points"` (default): value is added to "Total Score". `"metric"`: value is raw data (e.g. time, counts) and not added to total. |
| `sortOrder` | `number` | No | Controls the display order of fields. Lower numbers appear first. Defaults to 900. |

### Supported Field Types

| Type | Description |
| :--- | :--- |
| `number` | Standard numeric input (integer or float). Renders with numeric keypad on mobile. |
| `text` | Single-line text input. |
| `textarea` | Multi-line text input. |
| `select` | Dropdown menu (requires `options` array). |
| `range` | Slider control (requires `min` and `max`). |
| `time_mm_ss` | Special stopwatch input. Renders "Start" button and Minutes:Seconds fields. |
| `boolean` | **Deprecated**. Use `number` or `select` preferred. Renders as a switch. |

---

## Common Scoring (`config/common.json`)

Defines fields that are automatically appended to **every** game. Use this for universal metrics like "Patrol Spirit" or "Uniform Inspection".

Example:

```json
[
  {
    "id": "patrol_spirit",
    "label": "Patrol Spirit",
    "type": "number",
    "min": 0,
    "max": 10,
    "sortOrder": 100
  }
]
```
