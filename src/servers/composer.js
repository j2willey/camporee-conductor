import express from 'express';
import bodyParser from 'body-parser';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import multer from 'multer';
import { clerkMiddleware, getAuth, createClerkClient } from '@clerk/express';
import { openConductorDb, runMigrations } from '../db/migrate.js';
import * as CuratorService from '../lib/curator-service.js';

dotenv.config();

// --- AAA DATABASE SETUP ---
const conductorDb = openConductorDb();
runMigrations(conductorDb);

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const TEST_MODE = process.env.NODE_ENV === 'test';

const ROLE_HIERARCHY = ['viewer', 'editor', 'owner'];

async function requireAuth(req, res, next) {
    if (TEST_MODE) return next();
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const now = Math.floor(Date.now() / 1000);
    conductorDb.prepare(`
        INSERT INTO user_profiles (user_id, created_at, last_active)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET last_active = excluded.last_active
    `).run(userId, now, now);

    // Fetch and cache email from Clerk if not yet stored
    const existing = conductorDb.prepare('SELECT email FROM user_profiles WHERE user_id = ?').get(userId);
    if (!existing?.email) {
        try {
            const clerkUser = await clerkClient.users.getUser(userId);
            const email = clerkUser.emailAddresses?.[0]?.emailAddress;
            if (email) {
                conductorDb.prepare('UPDATE user_profiles SET email = ? WHERE user_id = ?').run(email, userId);
            }
        } catch {
            // Non-fatal — email will be fetched on next request
        }
    }

    next();
}

function requireEventRole(minRole) {
    return function (req, res, next) {
        if (TEST_MODE) return next();
        const { userId } = getAuth(req);
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const profile = conductorDb.prepare('SELECT is_sysadmin FROM user_profiles WHERE user_id = ?').get(userId);
        if (profile?.is_sysadmin) return next();

        const eventId = req.params.eventId || req.params.id || req.body?.eventId;
        if (!eventId) return next();

        const permission = conductorDb.prepare(
            'SELECT role FROM event_permissions WHERE event_id = ? AND user_id = ?'
        ).get(eventId, userId);

        if (!permission) {
            // If ANY owner exists for this event, the current user has no access.
            // If no owner exists yet (legacy event), allow access for backwards compatibility.
            const anyOwner = conductorDb.prepare(
                'SELECT user_id FROM event_permissions WHERE event_id = ? LIMIT 1'
            ).get(eventId);
            if (anyOwner) return res.status(403).json({ error: 'Access denied' });
            return next();
        }

        const userLevel = ROLE_HIERARCHY.indexOf(permission.role);
        const minLevel  = ROLE_HIERARCHY.indexOf(minRole);
        if (userLevel < minLevel) return res.status(403).json({ error: 'Insufficient permissions' });

        next();
    };
}

function requireSysadmin(req, res, next) {
    if (TEST_MODE) return next();
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const profile = conductorDb.prepare('SELECT is_sysadmin FROM user_profiles WHERE user_id = ?').get(userId);
    if (!profile?.is_sysadmin) return res.status(403).json({ error: 'Sysadmin access required' });
    next();
}

function logAudit(userId, action, resourceType, resourceId, metadata = {}) {
    conductorDb.prepare(`
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata, ts)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, action, resourceType, resourceId, JSON.stringify(metadata), Math.floor(Date.now() / 1000));
}

// --- CONFIGURATION ---
const __filename = fileURLToPath(import.meta.url);
// Since this file is in src/servers/, go up two levels to reach the project root
const __dirname = path.join(path.dirname(__filename), '..', '..');

const app = express();
const PORT = 3001; // Ensure this matches your Docker port map

// Increase payload limit for large Zip uploads
app.use(bodyParser.json({ limit: '50mb' }));
if (!TEST_MODE) app.use(clerkMiddleware());

// SERVE STATIC FILES
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    if (req.url.startsWith('/library/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || path.join(__dirname, 'data', 'composer');
const LIBRARY_PATH = process.env.LIBRARY_PATH || path.join(__dirname, 'data', 'library');

// Gate /sysadmin.html before express.static can serve it as a raw file.
app.get('/sysadmin.html', requireAuth, requireSysadmin, (req, res) => {
    res.sendFile(path.resolve('public/sysadmin.html'));
});

// Important: { index: false } prevents Express from automatically serving
// 'index.html' (the Collator App) when you hit '/', allowing the route below to handle it.
app.use(express.static('public', { index: false }));

// Map the legacy /library/games path to the new separated silo
app.use('/library/games', express.static(LIBRARY_PATH));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Ensure root storage directory exists
if (!fs.existsSync(WORKSPACE_PATH)) {
    console.log(`Creating workspaces root at: ${WORKSPACE_PATH}`);
    fs.mkdirSync(WORKSPACE_PATH, { recursive: true });
}

// --- FRONTEND ROUTES ---

// FIX: Passed the 'title' variable required by index.ejs
function clerkFrontendApi(publishableKey) {
    if (!publishableKey) return '';
    try {
        const keyPart = publishableKey.replace(/^pk_(test|live)_/, '');
        return Buffer.from(keyPart, 'base64').toString('utf8').replace(/\$$/, '');
    } catch { return ''; }
}

app.get('/', (req, res) => {
    try {
        const pk = TEST_MODE ? '' : (process.env.CLERK_PUBLISHABLE_KEY || '');
        res.render('composer/index', {
            title: 'Camporee Composer',
            clerkPublishableKey: pk,
            clerkCdnUrl: pk ? `https://${clerkFrontendApi(pk)}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js` : '',
            testMode: TEST_MODE
        });
    } catch (err) {
        console.error("COMPOSER RENDER ERROR:", err);
        res.status(500).send("Render Error: " + err.message);
    }
});

