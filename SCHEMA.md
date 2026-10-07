# Camporee Conductor Data Schemas

This document is auto-generated from the `schemas/*.json` files. It describes the structure of game templates and scoring models across the application.

## 1. Game Definition Schema

Defines a game concept. Can be used as a Library template (with variants) or an Active Camporee instance.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `library_uuid` | string (uuid or empty) | ❌ |  |
| `library_title` | string | ❌ | The original generic title of the game in the library |
| `game_title` | string | ❌ | The themed or display title for this specific game instance |
| `id` | string | ❌ | Short identifier (e.g., the-high-wire-fire-act) |
| `league` | string | ✅ | FK → camporee.leagues[].id. Determines which leaderboard this game contributes to. |
| `session` | string,null | ❌ | FK → camporee.sessions[].id. Null = always visible. Phase 2 — do not expose in UI. |
| `category` | string | ❌ |  |
| `tags` | string[] | ❌ |  |
| `content` | object | ✅ | See **content Object** definitions below. |
| `scoring_model` | object | ✅ | See **scoring_model Object** definitions below. |
| `source_snapshot` | object | ❌ |  <br>(Contains nested properties, see below or source for details) |
| `variables` | object | ❌ | Key/value pairs for template substitution in injected common fields. |
| `variants` | object[] | ❌ |  |

## 2. Content Object

Heavy narrative text and logistics for human consumption

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `story` | string | ❌ | Thematic setting/story |
| `challenge` | string | ❌ | Primary objective |
| `description` | string | ❌ | Instructions for competitors |
| `rules` | string[] | ❌ |  |
| `time_and_scoring` | string | ❌ |  |
| `scoring_notes` | string | ❌ |  |
| `notes` | string | ❌ |  |
| `references` | string | ❌ |  |
| `marketing_image_url` | string | ❌ |  |
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

## 4. Camporee Event Configuration (Manifest)

The camporee.json manifest inside a cartridge zip — event metadata, terminology, leagues, rosters, and the game playlist.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `schemaVersion` | string | ✅ |  |
| `meta` | object | ✅ |  <br>(Contains nested properties, see below or source for details) |
| `terminology` | object | ❌ | Configurable display labels for participant tiers. UI still uses hardcoded BSA labels in Phase 1. <br>(Contains nested properties, see below or source for details) |
| `leagues` | object[] | ✅ | Director-defined scoring pools. Every game references a league by id. |
| `sessions` | object[] | ❌ | Phase 2 placeholder. Named time slots for judge display grouping. Empty = flat game list. _(Default: [])_ |
| `rosters` | object | ✅ | All competing entities for the event. units = primary competitive entities, subunits = patrols/dens. <br>(Contains nested properties, see below or source for details) |
| `type_defaults` | object | ❌ | Defines which common preset fields are injected for each league at runtime. Keyed by league id (e.g. 'patrol-games', 'troop-challenges', 'exhibition'). |
| `officials` | object[] | ❌ | Personnel who serve as official scorers or administrators for this event. _(Default: [])_ |
| `playlist` | object[] | ✅ |  |

### meta Object

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `camporeeId` | string | ✅ |  |
| `title` | string | ✅ |  |
| `theme` | string | ✅ |  |
| `year` | integer | ✅ |  |
| `director` | string | ❌ |  |
| `district` | string | ❌ |  |
| `council` | string | ❌ |  |
| `location` | object | ❌ |  <br>(Contains nested properties, see below or source for details) |
| `dates` | object | ❌ |  <br>(Contains nested properties, see below or source for details) |
| `contacts` | object[] | ❌ |  |
| `introduction` | string | ❌ |  |

#### location Object

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `name` | string | ❌ |  |
| `address` | string | ❌ |  |

#### dates Object

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `start` | string | ❌ |  |
| `end` | string | ❌ |  |

#### contacts Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `role` | string | ❌ |  |
| `name` | string | ❌ |  |
| `email` | string | ❌ |  |
| `phone` | string | ❌ |  |

### terminology Object

Configurable display labels for participant tiers. UI still uses hardcoded BSA labels in Phase 1.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `unit` | string,null | ❌ |  |
| `subunit` | string,null | ❌ |  |
| `member` | string,null | ❌ |  |
| `event` | string,null | ❌ |  |
| `organizer` | string,null | ❌ |  |

