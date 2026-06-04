import { test, expect } from 'vitest';
import { normalizeGameDefinition, FIELD_TYPES } from '../../public/js/core/schema.js';

test('normalizeGameDefinition adds source_snapshot for library imports', () => {
    const rawGame = {
        library_uuid: "123e4567-e89b-12d3-a456-426614174000",
        library_title: "Fire Building",
        title: "Dragon Breath Sparks",
        content: {
            story: "A generic fire story."
        },
        scoring_model: {
            inputs: []
        }
    };

    const normalized = normalizeGameDefinition(rawGame);

    expect(normalized.content.title).toBe("Dragon Breath Sparks");
    expect(normalized.source_snapshot).toBeDefined();
    expect(normalized.source_snapshot.content.story).toBe("A generic fire story.");
});

// --- Regression guards for kind/audience/config preservation ---

test('normalizeGameDefinition preserves kind from scoring_model.inputs', () => {
    const game = {
        library_uuid: '',
        library_title: 'Test',
        league: 'patrol-games',
        content: { title: 'Test' },
        scoring_model: {
            inputs: [
                { id: 'pts', label: 'Points', type: 'number', kind: 'points', weight: 5, config: { min: 0, max: 10 } },
                { id: 'pen', label: 'Penalty', type: 'number', kind: 'penalty', weight: 1, config: { min: 0, max: 20 } },
                { id: 'met', label: 'Time', type: 'timer', kind: 'metric', weight: 1, config: {} }
            ]
        }
    };

    const normalized = normalizeGameDefinition(game);
    const fields = normalized.fields;

    expect(fields[0].kind).toBe('points');
    expect(fields[1].kind).toBe('penalty');
    expect(fields[2].kind).toBe('metric'); // timer → metric, overrides kind
});

test('normalizeGameDefinition preserves audience from scoring_model.inputs', () => {
    const game = {
        library_uuid: '',
        library_title: 'Test',
        league: 'patrol-games',
        content: { title: 'Test' },
        scoring_model: {
            inputs: [
                { id: 'judge_field', label: 'Judge Input', type: 'number', kind: 'points', weight: 1, audience: 'judge', config: { min: 0, max: 10 } },
                { id: 'admin_field', label: 'Official Score', type: 'number', kind: 'points', weight: 1, audience: 'admin', config: {} }
            ]
        }
    };

    const normalized = normalizeGameDefinition(game);
    const fields = normalized.fields;

    expect(fields[0].audience).toBe('judge');
    expect(fields[1].audience).toBe('admin');
});

test('normalizeGameDefinition reads config from nested config object', () => {
    const game = {
        library_uuid: '',
        library_title: 'Test',
        league: 'patrol-games',
        content: { title: 'Test' },
        scoring_model: {
            inputs: [
                {
                    id: 'score',
                    label: 'Score',
                    type: 'number',
                    kind: 'points',
                    weight: 1,
                    config: { min: 1, max: 50, placeholder: '1-50 pts' }
                }
            ]
        }
    };

    const normalized = normalizeGameDefinition(game);
    const field = normalized.fields[0];

    // Config values spread to root
    expect(field.min).toBe(1);
    expect(field.max).toBe(50);
    expect(field.placeholder).toBe('1-50 pts');
});

test('normalizeGameDefinition preserves options array for select fields', () => {
    const game = {
        library_uuid: '',
        library_title: 'Test',
        league: 'patrol-games',
        content: { title: 'Test' },
        scoring_model: {
            inputs: [
                {
                    id: 'rank',
                    label: 'Ranking',
                    type: 'select',
                    kind: 'info',
                    weight: 0,
                    audience: 'admin',
                    config: { options: ['1st Place', '2nd Place', '3rd Place', 'Participant'] }
                }
            ]
        }
    };

    const normalized = normalizeGameDefinition(game);
    const field = normalized.fields[0];

    expect(field.options).toEqual(['1st Place', '2nd Place', '3rd Place', 'Participant']);
    expect(field.kind).toBe('info');
    expect(field.audience).toBe('admin');
});

test('normalizeGameDefinition defaults audience to judge when absent', () => {
    const game = {
        library_uuid: '',
        library_title: 'Test',
        league: 'patrol-games',
        content: { title: 'Test' },
        scoring_model: {
            inputs: [
                { id: 'f1', label: 'Field', type: 'number', kind: 'points', weight: 1, config: { min: 0, max: 10 } }
            ]
        }
    };

    const normalized = normalizeGameDefinition(game);
    expect(normalized.fields[0].audience).toBe('judge');
});

test('normalizeGameDefinition defaults kind to points when absent', () => {
    const game = {
        library_uuid: '',
        library_title: 'Test',
        league: 'patrol-games',
        content: { title: 'Test' },
        scoring_model: {
            inputs: [
                { id: 'f1', label: 'Field', type: 'number', weight: 1, config: { min: 0, max: 10 } }
            ]
        }
    };

    const normalized = normalizeGameDefinition(game);
    expect(normalized.fields[0].kind).toBe('points');
});
