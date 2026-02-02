import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, '../data/camporee.db'));

console.log("Cleaning up duplicate scores...");

const transaction = db.transaction(() => {
    // Keep only the row with the maximum timestamp (or latest UUID if timestamps are identical) for each game_id/entity_id
    const deleteDuplicates = db.prepare(`
        DELETE FROM scores
        WHERE uuid NOT IN (
            SELECT uuid
            FROM (
                SELECT uuid,
                       ROW_NUMBER() OVER (
                           PARTITION BY game_id, entity_id
                           ORDER BY timestamp DESC, uuid DESC
                       ) as row_num
                FROM scores
            )
            WHERE row_num = 1
        )
    `);

    const result = deleteDuplicates.run();
    console.log(`Deleted ${result.changes} duplicate scores.`);
});

try {
    transaction();
    console.log("Cleanup complete.");
} catch (err) {
    console.error("Error during cleanup:", err);
}