### leagues Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | string | ✅ | Primary key. Referenced by game.league. |
| `label` | string | ✅ | Display name (e.g. 'Patrol Games'). |
| `tier` | string<br>_Enum:_ `unit`, `subunit`, `individual` | ✅ | Which roster tier competes in this league. |
| `registration` | string<br>_Enum:_ `registered`, `open` | ✅ | registered = entrants from roster; open = judge enters names at station. |
| `divisions` | object[] | ❌ | Phase 3 placeholder. Always empty array for now. |

#### divisions Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | string | ✅ |  |
| `label` | string | ✅ |  |

### sessions Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | string | ✅ |  |
| `label` | string | ✅ |  |
| `start` | string | ❌ |  |
| `end` | string | ❌ |  |

### rosters Object

All competing entities for the event. units = primary competitive entities, subunits = patrols/dens.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `units` | object[] | ✅ |  |
| `subunits` | array,null | ✅ |  |
| `individuals` | object[] | ✅ | Phase 3 placeholder. Always empty array for now. |

#### units Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | integer | ✅ |  |
| `name` | string | ✅ |  |

#### subunits Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | integer | ✅ |  |
| `name` | string | ✅ |  |
| `unit_id` | integer,null | ❌ |  |

#### individuals Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | integer | ✅ |  |
| `name` | string | ✅ |  |
| `subunit_id` | integer,null | ❌ |  |
| `unit_id` | integer,null | ❌ |  |

### type_defaults Value Shape (keyed by league id)

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `prefix` | string[] | ❌ |  |
| `suffix` | string[] | ❌ |  |

### officials Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `user_id` | string,null | ❌ | Clerk user_id. Null for officials who do not have a Conductor account. |
| `display_name` | string | ✅ |  |
| `email` | string | ✅ |  |
| `role` | string<br>_Enum:_ `director`, `official` | ❌ | Event role. 'director' for the event owner; 'official' for all others. |

### playlist Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `gameId` | string | ✅ | Must match a filename in the games/ folder (minus extension) |
| `enabled` | boolean | ❌ |  |
| `order` | integer | ✅ |  |

## 5. Common Field Preset

A reusable scoring field injected into game definitions at runtime by the Collator.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | string | ✅ | Unique preset identifier. Referenced by type_defaults prefix/suffix arrays. |
| `label` | string | ✅ | Display label. May contain {{variable_name}} template syntax. |
| `type` | string<br>_Enum:_ `number`, `stopwatch`, `text`, `textarea`, `range`, `select`, `checkbox` | ✅ | Input widget type. |
| `kind` | string<br>_Enum:_ `points`, `penalty`, `metric`, `info`, `entryname` | ✅ | Scoring behavior. |
| `weight` | number | ✅ | Multiplier applied to this field's value when computing total score. |
| `sortOrder` | integer | ❌ | Display order within the prefix or suffix group. |
| `position` | string<br>_Enum:_ `prefix`, `suffix` | ✅ | Whether this preset is injected before or after game-specific fields. |
| `tier` | string<br>_Enum:_ `unit`, `subunit`, `all` | ✅ | Which league tier this preset applies to. 'all' = injected for every scored game. |
| `audience` | string<br>_Enum:_ `judge`, `admin` | ❌ | Visibility: judge = shown on field tablet; admin = Collator dashboard only. |
| `required` | boolean | ❌ |  |
| `config` | object | ❌ | Widget-specific config: min, max, placeholder, options, defaultValue. <br>(Contains nested properties, see below or source for details) |

### config Object

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `min` | number | ❌ |  |
| `max` | number | ❌ |  |
| `placeholder` | string | ❌ |  |
| `defaultValue` |  | ❌ |  |
| `options` | string[] | ❌ |  |

## 6. Game Library Index

Index of games in the Curator game library — used for browse/search without loading every full game file.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `last_updated` | string | ❌ |  |
| `games` | object[] | ✅ |  |

### games Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | string | ✅ |  |
| `title` | string | ✅ |  |
| `path` | string | ✅ | Relative path to the full JSON definition file |
| `tags` | string[] | ✅ |  |
| `complexity` | string<br>_Enum:_ `Low`, `Medium`, `High` | ❌ |  |

## 7. Camporee Archive Index

Index of archived camporee cartridges — used for browse/search without unpacking every zip.

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `camporees` | object[] | ✅ |  |

### camporees Array Items

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | string | ✅ |  |
| `year` | integer | ✅ |  |
| `title` | string | ✅ |  |
| `theme` | string | ❌ |  |
| `path` | string | ✅ | Path to the .zip file |
| `game_count` | integer | ❌ |  |
| `thumbnail_url` | string | ❌ |  |

