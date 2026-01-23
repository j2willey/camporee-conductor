import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const csvPath = path.join(__dirname, 'Roster.csv');
const dbPath = path.join(__dirname, '..', 'data', 'camporee.db');

// Check files
if (!fs.existsSync(csvPath)) {
    console.error(`Error: Roster file not found at ${csvPath}`);
    process.exit(1);
}

// Connect to DB
console.log(`opening database at ${dbPath}`);
const db = new Database(dbPath);

// Prepare statement
// We use INSERT OR REPLACE to update existing records if IDs match
const insert = db.prepare(`
    INSERT OR REPLACE INTO entities (id, name, type, troop_number)
    VALUES (?, ?, ?, ?)
`);

// Simple CSV Parser (handling quoted values roughly)
function parseCSVLine(text) {
    const re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;

    // Simple split if no quotes
    if (!text.includes('"')) {
        return text.split(',').map(v => v.trim());
    }

    // Regex for splitting with quotes support
    // This is a basic implementation
    const matches = text.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
    if (!matches) return [];
    return matches.map(m => m.replace(/^"|"$/g, '').trim().replace(/""/g, '"'));
}

try {
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = fileContent.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (lines.length < 2) {
        console.log('CSV is empty or only has header');
        process.exit(0);
    }

    // Determine indices from header
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const idIdx = headers.findIndex(h => h.includes('id'));
    const troopIdx = headers.findIndex(h => h === 'troop');
    const patrolIdx = headers.findIndex(h => h === 'patrol');

    if (idIdx === -1 || troopIdx === -1 || patrolIdx === -1) {
        console.error('Error: Could not find required columns (Patrol ID, Troop, Patrol)');
        console.log('Found headers:', headers);
        process.exit(1);
    }

    const transaction = db.transaction((rows) => {
        let count = 0;
        for (const line of rows) {
            const cols = parseCSVLine(line);
            if (cols.length < 3) continue;

            const id = parseInt(cols[idIdx], 10);
            const troop = cols[troopIdx];
            const name = cols[patrolIdx];
            const type = 'patrol';

            if (!isNaN(id)) {
                insert.run(id, name, type, troop);
                count++;
            }
        }
        return count;
    });

    const insertedCount = transaction(lines.slice(1));
    console.log(`Successfully imported ${insertedCount} entities.`);

} catch (err) {
    console.error('Import failed:', err);
}
