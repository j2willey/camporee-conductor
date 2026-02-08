/**
 * Core Schema Definitions for Camporee Conductor
 * Shared between Server (Node.js) and Client (Browser)
 */

export const FIELD_TYPES = {
    TEXT: 'text',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    TIMED: 'timed',
    STOPWATCH: 'stopwatch',
    SELECT: 'select',
    RANGE: 'range',
    TEXTAREA: 'textarea'
};

/**
 * Normalizes a raw game definition (from JSON or Composer) into a runtime-ready object.
 * Handles the translation of Composer 'components' to Runtime 'fields'.
 *
 * @param {Object} gameDef - The raw game definition object loaded from disk/network.
 * @param {number} [playlistOrder=0] - The sort order from the playlist manifest.
 * @returns {Object} The normalized game object.
 */
export function normalizeGameDefinition(gameDef, playlistOrder = 0) {
    // Clone to avoid mutating the input
    const game = JSON.parse(JSON.stringify(gameDef));

    // --- THE TRANSLATION LAYER ---
    // Map Composer Schema (scoring.components) -> Collator Schema (fields)
    if (game.scoring && game.scoring.components) {
        game.fields = game.scoring.components.map(comp => ({
            id: comp.id,
            label: comp.label,
            type: comp.type === FIELD_TYPES.STOPWATCH ? FIELD_TYPES.TIMED : comp.type,
            kind: comp.kind,
            weight: comp.weight,
            audience: comp.audience,
            ...comp.config // Spread min/max/placeholder into root
        }));
    } else if (!game.fields) {
        game.fields = [];
    }

    game.sortOrder = playlistOrder * 10;

    return game;
}
/**
 * Common Utility Functions
 */

export function formatGameTitle(game) {
    if (!game) return '';
    // If name already has "Game" or number prefix, assume legacy and leave it
    if (game.name.match(/^(Game|Exhibition|p\d)/i)) return game.name;

    // Extract Number from ID (p1 -> 1, t10 -> 10)
    const match = game.id.match(/(\d+)/);
    const num = match ? match[1] : '';

    if (num) return `Game ${num}. ${game.name}`;
    return game.name; // Fallback for Exhibition etc
}

export function getOrdinalSuffix(i) {
    const j = i % 10, k = i % 100;
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd";
    }
    if (j == 3 && k != 13) {
        return i + "rd";
    }
    return i + "th";
}

export function getPointsForRank(r) {
    const m = String(r).match(/\d+/);
    const n = m ? parseInt(m[0]) : 999;
    if (n === 1) return 100;
    if (n === 2) return 90;
    if (n === 3) return 80;
    if (n === 4) return 70;
    if (n === 5) return 60;
    return 50;
}

/**
 * Shared Status Detection Logic
 * Detects if an event is 'empty', 'active' (started/heats), or 'results' (has scores).
 */
export function getEventStatus(gameId, bracketData = {}) {
    const bracket = bracketData[gameId];
    if (!bracket || !bracket.rounds || bracket.rounds.length === 0) return 'empty';

    // Check if any heats have results
    let hasResults = false;
    bracket.rounds.forEach(r => {
        if (r.heats && r.heats.some(h => Object.keys(h.results || {}).length > 0)) {
            hasResults = true;
        }
    });

    if (hasResults) return 'results';
    return 'active';
}

/**
 * Robust UUID Generator
 * Works in non-secure contexts (HTTP) where crypto.randomUUID is unavailable.
 */
export function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch (e) {
            // Safari throws if not in secure context even if property exists
        }
    }

    // Fallback for non-HTTPS or missing randomUUID
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -11e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    // Ultimate fallback for ancient/restricted environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

