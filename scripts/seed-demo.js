/**
 * scripts/seed-demo.js
 *
 * Resets the Demo Collator to a clean seeded state:
 *   1. Extracts DEMO_CARTRIDGE_PATH zip into EVENT_PATH (overwrites existing event data)
 *   2. Wipes and reinitializes camporee.db
 *   3. Inserts Circus 2026 roster (15 troops, 32 patrols)
 *   4. Seeds the first ~50% of patrol games with plausible scores for all patrols
 *
 * Run inside the demo container:
 *   docker exec camporee-demo-collator node scripts/seed-demo.js
 *
 * Nightly cron (VPS crontab):
 *   0 3 * * * docker exec camporee-demo-collator node scripts/seed-demo.js >> /var/log/seed-demo.log 2>&1
 *
 * Required env (set in docker-compose):
 *   DEMO_CARTRIDGE_PATH  path to CamporeeConfig.zip inside the container
 *   EVENT_PATH           where to extract the cartridge (default: /app/data/active-event)
 */

import Database from 'better-sqlite3';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { normalizeGameDefinition } from '../public/js/core/schema.js';

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

const EVENT_PATH = process.env.EVENT_PATH || path.join(APP_ROOT, 'data', 'active-event');
const DB_PATH    = path.join(APP_ROOT, 'data', 'collator', 'camporee.db');
const SEED_FRACTION = 0.5;

console.log(`[seed-demo] ${new Date().toISOString()}`);
console.log(`[seed-demo] Cartridge : ${CARTRIDGE_PATH}`);
console.log(`[seed-demo] Event path: ${EVENT_PATH}`);
console.log(`[seed-demo] DB        : ${DB_PATH}`);

// --- CIRCUS 2026 ROSTER (hard-coded — entities aren't stored in the cartridge) ---

const TROOPS = [
    { id: 't1000', name: 'T13',   troop_number: '13'   },
    { id: 't1001', name: 'T92',   troop_number: '92'   },
    { id: 't1002', name: 'T108',  troop_number: '108'  },
    { id: 't1003', name: 'T109',  troop_number: '109'  },
    { id: 't1004', name: 'T110',  troop_number: '110'  },
    { id: 't1005', name: 'T116',  troop_number: '116'  },
    { id: 't1006', name: 'T163',  troop_number: '163'  },
    { id: 't1007', name: 'T201',  troop_number: '201'  },
    { id: 't1008', name: 'T251',  troop_number: '251'  },
    { id: 't1009', name: 'T264',  troop_number: '264'  },
    { id: 't1010', name: 'T296',  troop_number: '296'  },
    { id: 't1011', name: 'T2110', troop_number: '2110' },
    { id: 't1012', name: 'T2163', troop_number: '2163' },
    { id: 't1013', name: 'T2170', troop_number: '2170' },
    { id: 't1014', name: 'T2019', troop_number: '2019' },
];

const PATROLS = [
    { id: 'p4300', name: 'Skeleton Fishing',  troop_number: '13',   parent_id: 't1000' },
    { id: 'p4301', name: 'Spooky Shrimp',     troop_number: '13',   parent_id: 't1000' },
    { id: 'p4302', name: 'Shadow Panther',    troop_number: '92',   parent_id: 't1001' },
    { id: 'p4303', name: 'Cold Flames',       troop_number: '92',   parent_id: 't1001' },
    { id: 'p4304', name: 'Jackalopes',        troop_number: '92',   parent_id: 't1001' },
    { id: 'p4305', name: 'Flaming Flamingoes',troop_number: '92',   parent_id: 't1001' },
    { id: 'p4306', name: 'Fearless Firebirds',troop_number: '108',  parent_id: 't1002' },
    { id: 'p4307', name: 'Falcons',           troop_number: '109',  parent_id: 't1003' },
    { id: 'p4308', name: 'Eaglez',            troop_number: '110',  parent_id: 't1004' },
    { id: 'p4309', name: 'Grease Fires',      troop_number: '116',  parent_id: 't1005' },
    { id: 'p4310', name: 'Inferno Sharks',    troop_number: '116',  parent_id: 't1005' },
    { id: 'p4311', name: 'Shampoo Drinkers',  troop_number: '163',  parent_id: 't1006' },
    { id: 'p4312', name: 'Chunky Monkeys',    troop_number: '163',  parent_id: 't1006' },
    { id: 'p4313', name: 'Atomic Duckies',    troop_number: '163',  parent_id: 't1006' },
    { id: 'p4314', name: 'Ducks',             troop_number: '201',  parent_id: 't1007' },
    { id: 'p4315', name: 'Raptors',           troop_number: '201',  parent_id: 't1007' },
    { id: 'p4316', name: 'Dark Dragons',      troop_number: '251',  parent_id: 't1008' },
    { id: 'p4317', name: 'Orcas',             troop_number: '251',  parent_id: 't1008' },
    { id: 'p4318', name: 'Eggos',             troop_number: '251',  parent_id: 't1008' },
    { id: 'p4319', name: 'Wolves',            troop_number: '264',  parent_id: 't1009' },
    { id: 'p4320', name: 'Card Board Boxes',  troop_number: '264',  parent_id: 't1009' },
    { id: 'p4321', name: 'Space Pirates',     troop_number: '264',  parent_id: 't1009' },
    { id: 'p4322', name: "Lakshay's Bros",    troop_number: '296',  parent_id: 't1010' },
    { id: 'p4323', name: "6'7ers",            troop_number: '296',  parent_id: 't1010' },
    { id: 'p4324', name: 'Minions',           troop_number: '2110', parent_id: 't1011' },
    { id: 'p4325', name: 'Goofy Goobers',     troop_number: '2163', parent_id: 't1012' },
    { id: 'p4326', name: 'Fancy Frogs',       troop_number: '2163', parent_id: 't1012' },
    { id: 'p4327', name: 'Banana Ducks',      troop_number: '2170', parent_id: 't1013' },
    { id: 'p4328', name: 'Krabbie Patties',   troop_number: '2019', parent_id: 't1014' },
    { id: 'p4329', name: 'Ice Dragons',       troop_number: '2019', parent_id: 't1014' },
    { id: 'p4330', name: 'Wolf Warriors',     troop_number: '2019', parent_id: 't1014' },
    { id: 'p4331', name: 'Fearless Foxes',    troop_number: '2019', parent_id: 't1014' },
];

