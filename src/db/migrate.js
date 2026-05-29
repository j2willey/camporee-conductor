import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const DB_PATH = process.env.CONDUCTOR_DB_PATH || path.join(PROJECT_ROOT, 'data', 'shared', 'conductor.db');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'migrations');

export function openConductorDb() {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
}

export function runMigrations(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename   TEXT    PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )
    `);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.log('[migrations] migrations/ directory not found, skipping');
        return;
    }

    const applied = new Set(
        db.prepare('SELECT filename FROM schema_migrations').all().map(r => r.filename)
    );

    const pending = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort()
        .filter(f => !applied.has(f));

    if (pending.length === 0) {
        console.log('[migrations] All migrations current');
        return;
    }

    for (const file of pending) {
        console.log(`[migrations] Applying ${file}`);
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)')
            .run(file, Math.floor(Date.now() / 1000));
        console.log(`[migrations] Applied ${file}`);
    }
}