// --- API ROUTES ---

const EARLY_ACCESS_DIR  = path.join(__dirname, 'data', 'early-access');
const EARLY_ACCESS_FILE = path.join(EARLY_ACCESS_DIR, 'submissions.json');

app.post('/api/early-access', (req, res) => {
    const { name, email, council, district, role, years, units, patrols,
            scouts, unit_adults, adult_staff, youth_staff } = req.body;
    if (!email) return res.status(400).json({ ok: false, error: 'Email required' });

    const entry = {
        timestamp:    new Date().toISOString(),
        name:         name         || '',
        email,
        council:      council      || '',
        district:     district     || '',
        role:         role         || '',
        years:        years        != null ? Number(years)        : null,
        units:        units        != null ? Number(units)        : null,
        patrols:      patrols      != null ? Number(patrols)      : null,
        scouts:       scouts       != null ? Number(scouts)       : null,
        unit_adults:  unit_adults  != null ? Number(unit_adults)  : null,
        adult_staff:  adult_staff  != null ? Number(adult_staff)  : null,
        youth_staff:  youth_staff  != null ? Number(youth_staff)  : null,
    };

    try {
        fs.mkdirSync(EARLY_ACCESS_DIR, { recursive: true });
        let submissions = [];
        try { submissions = JSON.parse(fs.readFileSync(EARLY_ACCESS_FILE, 'utf8')); } catch { /* new file */ }
        submissions.push(entry);
        fs.writeFileSync(EARLY_ACCESS_FILE, JSON.stringify(submissions, null, 2));
        console.log(`[early-access] new submission from ${email}`);
        res.json({ ok: true });
    } catch (err) {
        console.error('[early-access] write error:', err);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

/**
 * 1. STATUS CHECK
 * Used by the client to determine if "Server Mode" features should be enabled.
 */
app.get('/api/status', (req, res) => {
    res.json({
        online: true,
        version: '1.0',
        message: 'Camporee Composer Server is Online'
    });
});

/**
 * 2. LIST CAMPOREES
 * Scans the /camporees/ directory for valid projects.
 */
app.get('/api/camporees', requireAuth, (req, res) => {
    const { userId } = getAuth(req);
    const profile = conductorDb.prepare('SELECT is_sysadmin FROM user_profiles WHERE user_id = ?').get(userId);
    const isSysadmin = !!profile?.is_sysadmin;

    try {
        const camporees = [];
        const entries = fs.readdirSync(WORKSPACE_PATH, { withFileTypes: true });

        entries.forEach(entry => {
            if (!entry.isDirectory()) return;
            const metaPath = path.join(WORKSPACE_PATH, entry.name, 'camporee.json');
            if (!fs.existsSync(metaPath)) return;
            try {
                const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                const id = entry.name;

                const userPerm = conductorDb.prepare(
                    'SELECT role FROM event_permissions WHERE event_id = ? AND user_id = ?'
                ).get(id, userId);

                let role;
                if (isSysadmin) {
                    role = userPerm?.role || 'owner';
                } else if (userPerm) {
                    role = userPerm.role;
                } else {
                    // No row for this user — check if any permission exists (legacy vs restricted)
                    const anyPerm = conductorDb.prepare(
                        'SELECT user_id FROM event_permissions WHERE event_id = ? LIMIT 1'
                    ).get(id);
                    if (anyPerm) return; // owned by someone else, not shared with us
                    role = 'owner'; // legacy event, no permissions yet
                }

                camporees.push({
                    id,
                    title: data.meta.title,
                    year: data.meta.year,
                    theme: data.meta.theme,
                    role
                });
            } catch (e) {
                console.warn(`Skipping corrupt camporee in dir: ${entry.name}`);
            }
        });

        res.json(camporees);
    } catch (err) {
        console.error("List Error:", err);
        res.status(500).json({ error: "Failed to scan camporees" });
    }
});

/**
 * 3. GET SINGLE CAMPOREE
 * Loads the manifest, games, and presets for a specific ID.
 */
app.get('/api/camporee/:id', requireAuth, requireEventRole('viewer'), (req, res) => {
    try {
        const id = req.params.id;

        // Security: workspace IDs are always UUIDs — reject anything else
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const dir = path.join(WORKSPACE_PATH, id);
        const metaPath = path.join(dir, 'camporee.json');

        if (!fs.existsSync(metaPath)) {
            return res.status(404).json({ error: "Camporee not found" });
        }

        // Load Manifest
        const camporeeData = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

        // Load Presets (Optional)
        const presetsPath = path.join(dir, 'presets.json');
        let presets = [];
        if (fs.existsSync(presetsPath)) {
            presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
        }

        // Load Games
        const gamesDir = path.join(dir, 'games');
        const games = [];
        if (fs.existsSync(gamesDir)) {
            const files = fs.readdirSync(gamesDir);
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const gameData = JSON.parse(fs.readFileSync(path.join(gamesDir, file), 'utf8'));
                        games.push(gameData);
                    } catch (e) {
                        console.warn(`Failed to parse game: ${file}`);
                    }
                }
            });
        }

        res.json({
            meta: camporeeData.meta,
            leagues: camporeeData.leagues,
            sessions: camporeeData.sessions,
            rosters: camporeeData.rosters,
            terminology: camporeeData.terminology,
            type_defaults: camporeeData.type_defaults,
            games: games,
            presets: presets
        });

    } catch (err) {
        console.error("Load Error:", err);
        res.status(500).json({ error: "Failed to load camporee data" });
    }
});

