CREATE TABLE IF NOT EXISTS event_permissions (
    event_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
    granted_by TEXT,
    granted_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_permissions_user ON event_permissions(user_id);
