CREATE TABLE IF NOT EXISTS feature_flags (
    name              TEXT    PRIMARY KEY,
    enabled           INTEGER NOT NULL DEFAULT 0,
    description       TEXT,
    user_ids_override TEXT
);