/**
 * 4. CHECK METADATA (For Overwrite Warning)
 * Returns just the meta block to compare client vs server versions.
 */
app.get('/api/camporee/:id/meta', requireAuth, requireEventRole('viewer'), (req, res) => {
    try {
        const id = req.params.id;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return res.status(400).json({ error: "Invalid ID" });

        const metaPath = path.join(WORKSPACE_PATH, id, 'camporee.json');

        if (fs.existsSync(metaPath)) {
            const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            res.json({ exists: true, meta: data.meta });
        } else {
            res.json({ exists: false });
        }
    } catch (err) {
        console.error("Check Error:", err);
        res.status(500).json({ error: "Check failed" });
    }
});

/**
 * 5. SAVE CAMPOREE
 * Writes all data to the disk structure.
 */
app.post('/api/camporee/:id', requireAuth, requireEventRole('editor'), (req, res) => {
    try {
        const id = req.params.id;
        const payload = req.body; // { meta, games, presets }
        const { userId } = getAuth(req);

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return res.status(400).json({ error: "Invalid ID" });

        const dir = path.join(WORKSPACE_PATH, id);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // 1. Save Presets
        fs.writeFileSync(path.join(dir, 'presets.json'), JSON.stringify(payload.presets, null, 2));

        // 2. Save Games
        const gamesDir = path.join(dir, 'games');
        if (!fs.existsSync(gamesDir)) fs.mkdirSync(gamesDir);

        // Clean directory (delete old files to handle game deletions)
        const existingFiles = fs.readdirSync(gamesDir);
        for (const file of existingFiles) {
            fs.unlinkSync(path.join(gamesDir, file));
        }

        const playlist = [];

        payload.games.forEach((game, i) => {
            game.sortOrder = (game.sortOrder !== undefined) ? game.sortOrder : (i * 10);

            playlist.push({
                gameId: game.id,
                enabled: game.enabled,
                order: i + 1
            });

            const gameFile = {
                library_uuid: game.library_uuid || "",
                library_title: game.library_title || "",
                id: game.id,
                league: game.league,
                session: game.session !== undefined ? game.session : null,
                sortOrder: game.sortOrder,
                schemaVersion: "3.0",
                content: game.content,
                scoring_model: game.scoring_model,
                bracketMode: game.bracketMode || false,
                match_label: game.match_label || ''
            };
            if (game.variables && Object.keys(game.variables).length > 0) {
                gameFile.variables = game.variables;
            }
            fs.writeFileSync(path.join(gamesDir, `${game.id}.json`), JSON.stringify(gameFile, null, 2));
        });

        // 3. Save Manifest
        const manifest = {
            schemaVersion: "3.0",
            meta: payload.meta,
            terminology: payload.terminology || null,
            leagues: payload.leagues || [],
            sessions: payload.sessions || [],
            rosters: payload.rosters || { units: [], subunits: [], individuals: [] },
            officials: [],
            playlist: playlist,
            type_defaults: payload.type_defaults || {}
        };
        manifest.meta.camporeeId = id;

        fs.writeFileSync(path.join(dir, 'camporee.json'), JSON.stringify(manifest, null, 2));

        // Wire ownership: insert 'owner' row if this event has no permissions yet
        const existingPerms = conductorDb.prepare(
            'SELECT user_id FROM event_permissions WHERE event_id = ? LIMIT 1'
        ).get(id);

        if (!existingPerms && userId) {
            const now = Math.floor(Date.now() / 1000);
            conductorDb.prepare(`
                INSERT OR IGNORE INTO event_permissions (event_id, user_id, role, granted_by, granted_at)
                VALUES (?, ?, 'owner', ?, ?)
            `).run(id, userId, userId, now);
            logAudit(userId, 'event.created', 'event', id, { title: payload.meta.title });
        } else {
            logAudit(userId, 'game.saved', 'event', id, { title: payload.meta.title, game_count: payload.games?.length });
        }

        console.log(`Saved Camporee: ${id} (${payload.meta.title})`);
        res.json({ success: true });

    } catch (err) {
        console.error("Save Error:", err);
        res.status(500).json({ error: "Save failed" });
    }
});

