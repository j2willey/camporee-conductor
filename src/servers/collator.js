import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';
import session from 'express-session';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { normalizeGameDefinition, getGameTier } from '../../public/js/core/schema.js';

dotenv.config();

const COLLATOR_MODE = (process.env.COLLATOR_MODE || 'offline').toLowerCase();
console.log(`[Collator] Running in ${COLLATOR_MODE} mode`);

// --- CONFIGURATION & PATHS ---
const __filename = fileURLToPath(import.meta.url);
// Since this file is in src/servers/, we need to go up one level to reach the project root
const __dirname = path.join(path.dirname(__filename), '..', '..');
const app = express();
const PORT = 3000;

// Directory Structure
const DATA_DIR = path.join(__dirname, 'data', 'collator');
const ACTIVE_DIR = process.env.EVENT_PATH || path.join(DATA_DIR, 'active-event');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const UPLOAD_TEMP = path.join(DATA_DIR, 'temp_uploads');
const LIBRARY_PATH = process.env.LIBRARY_PATH || path.join(__dirname, 'data', 'library');

// Ensure all directories exist
[DATA_DIR, ACTIVE_DIR, ARCHIVE_DIR, UPLOAD_TEMP].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Setup Upload handling
const upload = multer({ dest: UPLOAD_TEMP });

// --- DATABASE SETUP ---
const db = new Database(path.join(DATA_DIR, 'camporee.db'));

// Initialize Tables
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

// Cloud-mode event permissions table
if (COLLATOR_MODE === 'cloud') {
    db.exec(`
        CREATE TABLE IF NOT EXISTS event_permissions (
            camporee_id   TEXT,
            user_id       TEXT,
            email         TEXT,
            display_name  TEXT,
            role          TEXT,
            PRIMARY KEY (camporee_id, user_id)
        )
    `);
}

// --- MIGRATIONS ---
try {
    db.exec("ALTER TABLE entities ADD COLUMN parent_id TEXT");
} catch (e) {
    // Column likely exists, ignore
}

try {
    db.exec("ALTER TABLE entities ADD COLUMN manual_rank TEXT");
} catch (e) {
    // Column likely exists, ignore
}

// [Bracket Update] We drop the DB constraint so we can manage duplicates in Code
try {
    db.exec("DROP INDEX IF EXISTS idx_game_entity");
} catch (e) {
    console.log("Index already removed");
}

// --- AUDIT LOGGING ---

