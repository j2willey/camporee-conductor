import { test, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('better-sqlite3', () => {
    return {
        default: class MockDatabase {
            constructor() { }
            exec() { }
            prepare() {
                return {
                    all: () => [],
                    run: () => { }
                };
            }
            transaction(cb) {
                return () => cb();
            }
        }
    };
});

// Mock fs to prevent reading/writing real library/active files
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn().mockImplementation((path, enc) => {
            if (path.includes('camporee.json')) {
                return JSON.stringify({
                    games: [
                        {
                            id: 'p1',
                            title: 'Active Game',
                            source_snapshot: { content: { story: 'secret text' } },
                            variants: [{ title: 'secret variant' }]
                        }
                    ]
                });
            }
            return '{}';
        }),
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn()
    };
});

// Now import after mocks are setup
const { default: app } = await import('../../src/servers/collator.js');

test('GET /games.json strips source_snapshot and variants for judge payload', async () => {
    const response = await request(app).get('/games.json');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('games');
    expect(response.body.games.length).toBeGreaterThan(0);

    const game = response.body.games[0];

    // Core sanitization checks!
    expect(game.source_snapshot).toBeUndefined();
    expect(game.variants).toBeUndefined();
});
