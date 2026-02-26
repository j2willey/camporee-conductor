import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_GAMES = path.join(__dirname, '..', 'data', 'composer', 'workspaces', 'camp0002', 'games');
const LIBRARY_GAMES = path.join(__dirname, '..', 'data', 'curator');

function migrateFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    let raw = fs.readFileSync(filePath, 'utf8');
    let data = JSON.parse(raw);

    if (!data.content) return;

    let changed = false;
    const c = data.content;

    // 1. Rename Top-Level Fields
    const renames = {
        'legend': 'story',
        'quest': 'challenge',
        'briefing': 'description',
        'scoring_overview': 'time_and_scoring',
        'judging_notes': 'scoring_notes'
    };

    for (const [oldKey, newKey] of Object.entries(renames)) {
        if (c[oldKey] !== undefined) {
            c[newKey] = c[oldKey];
            delete c[oldKey];
            changed = true;
        }
    }

    // 2. Flatten Logistics
    if (c.logistics) {
        if (c.logistics.setup !== undefined) c.setup = c.logistics.setup;
        if (c.logistics.staffing !== undefined) c.staffing = c.logistics.staffing;
        if (c.logistics.reset !== undefined) c.reset = c.logistics.reset;
        if (c.logistics.supplies_text !== undefined) c.supplies_text = c.logistics.supplies_text;
        if (c.logistics.supplies !== undefined) c.supplies = c.logistics.supplies;

        delete c.logistics;
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`✅ Migrated: ${path.basename(filePath)}`);
    } else {
        console.log(`⏩ Skipped: ${path.basename(filePath)} (Already migrated or nothing to migrate)`);
    }
}

function migrateDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        console.warn(`Directory not found: ${dirPath}`);
        return;
    }
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json') && f !== 'catalog.json' && f !== 'library-catalog.json');
    files.forEach(f => migrateFile(path.join(dirPath, f)));
}

console.log("--- Migrating Active Event Workspace ---");
migrateDirectory(WORKSPACE_GAMES);

console.log("\n--- Migrating Curator Library ---");
migrateDirectory(LIBRARY_GAMES);
