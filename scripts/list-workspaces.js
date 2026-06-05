#!/usr/bin/env node
/**
 * Offline workspace audit tool.
 * Reads conductor.db and workspace directories directly — no server required.
 *
 * Usage:
 *   node scripts/list-workspaces.js
 *   node scripts/list-workspaces.js --json
 *   node scripts/list-workspaces.js --user <email_or_user_id>
 *
 * Env vars (optional, falls back to defaults):
 *   CONDUCTOR_DB_PATH   path to conductor.db
 *   WORKSPACE_PATH      path to composer workspaces dir
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openConductorDb } from '../src/db/migrate.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const WORKSPACE_PATH = process.env.WORKSPACE_PATH
    || path.join(PROJECT_ROOT, 'data', 'composer', 'workspaces');

// --- CLI args ---
const args = process.argv.slice(2);
const jsonMode  = args.includes('--json');
const userIdx   = args.indexOf('--user');
const userFilter = userIdx !== -1 ? args[userIdx + 1] : null;

// --- Open DB ---
const db = openConductorDb();

// --- Query: all owner rows joined with user profiles ---
const rows = db.prepare(`
    SELECT
        ep.event_id,
        ep.role,
        up.user_id,
        up.display_name,
        up.email,
        up.is_sysadmin,
        ep.granted_at
    FROM event_permissions ep
    LEFT JOIN user_profiles up ON ep.user_id = up.user_id
    ORDER BY ep.granted_at ASC
`).all();

// --- Build camporee map: event_id → { title, year, theme, games } ---
function readCamporeeTitle(eventId) {
    const p = path.join(WORKSPACE_PATH, eventId, 'camporee.json');
    if (!fs.existsSync(p)) return { title: '(missing camporee.json)', year: '', theme: '' };
    try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const gameCount = data.games?.length ?? 0;
        return {
            title:  data.meta?.title  || '(no title)',
            year:   data.meta?.year   || '',
            theme:  data.meta?.theme  || '',
            games:  gameCount,
        };
    } catch {
        return { title: '(corrupt camporee.json)', year: '', theme: '', games: '?' };
    }
}

// --- Also list workspace dirs that have no DB entry (orphans) ---
let orphanDirs = [];
if (fs.existsSync(WORKSPACE_PATH)) {
    const allDirs = fs.readdirSync(WORKSPACE_PATH, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    const knownIds = new Set(rows.map(r => r.event_id));
    orphanDirs = allDirs.filter(d => !knownIds.has(d));
}

// --- Group by event_id, collect all permission rows per event ---
const events = {};
for (const row of rows) {
    if (!events[row.event_id]) {
        events[row.event_id] = { event_id: row.event_id, permissions: [] };
    }
    events[row.event_id].permissions.push({
        role:         row.role,
        user_id:      row.user_id,
        display_name: row.display_name || '(no profile)',
        email:        row.email        || '(unknown)',
        is_sysadmin:  !!row.is_sysadmin,
        granted_at:   row.granted_at
            ? new Date(row.granted_at * 1000).toISOString().slice(0, 10)
            : '',
    });
}

// --- Apply user filter ---
let eventList = Object.values(events);
if (userFilter) {
    eventList = eventList.filter(e =>
        e.permissions.some(p =>
            p.email?.includes(userFilter) || p.user_id?.includes(userFilter)
        )
    );
}

// --- Attach camporee metadata ---
for (const e of eventList) {
    Object.assign(e, readCamporeeTitle(e.event_id));
    const dirPath = path.join(WORKSPACE_PATH, e.event_id);
    e.dir_exists = fs.existsSync(dirPath);
}

// --- Output ---
if (jsonMode) {
    const output = {
        workspace_path: WORKSPACE_PATH,
        generated_at:   new Date().toISOString(),
        events:         eventList,
        orphan_dirs:    orphanDirs,
    };
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
}

// --- Table output ---
const COLS = {
    event_id:    12,
    title:       32,
    year:         6,
    role:         8,
    email:       32,
    display_name: 20,
    granted_at:  12,
    dir:          5,
};

function pad(str, len) {
    const s = String(str ?? '');
    return s.length > len ? s.slice(0, len - 1) + '…' : s.padEnd(len);
}

const divider = Object.values(COLS).map(n => '─'.repeat(n)).join('─┼─');
const header  = [
    pad('event_id',    COLS.event_id),
    pad('title',       COLS.title),
    pad('year',        COLS.year),
    pad('role',        COLS.role),
    pad('email',       COLS.email),
    pad('display_name',COLS.display_name),
    pad('granted_at',  COLS.granted_at),
    pad('dir?',        COLS.dir),
].join(' │ ');

console.log(`\nWorkspace audit — ${new Date().toISOString()}`);
console.log(`DB:         ${process.env.CONDUCTOR_DB_PATH || '(default)'}`);
console.log(`Workspaces: ${WORKSPACE_PATH}`);
if (userFilter) console.log(`Filter:     ${userFilter}`);
console.log(`Events:     ${eventList.length}  |  Orphan dirs: ${orphanDirs.length}\n`);

console.log(header);
console.log(divider);

for (const e of eventList) {
    for (const p of e.permissions) {
        console.log([
            pad(e.event_id,    COLS.event_id),
            pad(e.title,       COLS.title),
            pad(e.year,        COLS.year),
            pad(p.role,        COLS.role),
            pad(p.email,       COLS.email),
            pad(p.display_name,COLS.display_name),
            pad(p.granted_at,  COLS.granted_at),
            pad(e.dir_exists ? '✓' : '✗', COLS.dir),
        ].join(' │ '));
    }
}

if (orphanDirs.length) {
    console.log('\n── Orphan workspace dirs (no DB entry) ──');
    for (const d of orphanDirs) {
        const meta = readCamporeeTitle(d);
        console.log(`  ${d}  →  ${meta.title} ${meta.year}`);
    }
}

console.log('');
