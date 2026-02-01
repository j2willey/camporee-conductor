import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'camporee.db');

const db = new Database(dbPath);
console.log(`Connected to ${dbPath}`);

try {
    const scoreResult = db.prepare('DELETE FROM scores').run();
    console.log(`Deleted ${scoreResult.changes} rows from scores table.`);

    const judgeResult = db.prepare('DELETE FROM judges').run();
    console.log(`Deleted ${judgeResult.changes} rows from judges table.`);

    const statusResult = db.prepare('DELETE FROM game_status').run();
    console.log(`Deleted ${statusResult.changes} rows from game_status table.`);

} catch (err) {
    if (err.message.includes('no such table')) {
        console.log('Table "scores" does not exist yet.');
    } else {
        console.error('Error resetting scores:', err);
    }
}