/**
 * 6. SAVE LIBRARY GAME TEMPLATE
 * Writes a library game JSON file to the Curator Vault.
 */
app.post('/api/library/save', requireAuth, async (req, res) => {
    try {
        console.log("Received Library Save Request:", JSON.stringify(req.body, null, 2));
        const { path: gamePath, data } = req.body || {};
        if (!gamePath || !data) return res.status(400).json({ error: 'path and data required' });

        // Enforce hashtags
        if (data.tags && Array.isArray(data.tags)) {
            data.tags = data.tags.map(t => t.startsWith('#') ? t : `#${t}`);
        }
        if (data.meta && data.meta.tags && Array.isArray(data.meta.tags)) {
            data.meta.tags = data.meta.tags.map(t => t.startsWith('#') ? t : `#${t}`);
        }

        const baseDir = LIBRARY_PATH;

        // Normalize and join to prevent directory traversal
        if (path.isAbsolute(gamePath)) return res.status(400).json({ error: 'Invalid path' });
        const targetPath = path.normalize(path.join(baseDir, gamePath));

        // Ensure target is strictly within baseDir
        if (!targetPath.startsWith(baseDir + path.sep)) {
            return res.status(400).json({ error: 'Invalid path' });
        }

        console.log(`[SERVER] Writing game file to: ${targetPath}`);
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.promises.writeFile(targetPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`[SERVER] Game file written successfully.`);

        // --- CATALOG UPDATE LOGIC ---
        const catalogPath = path.join(baseDir, 'library-catalog.json');
        let catalog = [];
        try {
            if (fs.existsSync(catalogPath)) {
                const rawCatalog = JSON.parse(await fs.promises.readFile(catalogPath, 'utf8'));
                catalog = Array.isArray(rawCatalog) ? rawCatalog : (rawCatalog.components || []);
            }
        } catch (e) { console.warn("Catalog read error:", e); }

        let entryIndex = catalog.findIndex(c => c.path === gamePath);
        const newEntry = {
            path: gamePath,
            library_uuid: data.library_uuid,
            library_title: data.library_title || data.meta?.title || data.base_title || data.content?.title || 'Untitled',
            tags: data.meta?.tags || data.tags || [],
            league: data.league || 'patrol-games'
        };

        if (entryIndex >= 0) catalog[entryIndex] = newEntry;
        else catalog.push(newEntry);

        await fs.promises.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

        const { userId } = getAuth(req);
        logAudit(userId, 'game.exported', 'game', data.library_uuid || gamePath, { title: newEntry.library_title });

        return res.status(200).json({ success: true, catalog: catalog });
    } catch (err) {
        console.error('Library save error:', err);
        return res.status(500).json({ error: 'Failed to save library game' });
    }
});

/**
 * 8. AI Brainstorm Introduction
 * Hits the Gemini API to return 3 distinct introduction options based on a theme.
 */
