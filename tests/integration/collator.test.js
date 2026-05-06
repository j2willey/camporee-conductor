import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// --- Temp directory fixture setup ---
// collator.js reads ACTIVE_DIR from process.env.EVENT_PATH, so we point it at a temp dir.

let tempDir;

function setupTempEvent() {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collator-test-'));
    const gamesDir = path.join(tempDir, 'games');
    fs.mkdirSync(gamesDir);

    fs.writeFileSync(path.join(tempDir, 'camporee.json'), JSON.stringify({
        meta: { title: 'Test Camporee', theme: 'Test Theme', camporeeId: 'test-uuid' },
        playlist: [{ gameId: 'p1', enabled: true, order: 1 }],
        type_defaults: {
            patrol: { prefix: ['p_flag'], suffix: ['off_score'] }
        }
    }));

    fs.writeFileSync(path.join(tempDir, 'presets.json'), JSON.stringify([
        { id: 'p_flag', label: 'Patrol Flag', type: 'number', kind: 'points', weight: 10, audience: 'judge', position: 'prefix', sortOrder: 10, config: { min: 0, max: 10, placeholder: '0-10 Points' } },
        { id: 'off_score', label: 'Official Score', type: 'number', kind: 'points', weight: 1, audience: 'admin', position: 'suffix', sortOrder: 30, config: { placeholder: 'Final Points' } }
    ]));

    fs.writeFileSync(path.join(gamesDir, 'p1.json'), JSON.stringify({
        library_uuid: '',
        library_title: 'Knot Tying',
        game_title: 'Knot Tying',
        id: 'p1',
        type: 'patrol',
        content: { title: 'Knot Tying', description: 'Tie the knots.' },
        scoring_model: {
            inputs: [
                { id: 'knots', label: 'Knots Tied', type: 'number', kind: 'points', weight: 2, audience: 'judge', config: { min: 0, max: 20 } }
            ]
        },
        source_snapshot: { content: { story: 'secret text' } },
        variants: [{ title: 'secret variant' }]
    }));
}

// Set EVENT_PATH before importing collator so its top-level const picks it up
setupTempEvent();
process.env.EVENT_PATH = tempDir;

vi.mock('better-sqlite3', () => {
    return {
        default: class MockDatabase {
            constructor() { }
            exec() { }
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

const { default: app } = await import('../../src/servers/collator.js');

afterAll(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('GET /games.json strips source_snapshot and variants from judge payload', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('games');
    expect(response.body.games.length).toBe(1);

    const game = response.body.games[0];
    expect(game.source_snapshot).toBeUndefined();
    expect(game.variants).toBeUndefined();
});

test('GET /games.json injects prefix common fields before game-specific fields', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);
    const game = response.body.games[0];
    expect(Array.isArray(game.fields)).toBe(true);

    // p_flag is prefix → first
    expect(game.fields[0].id).toBe('p_flag');
    // game-specific field second
    expect(game.fields[1].id).toBe('knots');
    // off_score is suffix → last
    expect(game.fields[2].id).toBe('off_score');
});

test('GET /games.json common fields have config spread to root level', async () => {
    const response = await request(app).get('/games.json');

    const fields = response.body.games[0].fields;
    const flagField = fields.find(f => f.id === 'p_flag');

    expect(flagField).toBeDefined();
    expect(flagField.min).toBe(0);
    expect(flagField.max).toBe(10);
    expect(flagField.audience).toBe('judge');
    expect(flagField.kind).toBe('points');
});

test('GET /games.json returns metadata from manifest', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);
    expect(response.body.metadata).toBeDefined();
    expect(response.body.metadata.title).toBe('Test Camporee');
});

test('GET /api/entities returns an array', async () => {
    const response = await request(app).get('/api/entities');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
});
