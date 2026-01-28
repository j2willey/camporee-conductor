export class SyncManager {
    constructor() {
        this.STORAGE_KEY = 'coyote_scores_queue';
    }

    getQueue() {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    addToQueue(scoreData) {
        const queue = this.getQueue();
        // Add synched: false flag
        scoreData._synced = false;
        queue.push(scoreData);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
        return queue.length; // return count of unsynced items
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

                const response = await fetch('/api/submit-score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    // Mark as synced locally or remove?
                    // To keep history, we mark as synced. To save space, we remove.
                    // Let's mark as synced so user has a record.
                    const index = newQueue.findIndex(q => q.uuid === item.uuid);
                    if (index !== -1) {
                         newQueue[index]._synced = true;
                    }
                    successCount++;
                } else {
                    console.error('Server refused:', await response.text());
                    errorCount++;
                }
            } catch (err) {
                console.error('Network error during sync:', err);
                errorCount++;
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
