-- Per-event judge access tokens.
-- The raw token string is returned exactly once (at creation) and never stored in plain text.
-- token_hash is SHA-256(raw_token), used for lookup on each request.
-- label is a human-readable name set by the director (e.g. "Station 7 Tablet").
--
-- Tokens are scoped to a single event_id and are validated against event_permissions
-- to confirm the event is still active. revoked_at is set when a director explicitly
-- revokes a token; expires_at is a hard expiry (epoch seconds).
CREATE TABLE IF NOT EXISTS judge_tokens (
    token_id    TEXT    PRIMARY KEY,          -- UUID
    event_id    TEXT    NOT NULL,             -- matches event_permissions.event_id
    token_hash  TEXT    NOT NULL UNIQUE,      -- SHA-256 of raw token; never stored plain
    label       TEXT    NOT NULL DEFAULT '',  -- human-readable device/station name
    created_by  TEXT    NOT NULL,             -- user_id of director who created it
    created_at  INTEGER NOT NULL,             -- epoch seconds
    expires_at  INTEGER,                      -- epoch seconds; NULL = never expires
    revoked_at  INTEGER,                      -- epoch seconds; NULL = active
    last_used   INTEGER                       -- epoch seconds; NULL = never used
);

CREATE INDEX IF NOT EXISTS idx_judge_tokens_event ON judge_tokens (event_id);
