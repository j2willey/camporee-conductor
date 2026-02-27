import fs from 'fs';
import path from 'path';

const workspacePath = process.argv[2];
if (!workspacePath) {
    console.error("Usage: node extract_assets.js <path/to/workspace>");
    process.exit(1);
}

const gamesDir = path.join(workspacePath, 'games');
const assetsDir = path.join(workspacePath, 'assets');

if (!fs.existsSync(gamesDir)) {
    console.error(`Games directory not found: ${gamesDir}`);
    process.exit(1);
}

// Create assets directory if it doesn't exist
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

const gameFiles = fs.readdirSync(gamesDir).filter(f => f.endsWith('.json'));

let totalExtracted = 0;

const base64Regex = /!\[([^\]]*)\]\(data:image\/([a-zA-Z]+);base64,([^)]+)\)/g;

for (const file of gameFiles) {
    const filePath = path.join(gamesDir, file);
    const game = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    let modified = false;
    let imageIndex = 0;

    if (game.content) {
        for (const [key, value] of Object.entries(game.content)) {
            if (typeof value === 'string') {
                const newValue = value.replace(base64Regex, (match, altText, extension, base64Data) => {
                    // Fallback to png if extension is weird or missing
                    const ext = extension || 'png';
                    const fileName = `${game.id}_img_${imageIndex++}.${ext}`;
                    const assetPath = path.join(assetsDir, fileName);

                    // Write the image file
                    fs.writeFileSync(assetPath, Buffer.from(base64Data, 'base64'));
                    console.log(`Extracted ${fileName} from ${game.id} (${key})`);

                    totalExtracted++;
                    modified = true;

                    // Return the new markdown image tag
                    return `![${altText}](../assets/${fileName})`;
                });

                game.content[key] = newValue;
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(game, null, 2));
        console.log(`Updated JSON for ${game.id}`);
    }
}

console.log(`\nExtraction complete. Extracted ${totalExtracted} images.`);
