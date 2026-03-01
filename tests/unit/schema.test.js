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

    // Verify properties
    expect(normalized.game_title).toBeUndefined(); // It uses content.title or base_title eventually in the UI
    expect(normalized.content.title).toBe("Dragon Breath Sparks");

    // Verify source_snapshot was created since it had a library_uuid
    expect(normalized.source_snapshot).toBeDefined();
    expect(normalized.source_snapshot.content.story).toBe("A generic fire story.");
});
