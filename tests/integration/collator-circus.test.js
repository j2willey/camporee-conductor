/**
 * Integration tests for the Collator using the real Circus Camporee workspace
 * (5d5a6a80-c9e1-4551-8e15-8ef1ca93b9ca).
 *
 * This file is intentionally separate from collator.test.js because both
 * files must set process.env.EVENT_PATH and import collator.js at module level,
 * and Vitest runs each file in its own worker.
 */

import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

// ---------------------------------------------------------------------------
// Paths to the real Circus workspace
// ---------------------------------------------------------------------------
const WORKSPACE_DIR = '/home/jwilley/ws/camporee-conductor/data/composer/workspaces/5d5a6a80-c9e1-4551-8e15-8ef1ca93b9ca';

// The default type_defaults that Composer would inject into the exported zip
// (matches DEFAULT_TYPE_DEFAULTS in public/js/apps/composer.js — v3.0 league id keys)
const TYPE_DEFAULTS = {
    'patrol-games': {
        prefix: ['p_flag', 'p_yell', 'p_spirit', 'ten_ess'],
        suffix: ['unscout', 'off_notes', 'off_score', 'final_rank', 'overall_points']
    },
    'exhibition': {
        prefix: [],
        suffix: ['off_score', 'final_rank', 'overall_points']
    },
    'troop-challenges': {
        prefix: [],
        suffix: ['off_score', 'final_rank', 'overall_points']
    }
};

// ---------------------------------------------------------------------------
// Build an in-memory zip identical to what Composer would export
// ---------------------------------------------------------------------------
function buildCircusZip() {
    const zip = new AdmZip();

    // camporee.json — add type_defaults just as the Composer export does
    const camporeeRaw = JSON.parse(
        fs.readFileSync(path.join(WORKSPACE_DIR, 'camporee.json'), 'utf8')
    );
    const camporeeConfig = {
        schemaVersion: '3.0',
        meta: camporeeRaw.meta,
        terminology: camporeeRaw.terminology,
        leagues: camporeeRaw.leagues,
        sessions: camporeeRaw.sessions,
        rosters: camporeeRaw.rosters,
        officials: camporeeRaw.officials || [],
        playlist: camporeeRaw.playlist,
        type_defaults: TYPE_DEFAULTS
    };
    zip.addFile('camporee.json', Buffer.from(JSON.stringify(camporeeConfig, null, 2), 'utf8'));

    // presets.json
    const presetsRaw = fs.readFileSync(path.join(WORKSPACE_DIR, 'presets.json'), 'utf8');
    zip.addFile('presets.json', Buffer.from(presetsRaw, 'utf8'));

    // games/*.json
    const gamesDir = path.join(WORKSPACE_DIR, 'games');
    const gameFiles = fs.readdirSync(gamesDir).filter(f => f.endsWith('.json'));
    gameFiles.forEach(filename => {
        const content = fs.readFileSync(path.join(gamesDir, filename), 'utf8');
        zip.addFile(`games/${filename}`, Buffer.from(content, 'utf8'));
    });

    return zip.toBuffer();
}

// ---------------------------------------------------------------------------
// Temp dir setup — must happen BEFORE importing the collator
// ---------------------------------------------------------------------------
let tempDir;

function setupTempEventDir() {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collator-circus-test-'));
    // The collator needs ACTIVE_DIR to exist at startup; it creates it if missing.
    // We point EVENT_PATH at a fresh empty dir so there is no pre-existing event.
    return tempDir;
}

setupTempEventDir();
process.env.EVENT_PATH = tempDir;

// ---------------------------------------------------------------------------
// Mock better-sqlite3 (same pattern as collator.test.js)
// ---------------------------------------------------------------------------
vi.mock('better-sqlite3', () => {
    return {
        default: class MockDatabase {
            constructor() {}
            exec() {}
            prepare() {
                return {
                    all: () => [],
                    get: () => null,
                    run: () => ({ lastInsertRowid: 1 })
                };
            }
            transaction(cb) {
                return (...args) => cb(...args);
            }
        }
    };
});

