CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        TEXT    PRIMARY KEY,
    display_name   TEXT,
    council_name   TEXT,
    council_number TEXT,
    district       TEXT,
    primary_role   TEXT,
    years_in_scouting INTEGER,
    bsa_member_id  TEXT,
    is_sysadmin    INTEGER NOT NULL DEFAULT 0,
    is_suspended   INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL,
    last_active    INTEGER NOT NULL
);