app.post('/api/ai/brainstorm-theme', requireAuth, async (req, res) => {
    try {
        const { theme, instruction } = req.body;
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "GEMINI_API_KEY is not configured in .env" });
        }

        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `
        You are an expert event planner and creative writer for a Scout Camporee. 
        The theme of the camporee is: "${theme || 'Scouting Adventure'}".
        
        Please provide three distinct options for the "Introduction" or "Welcome Text" of the event program.
        ${instruction ? `The user also requested: "${instruction}"` : ''}
        
        1. An Action-Oriented option that excites the participants.
        2. A Lore-Heavy option that leans deep into the theme's storytelling.
        3. A Skill-Focused option emphasizing the scouting skills they will use.
        
        Keep each option between 3 and 5 sentences. Return ONLY a JSON object exactly like this:
        {
            "action": "...",
            "lore": "...",
            "skill": "..."
        }
        `;

        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });
        const text = response.text;

        // Extract JSON from markdown backticks if present
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        const parsedJSON = JSON.parse(jsonMatch ? jsonMatch[1] : text);

        res.json(parsedJSON);
    } catch (err) {
        console.error("AI Brainstorm Error:", err);
        res.status(500).json({ error: "Failed to generate AI response" });
    }
});

/**
 * 9. AI Test Key
 * Validates the Gemini API key is configured and working.
 */
app.get('/api/ai/test', requireAuth, async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.json({ success: false, message: "GEMINI_API_KEY is missing from .env" });
        }
        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "Reply with the word SUCCESS"
        });
        if (response.text.includes("SUCCESS")) {
            return res.json({ success: true, message: "API Key is valid and working!" });
        }
        res.json({ success: false, message: "Received unexpected response from API." });
    } catch (err) {
        console.error("AI Test Error:", err);
        res.json({ success: false, message: err.message || "Failed to reach Google API." });
    }
});

/**
 * 10. AI Theme Game
 * Transforms a generic scout game into a themed experience based on camporee context.
 */
app.post('/api/ai/theme-game', requireAuth, async (req, res) => {
    try {
        const { camporeeContext, gameJson, instruction } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "GEMINI_API_KEY is not configured in .env" });
        }

        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const prompt = `
        You are a Creative Lead for Scouting America. Your goal is to transform a generic scout skill game into a high-adventure themed experience.
        
        Tone: G-rated, inspiring, and age-appropriate (11-17).
        
        Inputs: You will receive the Camporee Theme/Welcome Text and a Game JSON.
        
        Camporee Context:
        ${camporeeContext}
        
        Original Game JSON:
        ${JSON.stringify(gameJson, null, 2)}
        
        Tasks: 
        1. Update the \`game_title\`.
        2. Update \`content.story\`, \`content.briefing\`, and \`content.rules\`. 
        3. Use themed nomenclature for supplies in parentheses if applicable (e.g., 'Matches (Dragon Breath Sparks)').
        4. Scoring: You may update the \`label\` and \`description\` of scoring inputs (\`scoring_model\`) to match the theme, but NEVER change the \`id\`, \`type\`, or \`weight\`.
        ${instruction ? `\nUser Feedback/Instruction:\n${instruction}\n` : ''}
        
        Return ONLY a clean, valid JSON object that structurely matches the original Game JSON but with the updated text fields. Do not wrap in markdown quotes if possible, or if you do, wrap strictly in \`\`\`json.
        `;

        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        const text = response.text;

        // Extract JSON from markdown backticks if present
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        const parsedJSON = JSON.parse(jsonMatch ? jsonMatch[1] : text);

        res.json(parsedJSON);
    } catch (err) {
        console.error("AI Theme Game Error:", err);
        res.status(500).json({ error: "Failed to theme game via AI" });
    }
});

app.post('/api/ai/update-game', requireAuth, async (req, res) => {
    try {
        const { prompt, model, includeContent, currentContent } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "GEMINI_API_KEY is not configured in .env" });
        }
        if (!prompt) {
            return res.status(400).json({ error: "prompt is required" });
        }

        const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        const selectedModel = ALLOWED_MODELS.includes(model) ? model : 'gemini-2.5-flash';

        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const fullPrompt = `You are a game designer assistant for Scouting America skill competitions (age 11-17, G-rated, Scout values).
Update the game content fields based on the user's instructions.

Return ONLY a valid JSON object containing any of these keys (omit keys you are not changing):
- game_title (string)
- challenge (string — one-sentence objective)
- story (string — thematic narrative, markdown OK)
- description (string — step-by-step instructions, markdown OK)
- rules (array of strings — each item is one rule)
- time_and_scoring (string — scoring overview, markdown OK)
- scoring_notes (string — tips for the judge, markdown OK)
- staffing (string — staff requirements, markdown OK)
- setup (string — physical setup instructions, markdown OK)
- reset (string — how to reset between groups, markdown OK)
- supplies_text (string — equipment list, markdown OK)

Return ONLY the JSON object. No markdown code fences. No explanation text.

User Instruction:
${prompt}
${includeContent && currentContent ? `\nCurrent Game Content:\n${JSON.stringify(currentContent, null, 2)}` : ''}`;

        const response = await genAI.models.generateContent({
            model: selectedModel,
            contents: fullPrompt
        });

        const text = response.text;
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);

        res.json(parsed);
    } catch (err) {
        console.error("AI Update Game Error:", err);
        res.status(500).json({ error: err.message || "Failed to update game via AI" });
    }
});