function logAudit(action_type, { entity_type, entity_id, game_id, field_name, old_value, new_value, notes } = {}) {
    try {
        db.prepare(`
            INSERT INTO audit_log (action_type, entity_type, entity_id, game_id, field_name, old_value, new_value, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            action_type,
            entity_type || null,
            entity_id || null,
            game_id || null,
            field_name || null,
            old_value != null ? String(old_value) : null,
            new_value != null ? String(new_value) : null,
            notes || null
        );
    } catch (e) {
        console.error('[audit] log failed:', e.message);
    }
}

// --- HELPER FUNCTIONS ---

function timeToSeconds(val) {
    if (!val) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.includes(':')) {
        const [m, s] = val.split(':').map(Number);
        return (m * 60) + s;
    }
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
}

/**
 * Update Event_Standings for a given tournament (game_id)
 */
function updateStandings(tournamentId) {
    const allGames = loadCamporeeData().games;
    const gameDef = allGames.find(g => g.id === tournamentId);
    if (!gameDef) return;

    const isTimePriority = (gameDef.fields || []).some(f => f.type === 'timed' || f.type === 'stopwatch');

    // Get all unique entities involved in this tournament
    const entities = db.prepare(`
        SELECT DISTINCT entity_id FROM Match_Participants
        WHERE match_id IN (SELECT id FROM Matches WHERE tournament_id = ?)
    `).all(tournamentId);

    for (const { entity_id } of entities) {
        const stats = db.prepare(`
            SELECT AVG(score_value) as avg_score, MIN(time_value) as min_time, AVG(time_value) as avg_time
            FROM Match_Participants
            WHERE entity_id = ? AND match_id IN (SELECT id FROM Matches WHERE tournament_id = ?)
        `).get(entity_id, tournamentId);

        const secondary_metric = isTimePriority ? (stats.min_time || stats.avg_time) : stats.avg_score;

        db.prepare(`
            INSERT INTO Event_Standings (tournament_id, entity_id, secondary_metric)
            VALUES (?, ?, ?)
            ON CONFLICT(tournament_id, entity_id) DO UPDATE SET
                secondary_metric = excluded.secondary_metric
        `).run(tournamentId, entity_id, secondary_metric);
    }
}

function getActiveMeta() {
    const metaPath = path.join(ACTIVE_DIR, 'camporee.json');
    if (!fs.existsSync(metaPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8')).meta;
    } catch (e) {
        return null;
    }
}

function archiveDatabase() {
    const dbFile = path.join(DATA_DIR, 'camporee.db');
    if (fs.existsSync(dbFile)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `camporee_backup_${timestamp}.db`;

        fs.copyFileSync(dbFile, path.join(ARCHIVE_DIR, backupName));

        // Clear active tables to "reset" the event
        db.exec("DELETE FROM scores; DELETE FROM judges; DELETE FROM game_status;");
        console.log(`[System] Archived DB to ${backupName} and cleared active tables.`);
    }
}

// --- COMMON FIELD INJECTION ---

function applyTemplate(str, variables) {
    if (!str) return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '___');
}

function injectCommonFields(normalizedGame, presets, typeDefaults, leagues) {
    const defaults = typeDefaults[normalizedGame.league];
    if (!defaults || !Array.isArray(normalizedGame.fields)) return;

    const tier = getGameTier(normalizedGame, { leagues: leagues || [] });
    const presetsById = Object.fromEntries(presets.map(p => [p.id, p]));
    const variables = normalizedGame.variables || {};

    function resolvePreset(id) {
        const p = presetsById[id];
        if (!p) return null;
        // Tier safety check: skip presets that belong to the wrong roster tier.
        // Presets with tier "all" are always injected.
        if (tier && p.tier && p.tier !== 'all' && p.tier !== tier) return null;
        const { config = {}, position, sortOrder, ...rest } = p;
        return {
            ...rest,
            label: applyTemplate(p.label, variables),
            placeholder: applyTemplate(config.placeholder, variables),
            ...(config.min !== undefined ? { min: config.min } : {}),
            ...(config.max !== undefined ? { max: config.max } : {}),
            ...(config.options ? { options: config.options } : {}),
            ...(config.defaultValue !== undefined ? { defaultValue: config.defaultValue } : {})
        };
    }

    const prefixFields = (defaults.prefix || []).map(resolvePreset).filter(Boolean);
    const suffixFields = (defaults.suffix || []).map(resolvePreset).filter(Boolean);
    normalizedGame.fields = [...prefixFields, ...normalizedGame.fields, ...suffixFields];
}

function installCartridge(zipPath) {
    // 1. Wipe Active Directory
    fs.rmSync(ACTIVE_DIR, { recursive: true, force: true });
    fs.mkdirSync(ACTIVE_DIR, { recursive: true });

    // 2. Extract New Cartridge
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(ACTIVE_DIR, true);

    // 3. Cleanup Zip
    fs.unlinkSync(zipPath);
    console.log("[System] New Camporee Cartridge Installed.");
}

function loadCamporeeData() {
    const manifestPath = path.join(ACTIVE_DIR, 'camporee.json');
    if (!fs.existsSync(manifestPath)) {
        return { metadata: {}, games: [] };
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        // Load presets and type_defaults for common field injection
        const presetsPath = path.join(ACTIVE_DIR, 'presets.json');
        const presets = fs.existsSync(presetsPath) ? JSON.parse(fs.readFileSync(presetsPath, 'utf8')) : [];
        const typeDefaults = manifest.type_defaults || {};

        const games = [];

        if (manifest.playlist) {
            manifest.playlist.forEach(item => {
                if (item.enabled !== false) {
                    const gamePath = path.join(ACTIVE_DIR, 'games', `${item.gameId}.json`);
                    if (fs.existsSync(gamePath)) {
                        const gameDef = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
                        const normalizedGame = normalizeGameDefinition(gameDef, item.order);

                        // Ensure legacy 'name' property exists
                        if (!gameDef.name && gameDef.content && gameDef.content.title) {
                            gameDef.name = gameDef.content.title;
                            normalizedGame.name = gameDef.content.title;
                        }

                        // Hydrate bracket configuration for the UI
                        normalizedGame.bracketMode = !!gameDef.bracketMode;
                        normalizedGame.match_label = gameDef.match_label || '';

                        // Inject common prefix/suffix fields from presets
                        injectCommonFields(normalizedGame, presets, typeDefaults, manifest.leagues);

                        games.push(normalizedGame);
                    }
                }
            });
        }

        games.sort((a, b) => a.sortOrder - b.sortOrder);

        // Assign per-league display numbers so p1/p2/p3 count only patrol games, etc.
        const leagueCounters = {};
        games.forEach(game => {
            const l = game.league || 'unknown';
            leagueCounters[l] = (leagueCounters[l] || 0) + 1;
            game.displayOrder = leagueCounters[l];
        });

        return {
            metadata: manifest.meta,
            games: games
        };

    } catch (err) {
        console.error("Error hydrating camporee data:", err);
        return { metadata: {}, games: [] };
    }
}

function getNextEntityId(type) {
    const prefix = type === 'patrol' ? 'p' : 't';
    const query = `
        SELECT id FROM entities
        WHERE type=? AND id LIKE '${prefix}%'
        ORDER BY id DESC LIMIT 1
    `;
    const row = db.prepare(query).get(type);

    let nextNum = type === 'patrol' ? 4300 : 1000;
    if (row && row.id) {
        const currentNum = parseInt(row.id.substring(1));
        if (!isNaN(currentNum)) nextNum = currentNum + 1;
    }
    return `${prefix}${nextNum}`;
}

// --- AUTH HELPERS ---

function requireOfficial(req, res, next) {
    if (COLLATOR_MODE === 'cloud') {
        const { userId } = getAuth(req);
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const meta = getActiveMeta();
        if (!meta?.camporeeId) return res.status(503).json({ error: 'No event loaded' });
        const perm = db.prepare('SELECT role FROM event_permissions WHERE camporee_id = ? AND user_id = ?').get(meta.camporeeId, userId);
        if (!perm) return res.status(403).json({ error: 'Not authorized for this event' });
        req.officialRole = perm.role;
    } else {
        if (!req.session?.role) {
            return res.status(401).json({ error: 'Identification required', requiresIdentify: true });
        }
        req.officialRole = req.session.role;
    }
    next();
}

function installOfficials(camporeeId, uploadUserId, officials) {
    db.prepare('DELETE FROM event_permissions WHERE camporee_id = ?').run(camporeeId);
    db.prepare('INSERT OR REPLACE INTO event_permissions (camporee_id, user_id, role) VALUES (?, ?, ?)').run(camporeeId, uploadUserId, 'director');
    for (const o of officials) {
        if (!o.user_id || o.user_id === uploadUserId) continue;
        db.prepare(`
            INSERT OR IGNORE INTO event_permissions (camporee_id, user_id, email, display_name, role)
            VALUES (?, ?, ?, ?, 'official')
        `).run(camporeeId, o.user_id, o.email || null, o.display_name || null);
    }
}

// --- MIDDLEWARE ---
app.use(express.json());

if (COLLATOR_MODE === 'cloud') {
    app.use(clerkMiddleware());
} else {
    app.use(session({
        secret: process.env.SESSION_SECRET || 'collator-offline-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax' }
    }));
    // Redirect unauthenticated requests for protected pages to identify.html
    // (runs before express.static so it intercepts /admin.html, /utils.html)
    app.use((req, res, next) => {
        const protectedPages = ['/admin.html', '/utils.html'];
        if (protectedPages.includes(req.path) && !req.session?.role && getActiveMeta()) {
            return res.redirect((req.baseUrl || '/collator') + '/identify.html');
        }
        next();
    });
}

app.use(express.static('public', { index: false }));
// Map the legacy /library/games path to the new separated silo
app.use('/library/games', express.static(LIBRARY_PATH));

// Middleware: Force setup if no camporee is loaded
const requireConfig = (req, res, next) => {
    const bypassRoutes = [
        '/setup',
        '/api/setup/upload',
        '/api/setup/confirm',
        '/setup/conflict',
        '/api/auth/whoami',
        '/api/auth/identify',
        '/identify.html'
    ];

    // Allow static resources and bypass routes
    if (bypassRoutes.includes(req.path) ||
        req.path.startsWith('/css/') ||
        req.path.startsWith('/js/') ||
        req.path.startsWith('/img/')) {
        return next();
    }

    if (!getActiveMeta()) {
        return res.redirect((req.baseUrl || '/collator') + '/setup');
    }
    next();
};
app.use(requireConfig);

// --- ROUTES ---

app.get('/setup', (req, res) => {
    const base = req.baseUrl || '/collator';
    res.send(`
        <html>
            <head><title>Setup</title><link rel="stylesheet" href="/css/bootstrap.min.css"></head>
            <body class="bg-dark text-light d-flex align-items-center justify-content-center vh-100">
                <div class="card bg-secondary text-white p-5 text-center" style="max-width: 500px;">
                    <h1>Camporee Collator</h1>
                    <p class="lead">System Ready. Load Cartridge.</p>
                    <form action="${base}/api/setup/upload" method="post" enctype="multipart/form-data">
                        <input class="form-control mb-3" type="file" name="configZip" accept=".zip" required>
                        <button type="submit" class="btn btn-primary w-100">Upload Configuration</button>
                    </form>
                </div>
            </body>
        </html>
    `);
});

app.post('/api/setup/upload', upload.single('configZip'), (req, res) => {
    if (!req.file) return res.redirect((req.baseUrl || '/collator') + '/setup');

    // Cloud mode: require Clerk auth to upload a cartridge
    if (COLLATOR_MODE === 'cloud') {
        const { userId } = getAuth(req);
        if (!userId) {
            fs.unlinkSync(req.file.path);
            return res.status(401).json({ error: 'Authentication required' });
        }
    }

    const zipPath = req.file.path;
    const zip = new AdmZip(zipPath);
    let newMeta = null;
    let newOfficials = [];

    try {
        const metaEntry = zip.getEntry("camporee.json");
        if (!metaEntry) throw new Error("Invalid Zip");
        const manifest = JSON.parse(metaEntry.getData().toString('utf8'));
        newMeta = manifest.meta;
        newOfficials = manifest.officials || [];
    } catch (e) {
        fs.unlinkSync(zipPath);
        return res.send("Error: Invalid Camporee Zip (Missing camporee.json)");
    }

    const currentMeta = getActiveMeta();
    const pendingPath = path.join(UPLOAD_TEMP, 'pending_update.zip');

    // Case 1: Brand New or UUID Mismatch -> Wipe & Install
    if (!currentMeta || newMeta.camporeeId !== currentMeta.camporeeId) {
        archiveDatabase();
        installCartridge(zipPath);
        if (COLLATOR_MODE === 'cloud') {
            installOfficials(newMeta.camporeeId, getAuth(req).userId, newOfficials);
        }
        return res.redirect((req.baseUrl || '/collator') + '/admin.html');
    }

    // Case 2: Update Detected -> Ask User
    // Store officials list in temp file so confirm handler can use it
    if (COLLATOR_MODE === 'cloud') {
        fs.writeFileSync(
            path.join(UPLOAD_TEMP, 'pending_officials.json'),
            JSON.stringify({ uploadUserId: getAuth(req).userId, officials: newOfficials })
        );
    }
    fs.renameSync(zipPath, pendingPath);
    res.redirect((req.baseUrl || '/collator') + '/setup/conflict');
});

app.get('/setup/conflict', (req, res) => {
    const meta = getActiveMeta();
    const base = req.baseUrl || '/collator';
    res.send(`
        <html>
            <head><title>Update Detected</title><link rel="stylesheet" href="/css/bootstrap.min.css"></head>
            <body class="bg-dark text-light d-flex align-items-center justify-content-center vh-100">
                <div class="card bg-secondary text-white p-5 text-center">
                    <h2 class="text-warning">Update Detected</h2>
                    <p>Updating <strong>${meta.title}</strong>.</p>
                    <div class="d-grid gap-3">
                        <form action="${base}/api/setup/confirm" method="post">
                            <input type="hidden" name="action" value="update_keep">
                            <button class="btn btn-success btn-lg w-100">Update Config (Keep Scores)</button>
                        </form>
                        <form action="${base}/api/setup/confirm" method="post">
                            <input type="hidden" name="action" value="update_wipe">
                            <button class="btn btn-danger btn-lg w-100">Update & Reset Scores</button>
                        </form>
                        <a href="${base}/admin.html" class="btn btn-outline-light">Cancel</a>
                    </div>
                </div>
            </body>
        </html>
    `);
});

app.post('/api/setup/confirm', express.urlencoded({ extended: true }), (req, res) => {
    const action = req.body.action;
    const pendingPath = path.join(UPLOAD_TEMP, 'pending_update.zip');

    if (!fs.existsSync(pendingPath)) return res.redirect((req.baseUrl || '/collator') + '/setup');

    if (action === 'update_wipe') archiveDatabase();

    installCartridge(pendingPath);

    if (COLLATOR_MODE === 'cloud') {
        const pendingOfficialsPath = path.join(UPLOAD_TEMP, 'pending_officials.json');
        if (fs.existsSync(pendingOfficialsPath)) {
            try {
                const { uploadUserId, officials } = JSON.parse(fs.readFileSync(pendingOfficialsPath, 'utf8'));
                const meta = getActiveMeta();
                if (meta?.camporeeId) installOfficials(meta.camporeeId, uploadUserId, officials);
                fs.unlinkSync(pendingOfficialsPath);
            } catch (e) {
                console.error('[cloud] Failed to apply pending officials:', e.message);
            }
        }
    }

    res.redirect((req.baseUrl || '/collator') + '/admin.html');
});

// --- AUTH ROUTES ---

app.get('/api/auth/whoami', (req, res) => {
    if (COLLATOR_MODE === 'cloud') {
        const { userId } = getAuth(req);
        if (!userId) return res.json({ mode: 'cloud', authenticated: false });
        const meta = getActiveMeta();
        if (!meta?.camporeeId) return res.json({ mode: 'cloud', authenticated: true, authorized: false });
        const perm = db.prepare('SELECT role, display_name FROM event_permissions WHERE camporee_id = ? AND user_id = ?').get(meta.camporeeId, userId);
        if (!perm) return res.json({ mode: 'cloud', authenticated: true, authorized: false });
        return res.json({ mode: 'cloud', authenticated: true, authorized: true, role: perm.role, display_name: perm.display_name });
    } else {
        if (!req.session?.role) return res.json({ mode: 'offline', authenticated: false });
        return res.json({ mode: 'offline', authenticated: true, role: req.session.role, display_name: req.session.display_name, email: req.session.email });
    }
});

app.post('/api/auth/identify', express.json(), (req, res) => {
    if (COLLATOR_MODE !== 'offline') {
        return res.status(404).json({ error: 'Not available in cloud mode' });
    }

    const email = ((req.body && req.body.email) || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const manifestPath = path.join(ACTIVE_DIR, 'camporee.json');
    if (!fs.existsSync(manifestPath)) {
        return res.status(503).json({ error: 'No event loaded' });
    }

    let officials = [];
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        officials = manifest.officials || [];
    } catch {
        return res.status(500).json({ error: 'Failed to read event manifest' });
    }

    const match = officials.find(o => (o.email || '').toLowerCase().trim() === email);
    if (!match) {
        return res.status(403).json({ error: 'Not listed as an official for this event' });
    }

    req.session.role = match.role === 'director' ? 'director' : 'official';
    req.session.display_name = match.display_name || null;
    req.session.email = email;
    res.json({ display_name: match.display_name || null, role: req.session.role });
});

// --- CORE ROUTES ---

app.get('/', (req, res) => {
    const ua = req.headers['user-agent'] ? req.headers['user-agent'].toLowerCase() : '';
    const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|kindle|silk-accelerated|(hpw|web)os|opera m(obi|ini)/i.test(ua);

    if (isMobile) {
        res.redirect((req.baseUrl || '/collator') + '/judge.html');
    } else {
        res.redirect((req.baseUrl || '/collator') + '/admin.html');
    }
});

// 1. GET /games.json
app.get('/games.json', (req, res) => {
    const data = loadCamporeeData();

    // Strip history/snapshots from Judge view to save bandwidth
    if (data && Array.isArray(data.games)) {
        data.games.forEach(game => {
            delete game.source_snapshot;
            delete game.variants;
        });
    }

    res.json(data);
});

// 2. GET /api/entities
app.get('/api/entities', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM entities ORDER BY troop_number ASC, name ASC');
        res.json(stmt.all());
    } catch (err) {
        console.error('Error fetching entities:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/entities/:id', requireOfficial, (req, res) => {
    const { id } = req.params;
    const { manual_rank, name } = req.body;
    try {
        const existing = db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ error: 'Entity not found' });

        if (name !== undefined) {
            db.prepare('UPDATE entities SET name = ? WHERE id = ?').run(name, id);
            logAudit('entity_update', { entity_type: existing.type, entity_id: id, field_name: 'name', old_value: existing.name, new_value: name });
        }
        if (manual_rank !== undefined) {
            db.prepare('UPDATE entities SET manual_rank = ? WHERE id = ?').run(manual_rank, id);
            logAudit('entity_update', { entity_type: existing.type, entity_id: id, field_name: 'manual_rank', old_value: existing.manual_rank, new_value: manual_rank });
        }
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// 3. POST /api/score (SMART UPSERT)
app.post('/api/score', (req, res) => {
    let {
        uuid, game_id, entity_id, score_payload,
        timestamp, judge_name, judge_email, judge_unit
    } = req.body;

    if (!uuid || !game_id || !entity_id || !score_payload) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const transaction = db.transaction(() => {
            // 1. Handle Judge Information
            let judgeId = null;
            if (judge_email) {
                const getJudge = db.prepare('SELECT id, name, unit FROM judges WHERE email = ?');
                const existingJudge = getJudge.get(judge_email);

                if (existingJudge) {
                    judgeId = existingJudge.id;
                    // Update Judge info if it changed
                    if ((judge_name && existingJudge.name !== judge_name) ||
                        (judge_unit && existingJudge.unit !== judge_unit)) {
                        db.prepare('UPDATE judges SET name = ?, unit = ? WHERE id = ?')
                            .run(judge_name || existingJudge.name,
                                judge_unit || existingJudge.unit,
                                judgeId);
                    }
                } else if (judge_name) {
                    const insertJudge = db.prepare('INSERT INTO judges (name, email, unit) VALUES (?, ?, ?)');
                    const info = insertJudge.run(judge_name, judge_email, judge_unit || null);
                    judgeId = info.lastInsertRowid;
                }
            }

            // 2. CRITICAL LOGIC: Standard vs Bracket Mode
            // This prevents "Standard" games from accumulating duplicate scores
            const allGames = loadCamporeeData().games;
            const gameDef = allGames.find(g => g.id === game_id);
            const isBracket = gameDef ? gameDef.bracketMode : false;

            if (!isBracket) {
                // STANDARD MODE: Enforce Single Row (Update existing if found)
                const checkSql = 'SELECT uuid FROM scores WHERE game_id = ? AND entity_id = ?';
                const existing = db.prepare(checkSql).get(game_id, entity_id);

                if (existing) {
                    // Hijack the existing UUID to force an UPDATE instead of INSERT
                    uuid = existing.uuid;
                    console.log(`[Smart Upsert] Standard Game: Updating existing score ${uuid} for ${entity_id}`);
                }
            } else {
                console.log(`[Smart Upsert] Bracket Game: Accepting new score ${uuid} for ${entity_id}`);
            }

            // 3. Upsert Command (Using ON CONFLICT to handle updates)
            const insert = db.prepare(`
              INSERT INTO scores (uuid, game_id, entity_id, score_payload, timestamp, judge_id)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(uuid) DO UPDATE SET
                score_payload = excluded.score_payload,
                timestamp = excluded.timestamp,
                judge_id = excluded.judge_id
            `);

            return insert.run(
                uuid,
                game_id,
                entity_id,
                JSON.stringify(score_payload),
                timestamp,
                judgeId
            );
        });

        const result = transaction();
        const isUpdate = result && result.changes === 0; // ON CONFLICT path = 0 changes on insert attempt
        logAudit(isUpdate ? 'score_update' : 'score_create', { entity_type: 'patrol', entity_id, game_id, notes: `judge: ${judge_name || judge_email || 'unknown'}` });
        res.status(201).json({ status: 'success' });

    } catch (err) {
        console.error('Insert error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- EXHIBITION RESULTS ROUTES ---

app.get('/api/exhibition-results/:gameId', requireOfficial, (req, res) => {
    try {
        const rows = db.prepare(
            'SELECT * FROM exhibition_results WHERE game_id = ? ORDER BY sort_order ASC, id ASC'
        ).all(req.params.gameId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/exhibition-results/:gameId', requireOfficial, express.json(), (req, res) => {
    const { gameId } = req.params;
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Expected array' });

    try {
        db.transaction(() => {
            db.prepare('DELETE FROM exhibition_results WHERE game_id = ?').run(gameId);
            const insert = db.prepare(
                'INSERT INTO exhibition_results (game_id, scout_name, troop_number, patrol_name, overall_place, judges_notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            rows.forEach((row, i) => {
                insert.run(gameId, row.scout_name || '', row.troop_number || '', row.patrol_name || '', row.overall_place || '', row.judges_notes || '', i);
            });
        })();
        res.json({ status: 'ok', count: rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN & EXPORT ROUTES ---

app.get('/api/admin/all-data', requireOfficial, (req, res) => {
    try {
        const query = `
            SELECT
                s.uuid, s.game_id, s.entity_id, s.timestamp,
                e.name as entity_name, e.troop_number, e.type as entity_type,
                s.score_payload
            FROM scores s
            JOIN entities e ON s.entity_id = e.id
        `;
        const rows = db.prepare(query).all();

        const parsed = rows.map(r => ({
            ...r,
            score_payload: JSON.parse(r.score_payload)
        }));

        const stats = {};
        parsed.forEach(r => {
            stats[r.game_id] = (stats[r.game_id] || 0) + 1;
        });

        const statusMap = {};
        const statuses = db.prepare('SELECT * FROM game_status').all();
        for (const s of statuses) {
            statusMap[s.game_id] = s.status;
        }

        res.json({
            scores: parsed,
            stats,
            game_status: statusMap,
            metadata: getActiveMeta()
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- BRACKET SYNC ---
app.post('/api/bracket/sync', requireOfficial, (req, res) => {
    const { game_id, bracket_data } = req.body;
    if (!game_id || !bracket_data) {
        return res.status(400).json({ error: 'Missing game_id or bracket_data' });
    }

    try {
        const allGames = loadCamporeeData().games;
        const gameDef = allGames.find(g => g.id === game_id);
        const timeFields = (gameDef?.fields || []).filter(f => f.type === 'timed' || f.type === 'stopwatch').map(f => f.id);
        const scoreFields = (gameDef?.fields || []).filter(f => f.type === 'number').map(f => f.id);

        db.transaction(() => {
            // 0. Ensure game_status entry exists to satisfy foreign key (it may naturally be 'active' if not yet managed)
            db.prepare(`
                INSERT INTO game_status (game_id, status) VALUES (?, 'active')
                ON CONFLICT(game_id) DO NOTHING
            `).run(game_id);

            // Merge Main and Consolation rounds into one processing list
            const allRounds = [
                ...(bracket_data.rounds || []),
                ...(bracket_data.consolation_rounds || [])
            ];

            allRounds.forEach((round, rIdx) => {
                (round.heats || []).forEach((heat, hIdx) => {
                    // 1. Upsert Match
                    db.prepare(`
                        INSERT INTO Matches (id, tournament_id, round_num, match_num, status)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET status=excluded.status
                    `).run(heat.id, game_id, rIdx, hIdx, heat.complete ? 'complete' : 'active');

                    // 2. Upsert Participants
                    Object.entries(heat.results || {}).forEach(([eid, result]) => {
                        let score_value = null;
                        let time_value = null;

                        timeFields.forEach(fid => {
                            if (result[fid]) time_value = timeToSeconds(result[fid]);
                        });
                        scoreFields.forEach(fid => {
                            if (result[fid]) score_value = parseFloat(result[fid]) || 0;
                        });

                        db.prepare(`
                            INSERT INTO Match_Participants (match_id, entity_id, score_value, time_value)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(match_id, entity_id) DO UPDATE SET
                                score_value=excluded.score_value,
                                time_value=excluded.time_value
                        `).run(heat.id, eid, score_value, time_value);

                        // If it's the final round and they have a rank, update Event_Standings
                        if (round.isFinalRound && result.rank) {
                            db.prepare(`
                                INSERT INTO Event_Standings (tournament_id, entity_id, computed_rank, status)
                                VALUES (?, ?, ?, ?)
                                ON CONFLICT(tournament_id, entity_id) DO UPDATE SET
                                    computed_rank=excluded.computed_rank,
                                    status=excluded.status
                            `).run(game_id, eid, parseInt(result.rank), 'placed');
                        }
                    });
                });
            });
        })();

        updateStandings(game_id);
        res.json({ success: true });
    } catch (err) {
        console.error("Bracket Sync Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/judges', requireOfficial, (req, res) => {
    try {
        const judges = db.prepare('SELECT * FROM judges').all();
        const scores = db.prepare('SELECT judge_id, game_id FROM scores WHERE judge_id IS NOT NULL').all();

        const stats = {};
        scores.forEach(s => {
            if (!stats[s.judge_id]) {
                stats[s.judge_id] = { count: 0, games: new Set() };
            }
            stats[s.judge_id].count++;
            stats[s.judge_id].games.add(s.game_id);
        });

        const result = judges.map(j => {
            const s = stats[j.id] || { count: 0, games: new Set() };
            return {
                ...j,
                score_count: s.count,
                games_judged: Array.from(s.games).sort()
            };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/export', requireOfficial, (req, res) => {
    try {
        const query = `
            SELECT
                s.uuid, s.game_id, s.entity_id, s.timestamp,
                e.name as entity_name, e.troop_number, e.type as entity_type,
                s.score_payload
            FROM scores s
            JOIN entities e ON s.entity_id = e.id
            ORDER BY s.timestamp DESC
        `;
        const rows = db.prepare(query).all();

        if (rows.length === 0) return res.send("No scores to export.");

        const fieldSet = new Set();
        const parsedRows = rows.map(r => {
            const payload = JSON.parse(r.score_payload);
            Object.keys(payload).forEach(k => fieldSet.add(k));
            return { ...r, payload };
        });

        const dynamicFields = Array.from(fieldSet).sort();
        const headers = ['UUID', 'Game ID', 'Timestamp', 'Troop', 'Entity Name', 'Entity Type', ...dynamicFields];

        let csv = headers.join(',') + '\n';

        parsedRows.forEach(r => {
            const line = [
                r.uuid,
                r.game_id,
                new Date(r.timestamp).toISOString(),
                r.troop_number,
                `"${r.entity_name}"`,
                r.entity_type,
                ...dynamicFields.map(f => {
                    const val = r.payload[f];
                    return (val === undefined || val === null) ? '' : `"${String(val).replace(/"/g, '""')}"`;
                })
            ];
            csv += line.join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=camporee_scores.csv');
        res.send(csv);

    } catch (err) {
        res.status(500).send('Error generating export');
    }
});

