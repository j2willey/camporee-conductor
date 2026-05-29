-- Stores per-event metadata extracted from the loaded cartridge (camporee.json).
-- The Collator reads officials and other event-level data from the JSON file on disk;
-- this table provides a SQL-queryable cache for conductor.db consumers (e.g., sysadmin panel).
--
-- `officials` is a JSON array:
--   [{ "user_id": string|null, "display_name": string, "email": string }, ...]
--
-- Rows are keyed by event_id, matching the event_id used in event_permissions.
CREATE TABLE IF NOT EXISTS event_metadata (
    event_id  TEXT PRIMARY KEY,
    officials TEXT NOT NULL DEFAULT '[]'
);