/**
 * GET /api/clerk-config — public endpoint: returns Clerk publishable key + CDN URL
 */
app.get('/api/clerk-config', (req, res) => {
    const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
    res.json({
        publishableKey: pk,
        cdnUrl: pk ? `https://${clerkFrontendApi(pk)}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js` : ''
    });
});

// ── ADMIN API ────────────────────────────────────────────────────────────────

app.get('/admin/api/stats', requireAuth, requireSysadmin, (req, res) => {
    const totalUsers    = conductorDb.prepare('SELECT COUNT(*) as n FROM user_profiles').get().n;
    const totalEvents   = conductorDb.prepare('SELECT COUNT(DISTINCT event_id) as n FROM event_permissions').get().n;
    const distCouncils  = conductorDb.prepare("SELECT COUNT(DISTINCT council_name) as n FROM user_profiles WHERE council_name IS NOT NULL AND council_name != ''").get().n;
    const monthStart    = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const eventsThisMo  = conductorDb.prepare("SELECT COUNT(DISTINCT resource_id) as n FROM audit_log WHERE action = 'event.created' AND ts >= ?").get(Math.floor(monthStart.getTime() / 1000)).n;
    res.json({ totalUsers, totalEvents, distCouncils, eventsThisMo });
});

app.get('/admin/api/users', requireAuth, requireSysadmin, (req, res) => {
    const search = req.query.search || '';
    const page   = Math.max(0, parseInt(req.query.page) || 0);
    const like   = `%${search}%`;
    const users  = conductorDb.prepare(`
        SELECT user_id, display_name, council_name, primary_role,
               is_sysadmin, is_suspended, curator_admin, created_at, last_active
        FROM user_profiles
        WHERE display_name LIKE ? OR council_name LIKE ? OR district LIKE ?
        ORDER BY last_active DESC LIMIT 50 OFFSET ?
    `).all(like, like, like, page * 50);
    const total = conductorDb.prepare(`
        SELECT COUNT(*) as n FROM user_profiles
        WHERE display_name LIKE ? OR council_name LIKE ? OR district LIKE ?
    `).get(like, like, like).n;
    res.json({ users, total, page });
});

app.get('/admin/api/users/:id', requireAuth, requireSysadmin, (req, res) => {
    const { id } = req.params;
    const profile = conductorDb.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    const events     = conductorDb.prepare('SELECT event_id, role, granted_at FROM event_permissions WHERE user_id = ? ORDER BY granted_at DESC').all(id);
    const auditTrail = conductorDb.prepare('SELECT * FROM audit_log WHERE user_id = ? ORDER BY ts DESC LIMIT 50').all(id);
    res.json({ profile, events, auditTrail });
});

app.put('/admin/api/users/:id', requireAuth, requireSysadmin, (req, res) => {
    const { id } = req.params;
    const { userId: currentUserId } = getAuth(req);
    const { is_suspended, is_sysadmin, curator_admin } = req.body;
    if (id === currentUserId && is_sysadmin === false) {
        return res.status(400).json({ error: 'Cannot revoke your own sysadmin access' });
    }
    conductorDb.prepare(`
        UPDATE user_profiles SET is_suspended = ?, is_sysadmin = ?, curator_admin = ? WHERE user_id = ?
    `).run(is_suspended ? 1 : 0, is_sysadmin ? 1 : 0, curator_admin ? 1 : 0, id);
    logAudit(currentUserId, 'user.updated', 'user', id, { is_suspended, is_sysadmin, curator_admin });
    res.json({ success: true });
});

app.get('/admin/api/audit', requireAuth, requireSysadmin, (req, res) => {
    const { user_id, action, limit = 100 } = req.query;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
    if (action)  { sql += ' AND action = ?';  params.push(action); }
    sql += ' ORDER BY ts DESC LIMIT ?';
    params.push(Math.min(500, parseInt(limit) || 100));
    res.json(conductorDb.prepare(sql).all(...params));
});

/**
 * GET /api/me — current user's profile row
 */
app.get('/api/me', requireAuth, (req, res) => {
    const { userId } = getAuth(req);
    const profile = conductorDb.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    res.json(profile || { user_id: userId });
});