// ---------------------------------------------------------------------------
// Import collator AFTER environment is configured
// ---------------------------------------------------------------------------
const { default: app } = await import('../../src/servers/collator.js');

afterAll(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test 1: Upload the Circus cartridge
// ---------------------------------------------------------------------------
test('POST /api/setup/upload installs the Circus cartridge and redirects to admin', async () => {
    const zipBuffer = buildCircusZip();

    const response = await request(app)
        .post('/api/setup/upload')
        .attach('configZip', zipBuffer, {
            filename: 'CamporeeConfig.zip',
            contentType: 'application/zip'
        });

    // Should redirect to /collator/admin.html after a successful fresh install
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/collator/admin.html');
});

// ---------------------------------------------------------------------------
// Test 2: GET /games.json — 19 games loaded, correct metadata
// ---------------------------------------------------------------------------
test('GET /games.json returns all 34 Circus games with correct metadata', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('games');
    expect(response.body.games).toHaveLength(34);

    expect(response.body.metadata).toBeDefined();
    expect(response.body.metadata.title).toBe('Coyote Creek District Camporee 2026');
});

// ---------------------------------------------------------------------------
// Test 3: No game exposes source_snapshot or variants
// ---------------------------------------------------------------------------
test('GET /games.json strips source_snapshot and variants from all games', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);
    for (const game of response.body.games) {
        expect(game.source_snapshot).toBeUndefined();
        expect(game.variants).toBeUndefined();
    }
});

// ---------------------------------------------------------------------------
// Test 4: patrol game 'the-high-wire-fire-act' has fields with common fields injected
// ---------------------------------------------------------------------------
test('GET /games.json — the-high-wire-fire-act has fields array with common prefix fields', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);

    const game = response.body.games.find(g => g.id === 'the-high-wire-fire-act');
    expect(game).toBeDefined();
    expect(Array.isArray(game.fields)).toBe(true);
    expect(game.fields.length).toBeGreaterThan(0);

    // p_flag is the first prefix preset — must be the first field
    expect(game.fields[0].id).toBe('p_flag');
});

// ---------------------------------------------------------------------------
// Test 5: Exhibition game 'slack-lining' has league === 'exhibition'
// ---------------------------------------------------------------------------
test('GET /games.json — slack-lining has league exhibition', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);

    const game = response.body.games.find(g => g.id === 'slack-lining');
    expect(game).toBeDefined();
    expect(game.league).toBe('exhibition');
});

// ---------------------------------------------------------------------------
// Test 6: All patrol-games league games have at least one prefix preset field (p_flag)
// ---------------------------------------------------------------------------
test('GET /games.json — all patrol-games have p_flag injected as first field', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);

    const patrolGames = response.body.games.filter(g => g.league === 'patrol-games');
    expect(patrolGames.length).toBeGreaterThan(0);

    for (const game of patrolGames) {
        expect(Array.isArray(game.fields)).toBe(true);
        const prefixField = game.fields.find(f => f.id === 'p_flag');
        expect(prefixField).toBeDefined();
        // p_flag should be the very first field
        expect(game.fields[0].id).toBe('p_flag');
    }
});

// ---------------------------------------------------------------------------
// Test 7: POST /api/score accepts a valid score payload
// ---------------------------------------------------------------------------
test('POST /api/score with valid payload returns 201 success', async () => {
    const payload = {
        uuid: 'test-circus-uuid-001',
        game_id: 'the-high-wire-fire-act',
        entity_id: 'p4300',
        score_payload: { p_flag: 4, base_time: '02:30', matches_used: 1 },
        timestamp: Date.now(),
        judge_name: 'Test Judge',
        judge_email: 'testjudge@example.com',
        judge_unit: 'Troop 42'
    };

    const response = await request(app)
        .post('/api/score')
        .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('success');
});

// ---------------------------------------------------------------------------
// Test 8: GET /api/entities returns an array (may be empty with mocked DB)
// ---------------------------------------------------------------------------
test('GET /api/entities returns 200 and an array', async () => {
    const response = await request(app).get('/api/entities');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
});
