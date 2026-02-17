/**
 * API Client for Camporee Conductor
 * Handles all server communication for both Composer and Curator apps.
 */
export class ApiClient {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
    }

    /**
     * Checks if the server is online and writable.
     * @returns {Promise<boolean>}
     */
    async getStatus() {
        try {
            const res = await fetch(`${this.baseUrl}/status`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            });
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * Fetches the list of saved camporees from the server.
     * @returns {Promise<Array>}
     */
    async getCamporees() {
        const res = await fetch(`${this.baseUrl}/camporees`);
        if (!res.ok) throw new Error("Failed to fetch camporee list");
        return await res.json();
    }

    /**
     * Loads a specific camporee by ID.
     * @param {string} id
     * @returns {Promise<Object>}
     */
    async getCamporee(id) {
        const res = await fetch(`${this.baseUrl}/camporee/${id}`);
        if (!res.ok) throw new Error(`Failed to load camporee ${id}`);
        return await res.json();
    }

    /**
     * Checks metadata for a camporee to see if it exists (for overwrite warning).
     * @param {string} id
     * @returns {Promise<Object>} { exists: boolean, meta: Object }
     */
    async getCamporeeMeta(id) {
        const res = await fetch(`${this.baseUrl}/camporee/${id}/meta`);
        if (!res.ok) throw new Error("Failed to check camporee status");
        return await res.json();
    }

    /**
     * Saves a full camporee object.
     * @param {string} id
     * @param {Object} payload { meta, games, presets }
     * @returns {Promise<Object>} { success: true }
     */
    async saveCamporee(id, payload) {
        const res = await fetch(`${this.baseUrl}/camporee/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    }

    /**
     * Saves a generic game template to the library.
     * @param {Object} payload { path, data }
     * @returns {Promise<Object>} { success: true, catalog: Array }
     */
    async saveLibraryGame(payload) {
        const res = await fetch(`${this.baseUrl}/library/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    }
}