/**
 * PUT /api/me — update current user's profile
 */
app.put('/api/me', requireAuth, (req, res) => {
    const { userId } = getAuth(req);
    const { display_name, council_name, district, primary_role, years_in_scouting } = req.body;
    conductorDb.prepare(`
        UPDATE user_profiles
        SET display_name = ?, council_name = ?, district = ?, primary_role = ?, years_in_scouting = ?
        WHERE user_id = ?
    `).run(display_name || null, council_name || null, district || null, primary_role || null, years_in_scouting || null, userId);
    res.json({ success: true });
});

// ── COLLABORATION ────────────────────────────────────────────────────────────

app.get('/api/events/:eventId/collaborators', requireAuth, requireEventRole('viewer'), (req, res) => {
    const { eventId } = req.params;
    const collaborators = conductorDb.prepare(`
        SELECT ep.user_id, ep.role, ep.granted_at, ep.is_collator_official, up.display_name, up.email
        FROM event_permissions ep
        LEFT JOIN user_profiles up ON ep.user_id = up.user_id
        WHERE ep.event_id = ?
        ORDER BY ep.role DESC, ep.granted_at ASC
    `).all(eventId);
    res.json(collaborators);
});

app.post('/api/events/:eventId/collaborators', requireAuth, requireEventRole('owner'), async (req, res) => {
    const { eventId } = req.params;
    const { userId } = getAuth(req);
    const { email, role } = req.body;

    if (!email || !['editor', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'email and role (editor or viewer) required' });
    }

    try {
        const response = await clerkClient.users.getUserList({ emailAddress: [email] });
        const users = response.data ?? response;
        if (!users?.length) {
            return res.status(404).json({ error: 'No account found for that email' });
        }

        const invitee = users[0];
        const now = Math.floor(Date.now() / 1000);

        conductorDb.prepare(`
            INSERT INTO event_permissions (event_id, user_id, role, granted_by, granted_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(event_id, user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, granted_at = excluded.granted_at
        `).run(eventId, invitee.id, role, userId, now);

        // Ensure the invitee has a user_profiles stub so the join in GET collaborators works
        const inviteeEmail = invitee.emailAddresses?.[0]?.emailAddress || null;
        conductorDb.prepare(`
            INSERT INTO user_profiles (user_id, email, created_at, last_active)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET email = COALESCE(excluded.email, email)
        `).run(invitee.id, inviteeEmail, now, now);

        logAudit(userId, 'collaborator.invited', 'event', eventId, { email, role });
        res.json({ success: true });
    } catch (err) {
        console.error('Invite collaborator error:', err);
        res.status(500).json({ error: 'Failed to invite collaborator' });
    }
});

app.delete('/api/events/:eventId/collaborators/:targetUserId', requireAuth, requireEventRole('owner'), (req, res) => {
    const { eventId, targetUserId } = req.params;
    const { userId: currentUserId } = TEST_MODE ? { userId: 'user_test' } : getAuth(req);

    if (targetUserId === currentUserId) {
        return res.status(400).json({ error: 'Cannot remove yourself as owner' });
    }

    conductorDb.prepare('DELETE FROM event_permissions WHERE event_id = ? AND user_id = ?').run(eventId, targetUserId);
    logAudit(currentUserId, 'collaborator.removed', 'event', eventId, { removed_user: targetUserId });
    res.json({ success: true });
});

app.put('/api/events/:eventId/collaborators/:targetUserId/official', requireAuth, requireEventRole('owner'), (req, res) => {
    const { eventId, targetUserId } = req.params;
    const { userId } = TEST_MODE ? { userId: 'user_test' } : getAuth(req);
    const { is_official } = req.body;

    const result = conductorDb.prepare(
        'UPDATE event_permissions SET is_collator_official = ? WHERE event_id = ? AND user_id = ?'
    ).run(is_official ? 1 : 0, eventId, targetUserId);

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Collaborator not found' });
    }

    logAudit(userId, is_official ? 'official.granted' : 'official.revoked', 'event', eventId, { target: targetUserId });
    res.json({ success: true });
});