// --- STEP 1: INSTALL CARTRIDGE ---

console.log('\n[seed-demo] Step 1: Installing cartridge...');
fs.rmSync(EVENT_PATH, { recursive: true, force: true });
fs.mkdirSync(EVENT_PATH, { recursive: true });
new AdmZip(CARTRIDGE_PATH).extractAllTo(EVENT_PATH, true);
console.log(`[seed-demo] Cartridge extracted to ${EVENT_PATH}`);

// --- STEP 2: RESET DATABASE ---

console.log('\n[seed-demo] Step 2: Resetting database...');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

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
console.log('[seed-demo] Database initialized');

// --- STEP 3: INSERT ROSTER ---

console.log('\n[seed-demo] Step 3: Seeding roster...');

const insertEntity = db.prepare(
    'INSERT INTO entities (id, name, type, troop_number, parent_id) VALUES (?, ?, ?, ?, ?)'
);

const seedRoster = db.transaction(() => {
    for (const t of TROOPS) {
        insertEntity.run(t.id, t.name, 'troop', t.troop_number, null);
    }
    for (const p of PATROLS) {
        insertEntity.run(p.id, p.name, 'patrol', p.troop_number, p.parent_id);
    }
});
seedRoster();
console.log(`[seed-demo] Inserted ${TROOPS.length} troops, ${PATROLS.length} patrols`);

// --- STEP 4: SEED PATROL GAME SCORES ---

console.log('\n[seed-demo] Step 4: Seeding patrol game scores...');

const gamesDir = path.join(EVENT_PATH, 'games');
if (!fs.existsSync(gamesDir)) {
    console.error('[seed-demo] ERROR: No games/ directory in extracted cartridge');
    process.exit(1);
}

const allGameFiles = fs.readdirSync(gamesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(gamesDir, f), 'utf8'));
            const normalized = normalizeGameDefinition(raw);
            return { id: raw.id || path.basename(f, '.json'), league: raw.league || null, fields: normalized.fields };
        } catch {
            return null;
        }
    })
    .filter(Boolean);

const patrolGames = allGameFiles
    .filter(g => g.league === 'patrol-games' && g.fields && g.fields.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

const seedCount = Math.ceil(patrolGames.length * SEED_FRACTION);
const gamesToSeed = patrolGames.slice(0, seedCount);
const gamesOpen   = patrolGames.slice(seedCount);

console.log(`[seed-demo] Patrol games: ${patrolGames.length} total, seeding ${seedCount}, leaving ${gamesOpen.length} open`);

function randInt(min, max) {
    min = Math.floor(min ?? 0);
    max = Math.floor(max ?? 10);
    if (max <= min) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePayload(fields) {
    const payload = {};
    for (const field of fields) {
        if (field.audience === 'official') continue; // judge-only for seeding
        const type = field.type || 'number';
        if (type === 'boolean') {
            payload[field.id] = Math.random() > 0.25 ? 1 : 0;
        } else if (type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
            payload[field.id] = field.options[Math.floor(Math.random() * field.options.length)];
        } else {
            // number, range, timed, stopwatch — all use min/max
            payload[field.id] = randInt(field.min, field.max);
        }
    }
    return payload;
}

const insertScore = db.prepare(
    'INSERT INTO scores (uuid, game_id, entity_id, score_payload, timestamp) VALUES (?, ?, ?, ?, ?)'
);

const seedScores = db.transaction(() => {
    let count = 0;
    const baseTime = Date.now() - (6 * 60 * 60 * 1000); // 6 hours ago
    for (const game of gamesToSeed) {
        for (const patrol of PATROLS) {
            const payload = generatePayload(game.fields);
            const jitter  = Math.floor(Math.random() * 3_600_000); // up to 1hr spread
            insertScore.run(randomUUID(), game.id, patrol.id, JSON.stringify(payload), baseTime + jitter);
            count++;
        }
    }
    return count;
});

const scoreCount = seedScores();

// --- SUMMARY ---

console.log('\n[seed-demo] ✓ Done');
console.log(`  Troops   : ${TROOPS.length}`);
console.log(`  Patrols  : ${PATROLS.length}`);
console.log(`  Seeded   : ${gamesToSeed.map(g => g.id).join(', ')}`);
console.log(`  Open     : ${gamesOpen.map(g => g.id).join(', ')}`);
console.log(`  Scores   : ${scoreCount}`);

db.close();
