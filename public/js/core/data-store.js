export const appData = {
    games: [],
    entities: [],
    commonScoring: [],
    scores: [], // Full raw score list
    stats: {}, // Counts
    gameStatuses: {}, // Map of game_id -> status
    metadata: {}
};

/**
 * Fetches the latest games, entities, and scores from the API.
 * Updates the shared appData object.
 *
 * @param {Object} options - Configuration for the load operation.
 * @param {boolean} options.silent - If true, reduces logging.
 * @param {Function} options.onUpdate - Callback function to run after data is loaded (e.g., refreshCurrentView).
 * @param {Function} options.onHeaderUpdate - Callback function to update UI headers.
 */
export async function loadData(options = {}) {
    const { silent = false, onUpdate, onHeaderUpdate } = options;

    try {
        const ts = Date.now();
        // Fetch Games Config & Entities
        const [gamesRes, entitiesRes, dataRes] = await Promise.all([
            fetch(`/games.json?t=${ts}`),
            fetch(`/api/entities?t=${ts}`),
            fetch(`/api/admin/all-data?t=${ts}`)
        ]);

        const gamesResult = await gamesRes.json();
        appData.games = gamesResult.games;
        appData.commonScoring = gamesResult.common_scoring;
        appData.entities = await entitiesRes.json();

        // Fetch Data
        const dataResult = await dataRes.json();
        appData.scores = dataResult.scores || [];
        appData.stats = dataResult.stats || {};
        appData.gameStatuses = dataResult.game_status || {};
        appData.metadata = dataResult.metadata || {};

        if (!silent) console.log('Loaded Data:', appData);

        if (onHeaderUpdate) onHeaderUpdate();
        if (onUpdate) onUpdate();

    } catch (err) {
        console.error('Failed to load data', err);
        if (!silent) alert('Error loading dashboard data');
    }
}

/**
 * Common logic to update the dashboard header based on metadata.
 * Usually called after loadData.
 */
export function updateDashboardHeader() {
    const meta = appData.metadata;
    if (!meta) return;

    // 1. Update the main H1 Brand
    const brand = document.querySelector('header h1');
    if (brand) {
        // If there's a subtitle span, keep it
        const subtitle = document.getElementById('header-subtitle');
        brand.firstChild.textContent = meta.title || 'Camporee Collator';
    }

    // 2. Update Document Title (Browser Tab)
    document.title = meta.title ? `${meta.title} - Admin` : 'Camporee Collator';
}
