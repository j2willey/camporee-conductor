import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GENERALIZED_FILE = path.join(__dirname, 'generalized_content.json');
const CURATOR_DIR = path.join(__dirname, '..', 'data', 'curator');
const ACTIVE_DIR = path.join(__dirname, '..', 'data', 'composer', 'workspaces', 'camp0002', 'games');

function run() {
    console.log("--- Syncing Generalized Content to Curator Library ---");

    if (!fs.existsSync(GENERALIZED_FILE)) {
        console.error("Generalized content map not found!");
        return;
    }

    const mapping = JSON.parse(fs.readFileSync(GENERALIZED_FILE, 'utf8'));

    for (const [activeId, config] of Object.entries(mapping)) {
        const libraryFile = config.library_file;
        const libraryPath = path.join(CURATOR_DIR, libraryFile);
        const activePath = path.join(ACTIVE_DIR, `${activeId}.json`);

        if (!fs.existsSync(libraryPath)) {
            console.warn(`⚠️  Library file not found: ${libraryFile}`);
            continue;
        }

        if (!fs.existsSync(activePath)) {
            console.warn(`⚠️  Active file not found: ${activeId}.json`);
            continue;
        }

        const libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
        const activeData = JSON.parse(fs.readFileSync(activePath, 'utf8'));

        if (!libraryData.content) libraryData.content = {};

        // 1. Pull the generalized narrative
        const newContent = config.content;
        libraryData.content.story = newContent.story;
        libraryData.content.challenge = newContent.challenge;
        libraryData.content.description = newContent.description;
        libraryData.content.notes = newContent.notes;
        libraryData.content.references = newContent.references;

        // 2. Pull the logistics/scoring overview from the active game (they are already generic)
        if (activeData.content) {
            libraryData.content.time_and_scoring = activeData.content.time_and_scoring || "";
            libraryData.content.scoring_notes = activeData.content.scoring_notes || "";
            libraryData.content.setup = activeData.content.setup || "";
            libraryData.content.staffing = activeData.content.staffing || "";
            libraryData.content.reset = activeData.content.reset || "";
            libraryData.content.rules = activeData.content.rules || [];

            // Handle supplies text vs array
            if (activeData.content.supplies_text) {
                libraryData.content.supplies_text = activeData.content.supplies_text;
            } else if (activeData.content.supplies) {
                libraryData.content.supplies = activeData.content.supplies;
            }
        }

        fs.writeFileSync(libraryPath, JSON.stringify(libraryData, null, 2));
        console.log(`✅ Synced into ${libraryFile}`);
    }
}

run();
