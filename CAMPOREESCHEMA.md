# Camporee Interchange Schema (v2.9)

**The "Cartridge" Format for the Camporee Conductor Suite**

This document describes the structure of the **Camporee Config Zip** (`CamporeeConfig.zip`). This archive acts as the bridge between the **Camporee Composer** (Design Tool) and the **Camporee Collator** (Runtime Engine).

## 1. Archive Structure

The Zip file must contain the following flat structure (no sub-folders except `games/`):

* **`camporee.json`**: The root manifest containing event metadata and the master playlist.
* **`presets.json`**: A library of reusable "Atomic" scoring fields (e.g., "Patrol Flag", "Yell").
* **`games/`**: A directory containing the individual game definitions.
    * `games/{gameId}.json`: The self-contained definition for a single station.

---

## 2. The Manifest (`camporee.json`)

This file is the entry point. It tells the Conductor which games to load and in what order.

    {
      "schemaVersion": "2.9",
      "meta": {
        "camporeeId": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Silicon Valley Camporee 2026",
        "theme": "CyberScouts",
        "year": 2026,
        "director": "Jim Willey"
      },
      "playlist": [
        {
          "gameId": "game_170830123",
          "enabled": true,
          "order": 1
        }
      ]
    }

### Key Attributes
* **`meta.camporeeId`**: (UUID) The unique link between the Design Server and the Runtime Server.
* **`playlist`**: Defines the runtime sequence.
    * **`gameId`**: Must match a filename in the `games/` folder (minus extension).
    * **`order`**: The integer sort order (1, 2, 3...). The Runtime multiplies this by 10 for spacing.

---

## 3. Game Definitions (`games/*.json`)

Each file represents a single station. Unlike the legacy format, these are **self-contained** (no "includes" or "appends"). The Composer "bakes" all shared presets directly into the file definition.

    {
      "id": "game_170830123",
      "type": "patrol",
      "sortOrder": 10,
      "schemaVersion": "2.9",
      "content": {
        "title": "Knot Tying Relay",
        "story": "You are stranded on a desert island...",
        "instructions": "Tie 3 knots in under 2 minutes."
      },
      "scoring": {
        "method": "points_desc",
        "components": [
          ... // Array of Scoring Component Objects
        ]
      }
    }

### Key Attributes
* **`type`**: The competition track.
    * `"patrol"`: Standard Patrol games.
    * **`"troop"`**: Troop-wide events (e.g., Gateway construction).
    * `"exhibition"`: Non-scored or individual activities.
* **`scoring.method`**: Win condition.
    * `"points_desc"`: Highest Score Wins.
    * `"timed_asc"`: Lowest Time Wins.

---

## 4. Scoring Component Object (The Field)

This object defines a single input widget on the Judge's tablet. It is used in both `games/*.json` and `presets.json`.

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

### Supported Field Types (`type`)

| Type | Description |
| :--- | :--- |
| **`number`** | Numeric keypad input. Used for points, counts, and deductions. |
| **`stopwatch`** | A specialized widget with "Start/Stop" and MM:SS input. |
| **`text`** | Single-line text input (Short notes). |
| **`textarea`** | Multi-line text block (Judge comments). |
| **`range`** | A slider control (requires `min` and `max` in config). |
| **`select`** | A dropdown menu (requires `options` array in config). |
| **`checkbox`** | A simple Toggle Switch (True/False). |

### Scoring Logic (`kind`)

| Kind | Behavior |
| :--- | :--- |
| **`points`** | Value is **added** (+) to the total score. |
| **`penalty`** | Value is **subtracted** (-) from the total score (rendered in red). |
| **`metric`** | Value is recorded but **ignored** for scoring (e.g., Time in a Points game). |
| **`info`** | Metadata only (e.g., "Patrol Leader Name"). |

### Visibility (`audience`)

* **`judge`**: Visible to everyone.
* **`admin`**: Hidden on the field. Visible only in the "Conductor" dashboard (e.g., for official adjustments).