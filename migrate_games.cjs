const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GAMES_DIR = path.join(__dirname, 'public/library/games');
const OUT_DIR = path.join(__dirname, 'public/library/games_migrated');

if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

function generateUUID() {
    return crypto.randomUUID();
}

function transformScoring(oldScoring) {
    if (!oldScoring) return { method: "points_desc", inputs: [] };

    // Check if it's already new format
    if (oldScoring.inputs) return oldScoring;

    const inputs = (oldScoring.components || []).map(comp => {
        const newComp = {
            id: comp.id || generateUUID(),
            label: comp.label || "Field",
            type: comp.type || "number",
            kind: comp.kind || "points",
            weight: comp.weight !== undefined ? comp.weight : 1,
            audience: comp.audience || "judge",
            sortOrder: comp.sortOrder || 900,
            config: comp.config || {}
        };
        // Normalize max_points
        if (comp.max_points !== undefined && !newComp.config.max) {
            newComp.config.max = comp.max_points;
        }
        return newComp;
    });

    return {
        method: oldScoring.method || "points_desc",
        inputs: inputs
    };
}

function migrateFile(filename) {
    if (!filename.endsWith('.json') || filename === 'catalog.json' || filename === 'library-catalog.json') return;

    const content = fs.readFileSync(path.join(GAMES_DIR, filename), 'utf8');
    const oldGame = JSON.parse(content);

    // If it already nas library_uuid, assume migrated or new
    if (oldGame.library_uuid) {
        console.log(`Skipping ${filename} (already has library_uuid)`);
        return;
    }

    const newGame = {
        library_uuid: generateUUID(),
        library_title: oldGame.base_title || oldGame.meta?.title || "Untitled",
        type: oldGame.type || "patrol",
        tags: oldGame.tags || oldGame.meta?.tags || [],
        content: {
            title: oldGame.meta?.title || oldGame.base_title || "Untitled",
            description: oldGame.meta?.description || "",
            story: oldGame.meta?.story || "",
            instructions: oldGame.meta?.instructions || "",
            rules: [],
            supplies: []
        },
        scoring_model: transformScoring(oldScoring = oldGame.scoring || oldGame.scoring_model),
        variants: (oldGame.variants || []).map(v => ({
            library_uuid: generateUUID(),
            title: v.label || "Variant",
            content: {
                title: v.label || "Variant",
                description: v.description || "",
                instructions: "", // Was not in old variant explicitly?
                rules: [],
                supplies: []
            }
        }))
    };

    fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(newGame, null, 2));
    console.log(`Migrated ${filename}`);
}

const files = fs.readdirSync(GAMES_DIR);
files.forEach(migrateFile);
console.log("Migration complete. Check public/library/games_migrated/");
