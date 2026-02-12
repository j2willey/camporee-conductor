/**
 * scripts/curate_library.js
 *
 * "Reverse Engineering" Tool for Camporee Conductor.
 * Converts active event game files (camporee/active/games/*.json)
 * into generic Library Templates (public/library/games/*.json).
 *
 * Usage: node scripts/curate_library.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- CONFIGURATION ---
// Adjust these paths if your folder structure differs locally
const SOURCE_DIR = path.join(__dirname, '../camporee/active/games');
const TARGET_BASE_DIR = path.join(__dirname, '../public/library/games');

// Fields automatically added by the system that shouldn't be in templates
const SYSTEM_PRESET_IDS = ['p_flag', 'p_yell', 'p_spirit', 'off_notes'];

// --- HELPERS ---

/**
 * Determines the subfolder (category) based on keywords.
 */
function determineCategory(game) {
    const title = game.name || game.title || '';
    const fields = game.fields || game.scoring || game.custom_scoring || [];
    const text = (title + ' ' + JSON.stringify(fields)).toLowerCase();

    if (text.includes('fire') || text.includes('burn') || text.includes('match') || text.includes('boil')) return 'scoutcraft';
    if (text.includes('knot') || text.includes('lash') || text.includes('rope')) return 'scoutcraft';
    if (text.includes('bandage') || text.includes('splint') || text.includes('aid') || text.includes('rescue')) return 'first_aid';
    if (text.includes('blind') || text.includes('carry') || text.includes('team') || text.includes('relay')) return 'teamwork';
    if (text.includes('compass') || text.includes('map') || text.includes('orient')) return 'navigation';

    return 'general';
}

/**
 * Cleans up specific event titles to be more generic.
 */
function generalizeTitle(oldTitle) {
    let title = oldTitle || "Untitled Game";
    // Remove "Game 5:" prefixes
    title = title.replace(/^Game \d+:\s*/i, '');
    return title;
}

/**
 * Generates tags based on game type and content.
 */
function generateTags(source) {
    const tags = new Set();

    // Map "type": "patrol" -> #patrol
    if (source.type === 'patrol') tags.add('#patrol');
    if (source.type === 'troop') tags.add('#troop');

    const title = source.name || source.title || '';
    const fields = source.fields || source.scoring || source.custom_scoring || [];
    const text = (title + ' ' + JSON.stringify(fields)).toLowerCase();

    if (text.includes('timed') || text.includes('stopwatch')) tags.add('#speed');
    if (text.includes('accuracy') || text.includes('target')) tags.add('#accuracy');
    if (text.includes('water')) tags.add('#aquatics');

    // Add category tag
    tags.add(`#${determineCategory(source)}`);

    return Array.from(tags);
}

/**
 * Maps legacy "fields" to new "scoring" schema.
 */
function mapScoring(oldFields) {
    if (!Array.isArray(oldFields)) return [];

    return oldFields
        .filter(f => !SYSTEM_PRESET_IDS.includes(f.id))
        .map(f => {
            // Map Types based on README.md definitions
            let newType = f.type || 'input';

            // Source: timed -> Target: timer
            if (f.type === 'timed') newType = 'timer';

            // Source: number -> Target: tally (if small count) or input
            else if (f.type === 'number') newType = 'tally';

            // Source: range -> Target: input (Target schema doesn't have range, using input)
            else if (f.type === 'range') newType = 'input';

            // Source: select -> Target: input
            else if (f.type === 'select') newType = 'input';

            // Validate against target schema enum
            const validTypes = ["timer", "tally", "boolean", "input"];
            if (!validTypes.includes(newType)) newType = 'input';

            // Calculate Max Points
            let max = 0;
            if (f.max_points !== undefined) max = f.max_points;
            else if (f.max !== undefined) max = f.max;
            // Handle boolean default (usually 1 or specified in a config object if complex)
            else if (newType === 'boolean' && !max) max = 1;

            return {
                id: f.id,
                label: f.label || "Score",
                type: newType,
                max_points: parseInt(max) || 0,
                weight: 1.0 // Default weight
            };
        });
}

// --- MAIN EXECUTION ---

function run() {
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`❌ Source directory not found: ${SOURCE_DIR}`);
        console.log("Please ensure 'camporee/active/games' exists.");
        return;
    }

    const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} games to process...`);

    files.forEach(file => {
        try {
            const raw = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
            const source = JSON.parse(raw);

            const category = determineCategory(source);
            const rawTitle = source.name || source.title || "Untitled";
            const newTitle = generalizeTitle(rawTitle);

            // Construct the new Template Object
            const template = {
                id: crypto.randomUUID(),
                version: "1.0.0",
                meta: {
                    title: newTitle,
                    description: `Standard ${category} challenge.`, // Placeholder description
                    tags: generateTags(source),
                    logistics: { duration_min: 20, supplies: [] }
                },
                scoring: mapScoring(source.fields || source.scoring || source.custom_scoring)
            };

            const outDir = path.join(TARGET_BASE_DIR, category);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const outName = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
            fs.writeFileSync(path.join(outDir, outName), JSON.stringify(template, null, 2));
            console.log(`✅ Converted: "${rawTitle}" -> ${category}/${outName}`);

        } catch (err) {
            console.error(`❌ Error processing ${file}:`, err.message);
        }
    });
}

run();
