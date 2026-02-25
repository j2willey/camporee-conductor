/**
 * LibraryService
 * Handles fetching of game templates and catalog metadata from the static library index.
 */
export class LibraryService {
    constructor(baseUrl = '/library/games/') {
        const prefix = window.API_BASE || '';
        this.baseUrl = prefix + baseUrl;
    }

    /**
     * Fetches the main library-catalog.json file.
     * @returns {Promise<Object>} The catalog data.
     */
    async getCatalog() {
        try {
            const response = await fetch(`${this.baseUrl}library-catalog.json`);
            if (!response.ok) {
                console.error(`LibraryService: Failed to fetch catalog. HTTP ${response.status}`);
                throw new Error(`Catalog not found at ${this.baseUrl}library-catalog.json`);
            }
            const data = await response.json();
            // Normalize: Ensure we always return { components: [] }
            if (Array.isArray(data)) {
                return { components: data };
            }
            return data;
        } catch (error) {
            console.error('LibraryService Error (getCatalog):', error);
            throw error;
        }
    }

    /**
     * Fetches a specific game template by its relative path.
     * @param {string} relativePath - Path relative to the library root (e.g., 'fire/matchless.json')
     * @returns {Promise<Object>} The game template data.
     */
    async getGame(relativePath) {
        try {
            const response = await fetch(`${this.baseUrl}${relativePath}`);
            if (!response.ok) {
                console.error(`LibraryService: Failed to fetch game at ${relativePath}. HTTP ${response.status}`);
                throw new Error(`Game template not found at ${relativePath}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`LibraryService Error (getGame - ${relativePath}):`, error);
            throw error;
        }
    }
}
