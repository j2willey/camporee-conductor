import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';

const LIBRARY_PATH = process.env.LIBRARY_PATH || path.join(process.cwd(), 'data', 'library');
const TEMPLATES_DIR = path.join(LIBRARY_PATH, 'templates');
const CACHE_DIR     = path.join(LIBRARY_PATH, 'cache');
const CATALOG_PATH  = path.join(TEMPLATES_DIR, 'template-catalog.json');

const LRU_MAX = 20;
// templateId -> last-access timestamp (ms). Tracks what is currently cached on disk.
const lruMap = new Map();

// ── Directory helpers ──────────────────────────────────────────────────────────

function ensureDirs() {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    fs.mkdirSync(CACHE_DIR,     { recursive: true });
}

// ── LRU helpers ────────────────────────────────────────────────────────────────

function touchLru(id) {
    lruMap.set(id, Date.now());
}

function evictLruIfNeeded() {
    if (lruMap.size < LRU_MAX) return;
    let oldest = null;
    let oldestTs = Infinity;
    for (const [id, ts] of lruMap) {
        if (ts < oldestTs) { oldestTs = ts; oldest = id; }
    }
    if (oldest) _deleteFromCache(oldest);
}

function _deleteFromCache(id) {
    const dir = path.join(CACHE_DIR, id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    lruMap.delete(id);
}

// ── Catalog helpers ────────────────────────────────────────────────────────────

function readCatalog() {
    try { return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')); }
    catch { return []; }
}

function writeCatalog(entries) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(entries, null, 2));
}

// ── Token extraction ───────────────────────────────────────────────────────────

function extractTokens(content) {
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return [...new Set([...str.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]))];
}

// ── Cache helpers ──────────────────────────────────────────────────────────────

function zipPath(id)   { return path.join(TEMPLATES_DIR, `${id}.zip`); }
function cachePath(id) { return path.join(CACHE_DIR, id); }

function notFound(id) {
    const err = new Error(`Template not found: ${id}`);
    err.status = 404;
    return err;
}

function unpackToCache(id) {
    const zp = zipPath(id);
    if (!fs.existsSync(zp)) throw notFound(id);
    evictLruIfNeeded();
    const dir = cachePath(id);
    fs.mkdirSync(dir, { recursive: true });
    new AdmZip(zp).extractAllTo(dir, true);
    touchLru(id);
    return dir;
}

function ensureCached(id) {
    const dir = cachePath(id);
    if (fs.existsSync(path.join(dir, 'camporee.json'))) {
        touchLru(id);
        return dir;
    }
    return unpackToCache(id);
}

// ── Startup: clear stale cache from any previous run ─────────────────────────

ensureDirs();
clearCache();

// ── Game library (thin wrappers over existing behavior) ───────────────────────

export function listGames() {
    try { return JSON.parse(fs.readFileSync(path.join(LIBRARY_PATH, 'library-catalog.json'), 'utf8')); }
    catch { return []; }
}

export function getGame(gamePath) {
    return JSON.parse(fs.readFileSync(path.join(LIBRARY_PATH, gamePath), 'utf8'));
}

// ── Template library ──────────────────────────────────────────────────────────

export function listTemplates() {
    return readCatalog();
}

export function getTemplateMeta(id) {
    const dir = ensureCached(id);
    const camporee = JSON.parse(fs.readFileSync(path.join(dir, 'camporee.json'), 'utf8'));

    const gamesDir = path.join(dir, 'games');
    const games = fs.existsSync(gamesDir)
        ? fs.readdirSync(gamesDir)
              .filter(f => f.endsWith('.json'))
              .map(f => { try { return JSON.parse(fs.readFileSync(path.join(gamesDir, f), 'utf8')); } catch { return null; } })
              .filter(Boolean)
        : [];

    const tokens = extractTokens(JSON.stringify(camporee) + JSON.stringify(games));
    return { id, camporee, games, tokens };
}

export function getTemplateZip(id) {
    const zp = zipPath(id);
    if (!fs.existsSync(zp)) throw notFound(id);
    return fs.readFileSync(zp);
}

export function submit(zipBuffer, submittedBy) {
    ensureDirs();

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const camporeeEntry = entries.find(e => e.entryName === 'camporee.json');
    if (!camporeeEntry) {
        const err = new Error('Invalid cartridge: camporee.json not found at zip root');
        err.status = 400;
        throw err;
    }

    const camporee = JSON.parse(camporeeEntry.getData().toString('utf8'));
    const meta = camporee.meta || {};
    const gameCount = entries.filter(e => e.entryName.startsWith('games/') && e.entryName.endsWith('.json')).length;

    const id = randomUUID();
    fs.writeFileSync(zipPath(id), zipBuffer);

    const entry = {
        id,
        title:       meta.title  || 'Untitled',
        theme:       meta.theme  || '',
        year:        meta.year   || null,
        gameCount,
        submittedBy,
        submittedAt: new Date().toISOString(),
    };
    const catalog = readCatalog();
    catalog.push(entry);
    writeCatalog(catalog);

    return { id };
}

export function invalidateCache(id) {
    _deleteFromCache(id);
}

export function clearCache() {
    ensureDirs();
    for (const entry of fs.readdirSync(CACHE_DIR)) {
        fs.rmSync(path.join(CACHE_DIR, entry), { recursive: true, force: true });
    }
    lruMap.clear();
}
