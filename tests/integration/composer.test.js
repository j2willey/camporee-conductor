import { test, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class MockGoogleGenAI {
            constructor() {
                this.models = {
                    generateContent: async () => ({
                        text: '```json\n{"action": "Action!", "lore": "Lore!", "skill": "Skill!"}\n```'
                    })
                };
            }
        }
    };
});

// Set environment variables before the app is imported
process.env.GEMINI_API_KEY = 'test-key';
process.env.WORKSPACE_PATH = '/tmp/composer_test_workspace'; // Prevent messing with real data

const { default: app } = await import('../../src/servers/composer.js');

test('POST /api/ai/brainstorm-theme returns JSON from Gemini', async () => {
    const response = await request(app)
        .post('/api/ai/brainstorm-theme')
        .send({ theme: 'Test Theme', instruction: 'Make it fun' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
        action: 'Action!',
        lore: 'Lore!',
        skill: 'Skill!'
    });
});

test('POST /api/ai/theme-game returns themed JSON from Gemini', async () => {
    const payload = {
        camporeeContext: 'Test Camporee',
        gameJson: { game_title: 'Generic Game', content: {} },
        instruction: 'Theme this game'
    };

    const response = await request(app)
        .post('/api/ai/theme-game')
        .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
        action: 'Action!',
        lore: 'Lore!',
        skill: 'Skill!'
    });
});
