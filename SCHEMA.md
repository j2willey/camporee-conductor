# Camporee Conductor Data Schemas

This document is auto-generated from the `schemas/*.json` files. It describes the structure of game templates and scoring models across the application.

## 1. Game Definition Schema

Defines a game concept. Can be used as a Library template (with variants) or an Active Camporee instance.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `library_uuid` | string (uuid or empty) | ✅ |  |
| `library_title` | string | ✅ | The original generic title of the game in the library |
| `game_title` | string | ❌ | The themed or display title for this specific game instance |
| `id` | string | ❌ | Short identifier (e.g., p10) |
| `category` | string | ❌ |  |
| `type` | string<br>_Enum:_ `patrol`, `troop`, `exhibition` | ✅ |  |
| `tags` | string[] | ❌ |  |
| `content` | object | ✅ | See **content Object** definitions below. |
| `scoring_model` | object | ✅ | See **scoring_model Object** definitions below. |
| `variants` | object[] | ❌ |  |

## 2. Content Object

Heavy narrative text and logistics for human consumption

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `legend` | string | ❌ | Thematic setting/story |
| `quest` | string | ❌ | Primary objective |
| `briefing` | string | ❌ | Instructions for competitors |
| `rules` | string[] | ❌ |  |
| `scoring_overview` | string | ❌ |  |
| `judging_notes` | string | ❌ |  |
| `notes` | string | ❌ |  |
| `references` | string | ❌ |  |
| `marketing_image_url` | string | ❌ |  |
| `logistics` | object | ❌ |  <br>(Contains nested properties, see below or source for details) |

### Logistics Sub-Object

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `staffing` | string | ❌ |  |
| `setup` | string | ❌ |  |
| `reset` | string | ❌ |  |
| `supplies_text` | string | ❌ | Unstructured text representation of supplies needed |
| `supplies` | object[] | ❌ |  |

## 3. Scoring Model Object

Defines how the game is scored by judges and tallied.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `camporee_uuid` | string | ❌ |  |
| `game_uuid` | string | ❌ |  |
| `method` | string<br>_Enum:_ `points_desc`, `points_asc`, `timed_asc`, `timed_desc` | ✅ |  |
| `inputs` | object[] | ✅ |  |

### Scoring Inputs Array Items

Every item inside the `inputs` array follows this structure:

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | string | ✅ |  |
| `label` | string | ✅ |  |
| `type` | string<br>_Enum:_ `number`, `stopwatch`, `text`, `textarea`, `range`, `select`, `checkbox` | ✅ |  |
| `kind` | string<br>_Enum:_ `points`, `penalty`, `metric`, `info`, `entryname` | ❌ |  _(Default: "points")_ |
| `audience` | string<br>_Enum:_ `judge`, `admin` | ❌ |  _(Default: "judge")_ |
| `weight` | number | ❌ |  _(Default: 1)_ |
| `sortOrder` | integer | ❌ |  _(Default: 900)_ |
| `config` | object | ❌ |  <br>(Contains nested properties, see below or source for details) |

#### Config Sub-Object (Type-Specific Constraints)

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `min` | number | ❌ |  |
| `max` | number | ❌ |  |
| `defaultValue` | number,string,boolean | ❌ |  |
| `placeholder` | string | ❌ |  |
| `options` | string[] | ❌ |  |

