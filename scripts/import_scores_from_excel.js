import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import crypto from 'crypto';

// CONFIG
const EXCEL_FILE = 'patrol.xlsx'; // In root
const API_BASE = 'http://localhost:3000';
const CONFIG_DIR = path.join(process.cwd(), 'config');
const GAMES_DIR = path.join(CONFIG_DIR, 'games');

if (!fs.existsSync(EXCEL_FILE)) {
    console.error(`Excel file not found: ${EXCEL_FILE}`);
    process.exit(1);
}

// Load Common Scoring Config
let commonScoring = [];
if (fs.existsSync(path.join(CONFIG_DIR, 'common.json'))) {
    commonScoring = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'common.json'), 'utf-8'));
}

// Load All Game Configs
const gameConfigs = [];
if (fs.existsSync(GAMES_DIR)) {
    fs.readdirSync(GAMES_DIR).forEach(file => {
        if (file.endsWith('.json')) {
            const content = fs.readFileSync(path.join(GAMES_DIR, file), 'utf8');
            gameConfigs.push(JSON.parse(content));
        }
    });
} else {
    console.error("Game config directory not found.");
    process.exit(1);
}

// Helper: Normalize strings for matching
const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

// Helper: Convert Excel Value to Type
const convertValue = (val, type) => {
    if (val === undefined || val === null) return null;
    if (type === 'boolean') {
        if (typeof val === 'string') return val.toLowerCase() === 'yes' || val.toLowerCase() === 'true' || val === '1';
        return !!val;
    }
    if (type === 'number' || type === 'range') return Number(val);
    if (type === 'time_mm_ss') {
        if (typeof val === 'number') {
            const totalSeconds = Math.round(val * 24 * 60 * 60);
            const mm = Math.floor(totalSeconds / 60);
            const ss = totalSeconds % 60;
            return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
        }
        return String(val);
    }
    return String(val);
};

// HELPER: Wait for server availability
async function waitForServer() {
    console.log("Checking server availability...");
    try {
        const res = await fetch(`${API_BASE}/games.json`);
        if (res.ok) {
            console.log("Server is UP.");
            return true;
        }
    } catch (e) {
        console.error(`Server unreachable at ${API_BASE}. Please ensure the app is running.`);
        return false;
    }
}

async function runImport() {
    if (!await waitForServer()) return;

    // Fetch Entities used for checking validity (mostly for verification, though we trust Patrol IDs)
    let entities = [];
    try {
        const res = await fetch(`${API_BASE}/api/entities`);
        if (res.ok) entities = await res.json();
        console.log(`Loaded ${entities.length} entities from server.`);
    } catch(e) { console.error("Could not fetch entities", e); }


    const workbook = XLSX.readFile(EXCEL_FILE);
    let totalImported = 0;

    for (const sheetName of workbook.SheetNames) {
        const normSheet = normalize(sheetName);
        console.log(`\nProcessing Sheet: ${sheetName}`);

        // Find matching game config
        const game = gameConfigs.find(g => normalize(g.id) === normSheet || normalize(g.name).includes(normSheet) || normSheet.includes(normalize(g.id)));

        if (!game) {
            console.log(`  XX No matching game config found. Skipping.`);
            continue;
        }
        console.log(`  -> Matched Game: ${game.id} ("${game.name}")`);

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        let headerRowIdx = -1;
        for(let i=0; i<rows.length; i++) {
            if (rows[i] && rows[i].some(c => c && String(c).toLowerCase().includes('patrol id'))) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx === -1) {
            console.log("  XX No header row (looking for 'Patrol Id'). Skipping.");
            continue;
        }

        const headers = rows[headerRowIdx];
        const allFields = [...(game.fields || []), ...commonScoring];
        const fieldMap = {}; // colIndex -> fieldId

        headers.forEach((h, idx) => {
            if (!h) return;
            const hNorm = normalize(h);
            const matchedField = allFields.find(f => {
                return normalize(f.id) === hNorm || normalize(f.label) === hNorm || hNorm.includes(normalize(f.label));
            });
            if (matchedField) fieldMap[idx] = matchedField;
        });

        const patrolIdIdx = headers.findIndex(h => h && normalize(h) === 'patrolid');
        if (patrolIdIdx === -1) continue;

        // Iterate Rows
        for (let r = headerRowIdx + 2; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;

            const entityId = row[patrolIdIdx];
            if (!entityId) continue;

            // Verify entity exists?
            // Optional, but good practice. The API probably relies on FKs so it might fail if bad ID.

            const payload = {};
            let hasData = false;

            for (const [colIdx, field] of Object.entries(fieldMap)) {
                const val = row[colIdx];
                if (val !== null && val !== undefined && val !== '') {
                    payload[field.id] = convertValue(val, field.type);
                    hasData = true;
                }
            }

            if (!hasData) continue;

            // POST SCORE
            const body = {
                uuid: crypto.randomUUID(),
                game_id: game.id,
                entity_id: entityId,
                score_payload: payload,
                timestamp: Date.now(),
                judge_name: 'Excel Import',
                judge_email: 'import@local'
            };

            try {
                const postRes = await fetch(`${API_BASE}/api/score`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (postRes.ok) {
                    process.stdout.write("."); // Progress dot
                    totalImported++;
                } else {
                    const errTxt = await postRes.text();
                     if (errTxt.includes('already_exists')) process.stdout.write("s"); // Skip
                     else console.error(`Failed to post: ${postRes.status} - ${errTxt}`);
                }
            } catch (err) {
                console.error("Network Error posting score:", err);
            }
        }
    }

    console.log(`\n\nImport Complete! Total scores imported: ${totalImported}`);
}

runImport();