app.get('/api/events/:eventId/officials', requireAuth, requireEventRole('viewer'), async (req, res) => {
    const { eventId } = req.params;

    const rows = conductorDb.prepare(`
        SELECT ep.user_id, ep.role, up.display_name, up.email
        FROM event_permissions ep
        LEFT JOIN user_profiles up ON ep.user_id = up.user_id
        WHERE ep.event_id = ? AND (ep.role = 'owner' OR ep.is_collator_official = 1)
        ORDER BY ep.role DESC, ep.granted_at ASC
    `).all(eventId);

    const officials = [];
    for (const row of rows) {
        let email = row.email;
        if (!email && !TEST_MODE) {
            try {
                const clerkUser = await clerkClient.users.getUser(row.user_id);
                email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
                if (email) {
                    conductorDb.prepare('UPDATE user_profiles SET email = ? WHERE user_id = ?').run(email, row.user_id);
                }
            } catch {
                email = null;
            }
        }
        officials.push({
            user_id: row.user_id,
            display_name: row.display_name || null,
            email: email || null,
            role: row.role === 'owner' ? 'director' : 'official'
        });
    }

    res.json(officials);
});

// ── CURATOR TEMPLATE API ─────────────────────────────────────────────────────

const cartridgeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/curator/api/templates', (req, res) => {
    res.json(CuratorService.listTemplates());
});

app.get('/curator/api/templates/:id/meta', (req, res) => {
    try {
        res.json(CuratorService.getTemplateMeta(req.params.id));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

app.get('/curator/api/templates/:id/zip', requireAuth, (req, res) => {
    try {
        const buf = CuratorService.getTemplateZip(req.params.id);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="CamporeeTemplate-${req.params.id}.zip"`);
        res.send(buf);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

app.post('/api/from-template/:templateId', requireAuth, async (req, res) => {
    const { templateId } = req.params;
    const { userId } = TEST_MODE ? { userId: 'user_test' } : getAuth(req);
    const newId = randomUUID();
    const workspaceDir = path.join(WORKSPACE_PATH, newId);

    try {
        // 1. Fetch zip — throws 404-style error if not found
        let zipBuffer;
        try {
            zipBuffer = CuratorService.getTemplateZip(templateId);
        } catch (err) {
            return res.status(err.status || 500).json({ error: err.message });
        }

        // 2. Unpack into new workspace
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        const camporeeEntry = entries.find(e => e.entryName === 'camporee.json');
        if (!camporeeEntry) {
            return res.status(400).json({ error: 'Invalid template: missing camporee.json' });
        }

        fs.mkdirSync(workspaceDir, { recursive: true });
        const gamesDir = path.join(workspaceDir, 'games');
        fs.mkdirSync(gamesDir, { recursive: true });

        // camporee.json
        const camporeeData = JSON.parse(camporeeEntry.getData().toString('utf8'));
        camporeeData.source_template_id = templateId;
        camporeeData.created_from_template = true;
        fs.writeFileSync(
            path.join(workspaceDir, 'camporee.json'),
            JSON.stringify(camporeeData, null, 2)
        );

        // presets.json (optional)
        const presetsEntry = entries.find(e => e.entryName === 'presets.json');
        if (presetsEntry) {
            fs.writeFileSync(
                path.join(workspaceDir, 'presets.json'),
                presetsEntry.getData()
            );
        }

        // games/*.json
        for (const entry of entries) {
            if (entry.entryName.startsWith('games/') && entry.entryName.endsWith('.json')) {
                const filename = path.basename(entry.entryName);
                fs.writeFileSync(path.join(gamesDir, filename), entry.getData());
            }
        }

        // 3. Insert ownership
        const now = Math.floor(Date.now() / 1000);
        conductorDb.prepare(`
            INSERT INTO event_permissions (event_id, user_id, role, granted_by, granted_at)
            VALUES (?, ?, 'owner', ?, ?)
        `).run(newId, userId, userId, now);

        // 4. Audit
        const title = camporeeData.meta?.title || 'Untitled';
        logAudit(userId, 'event.created_from_template', 'event', newId, {
            sourceTemplateId: templateId,
            title
        });

        res.status(201).json({ id: newId, title, sourceTemplateId: templateId });

    } catch (err) {
        // Clean up partial workspace on any write failure
        try { fs.rmSync(workspaceDir, { recursive: true, force: true }); } catch { /* ignore */ }
        console.error('[from-template] error:', err);
        res.status(500).json({ error: 'Failed to create workspace from template' });
    }
});

app.post('/curator/api/templates', requireAuth, requireSysadmin,
    cartridgeUpload.single('cartridge'), (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'cartridge file required' });
        const { userId } = TEST_MODE ? { userId: 'user_test' } : getAuth(req);
        try {
            const { id } = CuratorService.submit(req.file.buffer, userId);
            const catalog = CuratorService.listTemplates();
            const entry = catalog.find(e => e.id === id);
            res.status(201).json({ id, title: entry?.title, theme: entry?.theme });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message });
        }
    }
);

// --- START SERVER ---
// We no longer call app.listen directly. Instead, we export the configured app
// to be mounted by the root server.js
export default app;