app.post('/api/admin/game-status', requireOfficial, (req, res) => {
    const { game_id, status } = req.body;
    try {
        const query = `
            INSERT INTO game_status (game_id, status) VALUES (?, ?)
            ON CONFLICT(game_id) DO UPDATE SET status=excluded.status
        `;
        db.prepare(query).run(game_id, status);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/meta/theme-colors', requireOfficial, (req, res) => {
    const { main, header, accent } = req.body || {};
    const manifestPath = path.join(ACTIVE_DIR, 'camporee.json');
    if (!fs.existsSync(manifestPath)) {
        return res.status(404).json({ error: 'No active event loaded' });
    }
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest.meta) manifest.meta = {};
        manifest.meta.theme_colors = { main, header, accent };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        res.json({ ok: true, theme_colors: manifest.meta.theme_colors });
    } catch (err) {
        console.error('Error saving theme colors:', err);
        res.status(500).json({ error: 'Failed to save theme colors' });
    }
});

app.delete('/api/admin/scores', requireOfficial, (req, res) => {
    try {
        db.transaction(() => {
            // Delete in order to satisfy foreign key constraints
            db.prepare('DELETE FROM Match_Participants').run();
            db.prepare('DELETE FROM Matches').run();
            db.prepare('DELETE FROM Event_Standings').run();
            db.prepare('DELETE FROM scores').run();
            db.prepare('DELETE FROM judges').run();
            db.prepare('DELETE FROM game_status').run();
        })();
        res.json({
            success: true,
            message: 'All scores and bracket data cleared.'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/full-reset', requireOfficial, (req, res) => {
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM Match_Participants').run();
            db.prepare('DELETE FROM Matches').run();
            db.prepare('DELETE FROM Event_Standings').run();
            db.prepare('DELETE FROM scores').run();
            db.prepare('DELETE FROM entities').run();
            db.prepare('DELETE FROM judges').run();
            db.prepare('DELETE FROM game_status').run();
        })();
        res.json({ success: true, message: 'Everything deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/awards-config', requireOfficial, express.json(), (req, res) => {
    const { awards_config } = req.body;
    const manifestPath = path.join(ACTIVE_DIR, 'camporee.json');

    if (!fs.existsSync(manifestPath)) {
        return res.status(404).json({ error: 'Camporee manifest not found' });
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest.meta) manifest.meta = {};

        manifest.meta.awards_config = awards_config;

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving awards config:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/scores/:uuid', requireOfficial, (req, res) => {
    const { uuid } = req.params;
    const { score_payload } = req.body;

    if (!score_payload) {
        return res.status(400).json({ error: 'Missing score_payload' });
    }

    try {
        const existing = db.prepare('SELECT * FROM scores WHERE uuid = ?').get(uuid);
        const update = db.prepare('UPDATE scores SET score_payload = ? WHERE uuid = ?');
        const info = update.run(JSON.stringify(score_payload), uuid);

        if (info.changes === 0) {
            return res.status(404).json({ error: 'Score not found' });
        }

        // Log each changed field individually
        if (existing) {
            const oldPayload = JSON.parse(existing.score_payload);
            for (const [field, newVal] of Object.entries(score_payload)) {
                if (String(oldPayload[field] ?? '') !== String(newVal ?? '')) {
                    logAudit('score_update', {
                        entity_id: existing.entity_id,
                        game_id: existing.game_id,
                        field_name: field,
                        old_value: oldPayload[field],
                        new_value: newVal
                    });
                }
            }
        }

        res.json({ status: 'updated' });

    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/entities', (req, res) => {
    const { name, type, troop_number, parent_id } = req.body;

    if (!name || !type || !troop_number) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        const id = getNextEntityId(type);
        const insert = db.prepare(
            'INSERT INTO entities (id, name, type, troop_number, parent_id) VALUES (?, ?, ?, ?, ?)'
        );
        insert.run(id, name, type, troop_number, parent_id || null);
        logAudit('entity_create', { entity_type: type, entity_id: id, notes: `${name} / T${troop_number}` });

        res.json({
            id,
            name,
            type,
            troop_number,
            parent_id: parent_id || null
        });

    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/scores/close-game', (req, res) => {
    const { game_id, judge_id, score_count, closed_at } = req.body || {};
    if (!game_id) return res.status(400).json({ error: 'game_id required' });

    try {
        db.prepare(`
            INSERT INTO game_closures (game_id, judge_id, score_count, closed_at)
            VALUES (?, ?, ?, ?)
        `).run(game_id, judge_id || null, score_count || 0, closed_at || new Date().toISOString());

        res.json({ received: true, message: 'Scores confirmed. Thank you!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- OFFICIAL GAME FLAGS (DQ) ---

app.put('/api/official/flags/:gameId/:entityId', requireOfficial, (req, res) => {
    const { gameId, entityId } = req.params;
    const { dq = 0, reason = '' } = req.body;
    try {
        const existing = db.prepare('SELECT * FROM official_game_flags WHERE entity_id = ? AND game_id = ?').get(entityId, gameId);
        db.prepare(`
            INSERT INTO official_game_flags (entity_id, game_id, dq, reason, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(entity_id, game_id) DO UPDATE SET
                dq = excluded.dq,
                reason = excluded.reason,
                updated_at = excluded.updated_at
        `).run(entityId, gameId, dq ? 1 : 0, reason || '');
        logAudit(dq ? 'dq_set' : 'dq_cleared', {
            entity_id: entityId,
            game_id: gameId,
            field_name: 'dq',
            old_value: existing ? existing.dq : 0,
            new_value: dq ? 1 : 0,
            notes: reason || ''
        });
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/official/flags', requireOfficial, (req, res) => {
    try {
        const flags = db.prepare('SELECT * FROM official_game_flags WHERE dq = 1 ORDER BY updated_at DESC').all();
        res.json(flags);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUDIT LOG ---

app.get('/api/audit', requireOfficial, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const entity_id = req.query.entity_id || null;
    const game_id = req.query.game_id || null;
    try {
        let sql = 'SELECT * FROM audit_log';
        const params = [];
        const conditions = [];
        if (entity_id) { conditions.push('entity_id = ?'); params.push(entity_id); }
        if (game_id) { conditions.push('game_id = ?'); params.push(game_id); }
        if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY id DESC LIMIT ?';
        params.push(limit);
        res.json(db.prepare(sql).all(...params));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default app;