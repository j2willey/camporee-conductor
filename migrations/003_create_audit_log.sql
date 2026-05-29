CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT,
    action        TEXT    NOT NULL,
    resource_type TEXT    NOT NULL,
    resource_id   TEXT,
    metadata      TEXT,
    ts            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_ts      ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log(action);
