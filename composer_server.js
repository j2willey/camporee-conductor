import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// --- CONFIGURATION ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001; // Ensure this matches your Docker port map

// Increase payload limit for large Zip uploads
app.use(bodyParser.json({ limit: '50mb' }));

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

// Important: { index: false } prevents Express from automatically serving
// 'index.html' (the Collator App) when you hit '/', allowing the route below to handle it.
app.use(express.static('public', { index: false }));

app.set('view engine', 'ejs');

// Ensure root storage directory exists
const STORAGE_ROOT = path.join(__dirname, 'camporees');
if (!fs.existsSync(STORAGE_ROOT)) {
    console.log(`Creating storage root at: ${STORAGE_ROOT}`);
    fs.mkdirSync(STORAGE_ROOT);
}

// --- FRONTEND ROUTES ---

// FIX: Passed the 'title' variable required by index.ejs
app.get('/', (req, res) => {
    res.render('composer/index', {
        title: 'Camporee Composer'
    });
});

// --- API ROUTES ---

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
app.get('/api/camporees', (req, res) => {
    try {
        const camporees = [];
        const entries = fs.readdirSync(STORAGE_ROOT, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isDirectory()) {
                const metaPath = path.join(STORAGE_ROOT, entry.name, 'camporee.json');

                // Only include if a valid manifest exists
                if (fs.existsSync(metaPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        camporees.push({
                            id: entry.name, // The UUID directory name
                            title: data.meta.title,
                            year: data.meta.year,
                            theme: data.meta.theme
                        });
                    } catch (e) {
                        console.warn(`Skipping corrupt camporee in dir: ${entry.name}`);
                    }
                }
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
app.get('/api/camporee/:id', (req, res) => {
    try {
        const id = req.params.id;

        // Security: Prevent directory traversal
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const dir = path.join(STORAGE_ROOT, id);
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
app.get('/api/camporee/:id/meta', (req, res) => {
    try {
        const id = req.params.id;
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: "Invalid ID" });

        const metaPath = path.join(STORAGE_ROOT, id, 'camporee.json');

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
app.post('/api/camporee/:id', (req, res) => {
    try {
        const id = req.params.id;
        const payload = req.body; // { meta, games, presets }

        if (!/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: "Invalid ID" });

        const dir = path.join(STORAGE_ROOT, id);
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
                id: game.id,
                type: game.type,
                sortOrder: game.sortOrder,
                schemaVersion: "2.9",
                content: game.content,
                scoring: game.scoring,
                bracketMode: game.bracketMode || false,
                match_label: game.match_label || ''
            };
            fs.writeFileSync(path.join(gamesDir, `${game.id}.json`), JSON.stringify(gameFile, null, 2));
        });

        // 3. Save Manifest
        const manifest = {
            schemaVersion: "2.9",
            meta: payload.meta,
            playlist: playlist
        };
        manifest.meta.camporeeId = id;

        fs.writeFileSync(path.join(dir, 'camporee.json'), JSON.stringify(manifest, null, 2));

        console.log(`Saved Camporee: ${id} (${payload.meta.title})`);
        res.json({ success: true });

    } catch (err) {
        console.error("Save Error:", err);
        res.status(500).json({ error: "Save failed" });
    }
});

/**
 * 6. SAVE LIBRARY GAME TEMPLATE
 * Writes a library game JSON file to public/library/games (safe path).
 */
app.post('/api/library/save', async (req, res) => {
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

        const baseDir = path.join(__dirname, 'public', 'library', 'games');

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
        const catalogPath = path.join(baseDir, 'catalog.json');
        let catalog = [];
        try {
            if (fs.existsSync(catalogPath)) {
                const rawCatalog = JSON.parse(await fs.promises.readFile(catalogPath, 'utf8'));
                // Handle both array and object wrapper formats
                catalog = Array.isArray(rawCatalog) ? rawCatalog : (rawCatalog.games || []);
            }
        } catch (e) { console.warn("Catalog read error:", e); }

        let entryIndex = catalog.findIndex(c => c.path === gamePath);
        const newEntry = {
            path: gamePath,
            id: data.id,
            title: data.meta?.title || data.base_title || data.content?.title || 'Untitled',
            tags: data.meta?.tags || data.tags || [],
            type: data.type || 'patrol'
        };

        if (entryIndex >= 0) catalog[entryIndex] = newEntry;
        else catalog.push(newEntry);

        await fs.promises.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

        return res.status(200).json({ success: true, catalog: catalog });
    } catch (err) {
        console.error('Library save error:', err);
        return res.status(500).json({ error: 'Failed to save library game' });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Composer Server running at http://localhost:${PORT}`);
    console.log(`Storage Root: ${STORAGE_ROOT}`);
});