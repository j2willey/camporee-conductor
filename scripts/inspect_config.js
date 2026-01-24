import fs from 'fs';
import path from 'path';

// We assume the config is in public/games.json (where the browser fetches it)
// If you moved it to config/, change this path!
const configPath = path.join(process.cwd(), 'public', 'games.json');

console.log(`🔍 Inspecting Game Configuration at: ${configPath}\n`);

try {
    if (!fs.existsSync(configPath)) {
        throw new Error(`File not found at ${configPath}`);
    }

    const rawData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(rawData);

    // 1. Check Common Scoring
    console.log('--- COMMON SCORING FIELDS ---');
    if (config.common_scoring && Array.isArray(config.common_scoring) && config.common_scoring.length > 0) {
        config.common_scoring.forEach(field => {
            console.log(` ✅ [${field.id}] ${field.label} (${field.type})`);
        });
    } else {
        console.log(' ❌ MISSING or EMPTY! The "common_scoring" block is not found.');
    }

    // 2. Check Games
    console.log('\n--- GAMES DEFINED ---');
    if (config.games && Array.isArray(config.games)) {
        console.log(` Found ${config.games.length} games.`);
        // Show the first game to see if it looks right
        const firstGame = config.games[0];
        console.log(` Example Game: "${firstGame.name}" has ${firstGame.fields.length} unique fields.`);
    } else {
        console.log(' ❌ No "games" array found!');
    }

} catch (err) {
    console.error('💥 Error reading config:', err.message);
}
