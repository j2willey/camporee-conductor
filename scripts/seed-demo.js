/**
 * scripts/seed-demo.js
 *
 * Resets the Demo Collator to the real Circus 2026 event state:
 *   1. Extracts DEMO_CARTRIDGE_PATH zip into EVENT_PATH (overwrites existing event data)
 *   2. Restores entities, scores, and game_status from DEMO_SNAPSHOT_PATH
 *      using SQLite ATTACH so the running server sees the update immediately
 *      (no container restart required).
 *
 * Run inside the demo container:
 *   docker exec camporee-demo-collator node scripts/seed-demo.js
 *
 * Nightly cron (VPS crontab):
 *   0 3 * * * docker exec camporee-demo-collator node scripts/seed-demo.js >> /var/log/seed-demo.log 2>&1
 *
 * Required env (set in docker-compose):
 *   DEMO_CARTRIDGE_PATH   path to CamporeeConfig.zip inside the container
 *   DEMO_SNAPSHOT_PATH    path to seed-snapshot.db inside the container
 *   EVENT_PATH            where to extract the cartridge (default: /app/data/active-event)
 */

import Database from 'better-sqlite3';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.join(__dirname, '..');

// --- CONFIG ---

const CARTRIDGE_PATH = process.env.DEMO_CARTRIDGE_PATH;
if (!CARTRIDGE_PATH) {
    console.error('[seed-demo] ERROR: DEMO_CARTRIDGE_PATH env var is required');
    process.exit(1);
}
if (!fs.existsSync(CARTRIDGE_PATH)) {
    console.error(`[seed-demo] ERROR: Cartridge not found at ${CARTRIDGE_PATH}`);
    process.exit(1);
}

const SNAPSHOT_PATH = process.env.DEMO_SNAPSHOT_PATH || path.join(APP_ROOT, 'data', 'seed-snapshot.db');
if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`[seed-demo] ERROR: Snapshot not found at ${SNAPSHOT_PATH}`);
    console.error('[seed-demo]   Place the real camporee.db at that path (see DEMO_SNAPSHOT_PATH env var)');
    process.exit(1);
}

const EVENT_PATH = process.env.EVENT_PATH || path.join(APP_ROOT, 'data', 'active-event');
const DB_PATH    = path.join(APP_ROOT, 'data', 'collator', 'camporee.db');

console.log(`[seed-demo] ${new Date().toISOString()}`);
console.log(`[seed-demo] Cartridge : ${CARTRIDGE_PATH}`);
console.log(`[seed-demo] Snapshot  : ${SNAPSHOT_PATH}`);
console.log(`[seed-demo] Event path: ${EVENT_PATH}`);
console.log(`[seed-demo] DB        : ${DB_PATH}`);

// --- STEP 1: INSTALL CARTRIDGE ---

console.log('\n[seed-demo] Step 1: Installing cartridge...');
fs.rmSync(EVENT_PATH, { recursive: true, force: true });
fs.mkdirSync(EVENT_PATH, { recursive: true });
new AdmZip(CARTRIDGE_PATH).extractAllTo(EVENT_PATH, true);
console.log(`[seed-demo] Cartridge extracted to ${EVENT_PATH}`);

// --- STEP 2: RESTORE FROM SNAPSHOT ---

console.log('\n[seed-demo] Step 2: Restoring from snapshot...');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Open live DB in-place — do NOT delete the file.
// Deleting and recreating orphans the running server's open file descriptor.
// ATTACH copies data from the snapshot into the same inode the server has open.
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('patrol', 'troop')) NOT NULL,
    troop_number TEXT NOT NULL,
    parent_id TEXT,
    manual_rank TEXT
  );
  CREATE TABLE IF NOT EXISTS judges (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    unit TEXT
  );
  CREATE TABLE IF NOT EXISTS scores (
    uuid TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    score_payload TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    judge_id INTEGER,
    FOREIGN KEY(entity_id) REFERENCES entities(id),
    FOREIGN KEY(judge_id) REFERENCES judges(id)
  );
  CREATE TABLE IF NOT EXISTS game_status (
    game_id TEXT PRIMARY KEY,
    status TEXT
  );
  CREATE TABLE IF NOT EXISTS Matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    round_num INTEGER NOT NULL,
    match_num INTEGER NOT NULL,
    next_match_win_id TEXT,
    next_match_lose_id TEXT,
    status TEXT,
    FOREIGN KEY(tournament_id) REFERENCES game_status(game_id)
  );
  CREATE TABLE IF NOT EXISTS Match_Participants (
    match_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    slot_index INTEGER,
    score_value REAL,
    time_value REAL,
    PRIMARY KEY (match_id, entity_id),
    FOREIGN KEY(match_id) REFERENCES Matches(id),
    FOREIGN KEY(entity_id) REFERENCES entities(id)
  );
  CREATE TABLE IF NOT EXISTS Event_Standings (
    tournament_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    computed_rank INTEGER,
    official_rank INTEGER,
    status TEXT,
    secondary_metric REAL,
    PRIMARY KEY (tournament_id, entity_id),
    FOREIGN KEY(tournament_id) REFERENCES game_status(game_id),
    FOREIGN KEY(entity_id) REFERENCES entities(id)
  );
  CREATE TABLE IF NOT EXISTS game_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    judge_id INTEGER,
    score_count INTEGER,
    closed_at TEXT,
    server_received_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(judge_id) REFERENCES judges(id)
  );
  CREATE TABLE IF NOT EXISTS exhibition_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    scout_name TEXT NOT NULL DEFAULT '',
    troop_number TEXT NOT NULL DEFAULT '',
    patrol_name TEXT NOT NULL DEFAULT '',
    overall_place TEXT NOT NULL DEFAULT '',
    judges_notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS official_game_flags (
    entity_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    dq INTEGER NOT NULL DEFAULT 0,
    reason TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (entity_id, game_id)
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    action_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    game_id TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    notes TEXT
  );
