export class SyncManager {
    constructor() {
        this.STORAGE_KEY = 'coyote_scores_queue';
    }

    getQueue() {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    addToQueue(scoreData) {
        let queue = this.getQueue();

        // Find if this game/entity combo already exists in the queue
        const existingIdx = queue.findIndex(s => s.game_id === scoreData.game_id && s.entity_id === scoreData.entity_id);

        scoreData._synced = false;

        if (existingIdx !== -1) {
            // Overwrite existing record (updates values and resets sync status to false)
            queue[existingIdx] = scoreData;
        } else {
            queue.push(scoreData);
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
        return queue.filter(q => !q._synced).length;
    }

    async sync() {
        const queue = this.getQueue();
        const unsynced = queue.filter(item => !item._synced);

        if (unsynced.length === 0) return { total: 0, synced: 0, errors: 0 };

        let successCount = 0;
        let errorCount = 0;

        // Clone queue to update statuses
        let newQueue = [...queue];

        for (const item of unsynced) {
            try {
                // Remove internal _synced flag before sending
                const { _synced, ...payload } = item;

                const response = await fetch('/api/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    // SAFE PARSING: Chrome forgives empty JSON, Safari throws.
                    // Even if we don't use the result, parsing it ensures the stream is drained.
                    if (response.status !== 204) {
                        try {
                            await response.json();
                        } catch (parseErr) {
                            // If it's not valid JSON but the status was OK, we can often ignore
                            // but Safari might be sensitive to unconsumed bodies.
                        }
                    }

                    const index = newQueue.findIndex(q => q.uuid === item.uuid);
                    if (index !== -1) {
                         newQueue[index]._synced = true;
                    }
                    successCount++;
                } else {
                    const errorText = await response.text();
                    console.error('Server refused:', errorText);
                    errorCount++;
                    throw new Error(`Server Error: ${response.status} ${errorText}`);
                }
            } catch (err) {
                console.error('Network or Parsing error during sync:', err);
                errorCount++;
                // Rethrow so the UI (judge.js) can catch it and alert the user.
                throw err;
            }
        }

        // Clean up: Optional - remove synced items older than X?
        // For now, keep them but persist the updated statuses
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newQueue));

        return { total: unsynced.length, synced: successCount, errors: errorCount };
    }

    getCounts() {
        const queue = this.getQueue();
        const unsynced = queue.filter(item => !item._synced).length;
        return { total: queue.length, unsynced };
    }
}
