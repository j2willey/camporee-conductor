import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gamesDir = path.join(__dirname, '..', 'config', 'games');

function migrateConfigs() {
    if (!fs.existsSync(gamesDir)) {
        console.error(`Error: Directory not found at ${gamesDir}`);
        return;
    }

    const files = fs.readdirSync(gamesDir).filter(file => file.endsWith('.json'));

    files.forEach(file => {
        const filePath = path.join(gamesDir, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            if (data.fields && Array.isArray(data.fields)) {
                data.fields = data.fields.map(field => {
                    // 3) Logic for 'audience'
                    field.audience = field.adminOnly === true ? 'admin' : 'judge';

                    // 4) Logic for 'kind'
                    field.kind = field.excludeFromTotal === true ? 'metric' : 'points';

                    // 5) Cleanup
                    delete field.adminOnly;
                    delete field.excludeFromTotal;

                    return field;
                });

                // 6) Save back to disk with nice formatting
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`✅ Migrated: ${file}`);
            }
        } catch (err) {
            console.error(`❌ Failed to process ${file}:`, err.message);
        }
    });
}

migrateConfigs();