`);

db.pragma('foreign_keys = OFF');
db.prepare('ATTACH DATABASE ? AS snap').run(SNAPSHOT_PATH);

db.exec(`
  DELETE FROM audit_log;
  DELETE FROM official_game_flags;
  DELETE FROM game_closures;
  DELETE FROM exhibition_results;
  DELETE FROM Event_Standings;
  DELETE FROM Match_Participants;
  DELETE FROM Matches;
  DELETE FROM game_status;
  DELETE FROM scores;
  DELETE FROM judges;
  DELETE FROM entities;

  INSERT INTO entities    SELECT * FROM snap.entities;
  INSERT INTO judges (id, name, email, unit) SELECT id, name, email, unit FROM snap.judges;
  INSERT INTO scores      SELECT * FROM snap.scores;
  INSERT INTO game_status SELECT * FROM snap.game_status;
`);

// Demo data is structured in three tiers to show the full event lifecycle:
//   Tier 1 — 2 games: fully scored + finalized (shows completed/awards state)
//   Tier 2 — 8 games: partially scored, not finalized (shows mid-event; pre-fill works)
//   Tier 3 — 8 games: empty, not finalized (shows fresh-start scoring)

// Rank all games by score count descending so tiers are stable across reseeds.
const gameRanks = db.prepare(`
  SELECT game_id,
         (SELECT COUNT(*) FROM scores s WHERE s.game_id = gs.game_id) AS cnt
  FROM game_status gs
  ORDER BY cnt DESC
`).all();

const tier1 = gameRanks.slice(0, 2).map(r => r.game_id);   // keep fully finalized
const tier2 = gameRanks.slice(2, 10).map(r => r.game_id);  // partial scores, not finalized
const tier3 = gameRanks.slice(10).map(r => r.game_id);     // wipe completely

// Tier 2: remove game_status (not finalized) but keep roughly half the scores
// so the emulator has data to pre-fill and the Competition Overview shows progress.
for (const gameId of tier2) {
    const scoreIds = db.prepare(
        'SELECT uuid FROM scores WHERE game_id = ? ORDER BY timestamp ASC'
    ).all(gameId).map(r => r.uuid);
    const keepCount = Math.ceil(scoreIds.length / 2);
    const toDelete = scoreIds.slice(keepCount);
    if (toDelete.length > 0) {
        const placeholders = toDelete.map(() => '?').join(',');
        db.prepare(`DELETE FROM scores WHERE uuid IN (${placeholders})`).run(...toDelete);
    }
}
db.prepare(`DELETE FROM game_status WHERE game_id IN (${tier2.map(() => '?').join(',')})`).run(...tier2);

// Tier 3: wipe all scores and status
if (tier3.length > 0) {
    const p3 = tier3.map(() => '?').join(',');
    db.prepare(`DELETE FROM scores WHERE game_id IN (${p3})`).run(...tier3);
    db.prepare(`DELETE FROM game_status WHERE game_id IN (${p3})`).run(...tier3);
}

db.exec('DETACH snap');

const troops    = db.prepare("SELECT COUNT(*) as n FROM entities WHERE type='troop'").get().n;
const patrols   = db.prepare("SELECT COUNT(*) as n FROM entities WHERE type='patrol'").get().n;
const judges    = db.prepare('SELECT COUNT(*) as n FROM judges').get().n;
const scores    = db.prepare('SELECT COUNT(*) as n FROM scores').get().n;
const finalized = db.prepare("SELECT COUNT(*) as n FROM game_status WHERE status='finalized'").get().n;

db.close();

console.log('\n[seed-demo] ✓ Done');
console.log(`  Troops    : ${troops}`);
console.log(`  Patrols   : ${patrols}`);
console.log(`  Judges    : ${judges}`);
console.log(`  Scores    : ${scores}`);
console.log(`  Tier 1    : ${tier1.length} games fully finalized`);
console.log(`  Tier 2    : ${tier2.length} games partially scored (pre-fill enabled)`);
console.log(`  Tier 3    : ${tier3.length} games empty (fresh start)`);
