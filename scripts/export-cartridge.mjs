/**
 * Exports a Composer workspace as a CamporeeConfig.zip cartridge.
 * Applies the same field filtering as the browser-side exportCamporee().
 * Usage: node scripts/export-cartridge.mjs <workspaceId> [outputPath]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WORKSPACES = path.join(ROOT, 'data', 'composer', 'workspaces');

const COMMON_FIELD_IDS = new Set([
    'patrol_flag', 'patrol_yell', 'patrol_spirit', 'patrol_sprirt',
    'p_flag', 'p_yell', 'p_spirit', 'ten_ess',
    'unscoutlike', 'unscout',
    'off_notes',
    'off_score', 'final_rank', 'overall_points'
]);

const [,, workspaceId, outputArg] = process.argv;
if (!workspaceId) {
    console.error('Usage: node scripts/export-cartridge.mjs <workspaceId> [outputPath]');
    process.exit(1);
}

const wsDir = path.join(WORKSPACES, workspaceId);
if (!fs.existsSync(wsDir)) {
    console.error(`Workspace not found: ${wsDir}`);
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(wsDir, 'camporee.json'), 'utf8'));
const presets = fs.existsSync(path.join(wsDir, 'presets.json'))
    ? fs.readFileSync(path.join(wsDir, 'presets.json'), 'utf8')
    : '[]';

const zip = new AdmZip();

// camporee.json — include type_defaults, strip logistics (none yet)
const camporeeOut = {
    schemaVersion: manifest.schemaVersion || '2.9',
    meta: manifest.meta,
    type_defaults: manifest.type_defaults,
    playlist: manifest.playlist
};
zip.addFile('camporee.json', Buffer.from(JSON.stringify(camporeeOut, null, 2)));
zip.addFile('presets.json', Buffer.from(presets));

// game files — filter COMMON_FIELD_IDS from scoring_model.inputs
const gamesDir = path.join(wsDir, 'games');
let gameCount = 0;
for (const fname of fs.readdirSync(gamesDir)) {
    if (!fname.endsWith('.json')) continue;
    const g = JSON.parse(fs.readFileSync(path.join(gamesDir, fname), 'utf8'));

    const gameOut = {
        id: g.id,
        library_uuid: g.library_uuid || '',
        library_title: g.library_title || '',
        type: g.type,
        sortOrder: g.sortOrder,
        schemaVersion: '2.9',
        content: g.content,
        scoring_model: {
            ...g.scoring_model,
            inputs: (g.scoring_model?.inputs || []).filter(f => !COMMON_FIELD_IDS.has(f.id))
        },
        match_label: g.match_label || ''
    };
    if (g.bracketMode) gameOut.bracketMode = true;
    if (g.variables) gameOut.variables = g.variables;

    zip.addFile(`games/${fname}`, Buffer.from(JSON.stringify(gameOut, null, 2)));
    gameCount++;
}

const title = (manifest.meta?.title || 'CamporeeConfig').replace(/\s+/g, '_');
const year = manifest.meta?.year || '';
const defaultOut = path.join(ROOT, 'data', `${title}_${year}.zip`);
const outputPath = outputArg || defaultOut;

zip.writeZip(outputPath);
console.log(`✓ Wrote ${gameCount} games to ${outputPath}`);
console.log(`  Camporee: ${manifest.meta?.title} (${manifest.meta?.theme})`);
