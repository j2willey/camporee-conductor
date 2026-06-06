#!/usr/bin/env node
/**
 * templatize.js
 *
 * AI-assisted camporee templatization tool.
 * Converts a real camporee into a Curator-ready template by replacing
 * event-specific proper nouns with {{localization_tokens}}.
 *
 * HYBRID APPROACH:
 *   1. Seed known values from camporee.json meta (deterministic)
 *   2. Pass known values + all game text to AI for deep scan
 *   3. AI returns a token_map + flagged items for review
 *   4. Apply replacements to a staging workspace
 *   5. Human reviews staging + manifest
 *   6. --apply pushes to Curator and cleans up
 *
 * USAGE:
 *   # Phase 1 — analyze and stage
 *   node scripts/templatize.js --workspace <uuid>
 *   node scripts/templatize.js --zip <path/to/cartridge.zip>
 *
 *   # Phase 2 — review, then apply
 *   node scripts/templatize.js --apply <staging-uuid>
 *
 *   # Utilities
 *   node scripts/templatize.js --list          list staging workspaces
 *   node scripts/templatize.js --clean <uuid>  delete a staging workspace
 *
 * AI ENGINE:
 *   Set AI_PROVIDER=gemini (default) or AI_PROVIDER=claude in .env
 *
 * ENV VARS:
 *   WORKSPACE_PATH   composer workspaces root (default: data/composer/workspaces)
 *   LIBRARY_PATH     curator library root     (default: data/library)
 *   GEMINI_API_KEY   required when AI_PROVIDER=gemini
 *   ANTHROPIC_API_KEY required when AI_PROVIDER=claude
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { generateText, parseJsonResponse, PROVIDER } from '../src/lib/ai-provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Path resolution ──────────────────────────────────────────────────────────

const WORKSPACE_PATH = process.env.WORKSPACE_PATH
    || path.join(ROOT, 'data', 'composer', 'workspaces');

const LIBRARY_PATH = process.env.LIBRARY_PATH
    || path.join(ROOT, 'data', 'library');

const TEMPLATES_DIR  = path.join(LIBRARY_PATH, 'templates');
const CATALOG_PATH   = path.join(TEMPLATES_DIR, 'template-catalog.json');
const STAGING_DIR    = path.join(LIBRARY_PATH, 'staging');

// ── Content fields to scan in each game file ────────────────────────────────

const GAME_TEXT_FIELDS = [
    'game_title',
    'content.story',
    'content.challenge',
    'content.description',
    'content.notes',
    'content.references',
    'content.staffing',
    'content.setup',
    'content.reset',
    'content.supplies_text',
    'content.time_and_scoring',
    'content.scoring_notes',
];

// ── Utilities ────────────────────────────────────────────────────────────────

function getNestedValue(obj, dotPath) {
    return dotPath.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function setNestedValue(obj, dotPath, value) {
    const keys = dotPath.split('.');
    let cursor = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (cursor[keys[i]] === undefined) cursor[keys[i]] = {};
        cursor = cursor[keys[i]];
    }
    cursor[keys[keys.length - 1]] = value;
}

function applyTokenMap(text, tokenMap) {
    if (typeof text !== 'string') return text;
    let result = text;
    for (const [original, token] of Object.entries(tokenMap)) {
        if (!original || !token) continue;
        // Case-insensitive global replace; preserve token exactly as specified
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'gi'), token);
    }
    return result;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Extract known values from camporee.json meta ─────────────────────────────

function extractKnownValues(camporee) {
    const meta = camporee.meta || {};
    const known = {};

    // Direct meta fields → token names
    const mappings = [
        ['title',         '{{camporee_name}}'],
        ['director',      '{{director_name}}'],
        ['contact_email', '{{contact_email}}'],
    ];

    // council / district can live under meta or meta.council_info, etc.
    // Accept whatever shape comes in
    if (meta.council)        known[meta.council]        = '{{council_name}}';
    if (meta.council_name)   known[meta.council_name]   = '{{council_name}}';
    if (meta.district)       known[meta.district]       = '{{district_name}}';
    if (meta.district_name)  known[meta.district_name]  = '{{district_name}}';
    if (meta.venue)          known[meta.venue]          = '{{venue_name}}';
    if (meta.venue_name)     known[meta.venue_name]     = '{{venue_name}}';
    if (meta.location)       known[meta.location]       = '{{venue_name}}';

    // Date: try common shapes
    if (meta.event_date)  known[meta.event_date]  = '{{event_date}}';
    if (meta.dates)       known[meta.dates]        = '{{event_date}}';
    if (meta.start_date)  known[meta.start_date]   = '{{event_date}}';

    // Year: as a string (avoids replacing "2" in "2nd Place", etc.)
    if (meta.year) known[String(meta.year)] = '{{event_year}}';

    for (const [field, token] of mappings) {
        if (meta[field]) known[meta[field]] = token;
    }

    // Remove empty-string keys
    for (const k of Object.keys(known)) {
        if (!k || k.trim() === '') delete known[k];
    }

    return known;
}

// ── Collect all game text into a review corpus ────────────────────────────────

function collectGameCorpus(stagingPath) {
    const gamesDir = path.join(stagingPath, 'games');
    const corpus = {};

    if (!fs.existsSync(gamesDir)) return corpus;

    for (const file of fs.readdirSync(gamesDir).filter(f => f.endsWith('.json'))) {
        const game = readJson(path.join(gamesDir, file));
        const fields = {};
        for (const fieldPath of GAME_TEXT_FIELDS) {
            const val = getNestedValue(game, fieldPath);
            if (typeof val === 'string' && val.trim()) {
                fields[fieldPath] = val;
            }
        }
        if (Object.keys(fields).length) corpus[`games/${file}`] = fields;
    }

    return corpus;
}

// ── Build the AI prompt ───────────────────────────────────────────────────────

function buildPrompt(camporee, knownValues, corpus) {
    const knownJson = JSON.stringify(knownValues, null, 2);
    const corpusJson = JSON.stringify(corpus, null, 2);
    const metaJson = JSON.stringify(camporee.meta || {}, null, 2);

    return `
You are helping convert a real Scout Camporee event into a reusable community template.
Your job is to find event-specific proper nouns and replace them with {{localization_tokens}}.

## WHAT TO TOKENIZE (event-specific, must change per organizer):
- Council name (e.g., "Mount Diablo Silverado Council" → {{council_name}})
- District name (e.g., "Coyote Creek District" → {{district_name}})
- Venue / camp name (e.g., "Camp Chesebrough" → {{venue_name}})
- Event dates (e.g., "May 15–17, 2026" → {{event_date}})
- Year references used as event year (e.g., "2026" → {{event_year}})
- Director / staff names (e.g., "Jim Willey" → {{director_name}})
- Contact email addresses → {{contact_email}}
- Camporee name / title → {{camporee_name}}

## WHAT NOT TO TOKENIZE (keep as-is):
- The event theme and theme-related words (e.g., "Circus", "The Circus", "Big Top", "clown", "ringmaster").
  The theme is the VALUE of this template — consumers will keep or adapt it themselves.
- Generic scouting terminology ("patrol", "troop", "scout", "merit badge").
- Game mechanics, scoring rules, time limits.
- Anything that is not a proper noun specific to this particular event.

## KNOWN VALUES (already confirmed from event metadata — always replace these):
${knownJson}

## CAMPOREE META (for reference):
${metaJson}

## GAME TEXT CORPUS (file → field → text):
${corpusJson}

## YOUR TASK:
1. Identify ALL event-specific proper nouns in the corpus, including any not already in the known values.
2. Build a complete token_map: { "original text": "{{token_name}}" }.
   Include the known values plus anything additional you find.
3. List any items you noticed that were NOT tokenized but a contributor SHOULD consider
   (things that might be event-specific but you're not certain about).
4. Suggest a template title, short description, and tags for the Curator library.

## RETURN FORMAT (strict JSON, no markdown fences):
{
  "token_map": {
    "ExactOriginalText": "{{token_name}}"
  },
  "flagged": [
    {
      "file": "games/example.json",
      "field": "content.story",
      "excerpt": "short quote from the text",
      "reason": "Why this might need attention"
    }
  ],
  "template_meta": {
    "title": "Suggested template title",
    "description": "1–2 sentence description for Curator browse page",
    "tags": ["tag1", "tag2"]
  }
}

Return ONLY the JSON object. No explanation, no markdown.
`.trim();
}

// ── Apply token_map to the staging workspace ─────────────────────────────────

function applyTokensToWorkspace(stagingPath, tokenMap) {
    const changes = [];

    // camporee.json — meta fields only (not leagues, rosters, etc.)
    const camporeeFile = path.join(stagingPath, 'camporee.json');
    if (fs.existsSync(camporeeFile)) {
        const camporee = readJson(camporeeFile);
        const metaFields = ['title', 'director', 'contact_email', 'council', 'council_name',
                            'district', 'district_name', 'venue', 'venue_name', 'location',
                            'event_date', 'dates', 'start_date'];
        let changed = false;
        for (const field of metaFields) {
            if (typeof camporee.meta?.[field] === 'string') {
                const before = camporee.meta[field];
                const after = applyTokenMap(before, tokenMap);
                if (before !== after) {
                    changes.push({ file: 'camporee.json', field: `meta.${field}`, before, after });
                    camporee.meta[field] = after;
                    changed = true;
                }
            }
        }
        if (changed) writeJson(camporeeFile, camporee);
    }

    // games/*.json — all text fields
    const gamesDir = path.join(stagingPath, 'games');
    if (fs.existsSync(gamesDir)) {
        for (const file of fs.readdirSync(gamesDir).filter(f => f.endsWith('.json'))) {
            const gamePath = path.join(gamesDir, file);
            const game = readJson(gamePath);
            let changed = false;

            for (const fieldPath of GAME_TEXT_FIELDS) {
                const before = getNestedValue(game, fieldPath);
                if (typeof before !== 'string') continue;
                const after = applyTokenMap(before, tokenMap);
                if (before !== after) {
                    changes.push({ file: `games/${file}`, field: fieldPath, before, after });
                    setNestedValue(game, fieldPath, after);
                    changed = true;
                }
            }

            if (changed) writeJson(gamePath, game);
        }
    }

    return changes;
}

// ── Phase 1: Analyze ─────────────────────────────────────────────────────────

async function runAnalyze(sourcePath, isZip) {
    // 1. Prepare staging directory
    fs.mkdirSync(STAGING_DIR, { recursive: true });
    const stagingId = randomUUID();
    const stagingPath = path.join(STAGING_DIR, stagingId);
    fs.mkdirSync(stagingPath);

    // 2. Unpack source into staging
    let zipSource = sourcePath;
    if (!isZip) {
        // Pack workspace to zip first, then unpack to staging
        console.log(`Packing workspace ${sourcePath} to zip...`);
        zipSource = path.join(STAGING_DIR, `${stagingId}-source.zip`);
        const zip = new AdmZip();
        zip.addLocalFolder(sourcePath);
        zip.writeZip(zipSource);
    }

    console.log(`Unpacking to staging: ${stagingPath}`);
    new AdmZip(zipSource).extractAllTo(stagingPath, true);

    // Clean up temp zip if we created one
    if (!isZip && fs.existsSync(zipSource)) {
        fs.unlinkSync(zipSource);
    }

    // 3. Load camporee.json
    const camporeeFile = path.join(stagingPath, 'camporee.json');
    if (!fs.existsSync(camporeeFile)) {
        console.error('ERROR: camporee.json not found in source. Is this a valid cartridge?');
        fs.rmSync(stagingPath, { recursive: true, force: true });
        process.exit(1);
    }
    const camporee = readJson(camporeeFile);

    // 4. Extract known values (hybrid: deterministic seed)
    const knownValues = extractKnownValues(camporee);
    console.log(`\nKnown values seeded from metadata (${Object.keys(knownValues).length}):`);
    for (const [k, v] of Object.entries(knownValues)) {
        console.log(`  "${k}" → ${v}`);
    }

    // 5. Collect game text corpus
    const corpus = collectGameCorpus(stagingPath);
    const fileCount = Object.keys(corpus).length;
    console.log(`\nGame text corpus: ${fileCount} file(s) with tokenizable content`);

    // 6. Call AI
    console.log(`\nCalling AI (${PROVIDER}) for deep scan...`);
    const prompt = buildPrompt(camporee, knownValues, corpus);
    let aiResponse;
    try {
        const raw = await generateText(prompt);
        aiResponse = parseJsonResponse(raw);
    } catch (err) {
        console.error('AI call failed:', err.message);
        console.error('Staging workspace preserved at:', stagingPath);
        process.exit(1);
    }

    const { token_map = {}, flagged = [], template_meta = {} } = aiResponse;

    // 7. Apply token_map to staging workspace
    console.log(`\nApplying ${Object.keys(token_map).length} token replacements...`);
    const changes = applyTokensToWorkspace(stagingPath, token_map);
    console.log(`  ${changes.length} field(s) modified across ${new Set(changes.map(c => c.file)).size} file(s)`);

    // 8. Write manifest
    const manifest = {
        stagingId,
        createdAt: new Date().toISOString(),
        aiProvider: PROVIDER,
        source: isZip ? path.basename(sourcePath) : `workspace:${path.basename(sourcePath)}`,
        token_map,
        changes,
        flagged,
        template_meta,
        instructions: [
            '1. Review the changes[] to confirm token replacements look correct.',
            '2. Review the flagged[] items and manually update staging files if needed.',
            '3. Update template_meta with your preferred title/description/tags.',
            `4. When satisfied, run: node scripts/templatize.js --apply ${stagingId}`,
        ],
    };

    const manifestPath = path.join(stagingPath, 'templatize-manifest.json');
    writeJson(manifestPath, manifest);

    // 9. Summary output
    console.log('\n' + '='.repeat(60));
    console.log('TEMPLATIZATION COMPLETE — HUMAN REVIEW REQUIRED');
    console.log('='.repeat(60));
    console.log(`\nStaging ID : ${stagingId}`);
    console.log(`Staging dir: ${stagingPath}`);
    console.log(`Manifest   : ${manifestPath}`);

    console.log(`\nToken map (${Object.keys(token_map).length} replacements):`);
    for (const [k, v] of Object.entries(token_map)) {
        console.log(`  "${k}" → ${v}`);
    }

    if (flagged.length > 0) {
        console.log(`\n⚠️  FLAGGED ITEMS (${flagged.length}) — review before applying:`);
        for (const item of flagged) {
            console.log(`  [${item.file}] ${item.field}`);
            console.log(`    Excerpt: "${item.excerpt}"`);
            console.log(`    Reason : ${item.reason}`);
        }
    }

    if (template_meta.title) {
        console.log(`\nSuggested Curator entry:`);
        console.log(`  Title      : ${template_meta.title}`);
        console.log(`  Description: ${template_meta.description}`);
        console.log(`  Tags       : ${(template_meta.tags || []).join(', ')}`);
    }

    console.log(`\nNext step: review staging, then run:`);
    console.log(`  node scripts/templatize.js --apply ${stagingId}\n`);
}

// ── Phase 2: Apply ───────────────────────────────────────────────────────────

async function runApply(stagingId) {
    const stagingPath = path.join(STAGING_DIR, stagingId);

    if (!fs.existsSync(stagingPath)) {
        console.error(`Staging workspace not found: ${stagingPath}`);
        console.error('Run --list to see available staging workspaces.');
        process.exit(1);
    }

    // Read manifest for template_meta
    const manifestPath = path.join(stagingPath, 'templatize-manifest.json');
    let manifest = {};
    if (fs.existsSync(manifestPath)) {
        manifest = readJson(manifestPath);
    }

    console.log(`Packaging staging workspace: ${stagingId}`);

    // Pack to zip (exclude the manifest — it's a review artifact)
    const zip = new AdmZip();
    const addDir = (dirPath, zipPrefix) => {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            const fullPath = path.join(dirPath, entry.name);
            const zipName = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
            if (entry.name === 'templatize-manifest.json') continue; // exclude
            if (entry.isDirectory()) {
                addDir(fullPath, zipName);
            } else {
                zip.addFile(zipName, fs.readFileSync(fullPath));
            }
        }
    };
    addDir(stagingPath, '');

    const zipBuffer = zip.toBuffer();

    // Submit to Curator
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    const catalogPath = CATALOG_PATH;

    // Read camporee.json from zip to extract metadata
    const camporeeEntry = zip.getEntry('camporee.json');
    if (!camporeeEntry) {
        console.error('ERROR: camporee.json not found in staged workspace.');
        process.exit(1);
    }
    const camporee = JSON.parse(camporeeEntry.getData().toString('utf8'));
    const meta = camporee.meta || {};
    const tmpl = manifest.template_meta || {};
    const gameCount = zip.getEntries().filter(e =>
        e.entryName.startsWith('games/') && e.entryName.endsWith('.json')
    ).length;

    const templateId = randomUUID();
    const templateZipPath = path.join(TEMPLATES_DIR, `${templateId}.zip`);
    fs.writeFileSync(templateZipPath, zipBuffer);

    // Update catalog
    let catalog = [];
    try { catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')); } catch {}
    catalog.push({
        id:          templateId,
        title:       tmpl.title       || meta.title  || 'Untitled Template',
        description: tmpl.description || '',
        theme:       meta.theme       || '',
        year:        meta.year        || null,
        tags:        tmpl.tags        || [],
        gameCount,
        submittedBy: 'templatize-script',
        submittedAt: new Date().toISOString(),
    });
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

    // Clean up staging
    fs.rmSync(stagingPath, { recursive: true, force: true });
    console.log(`\nTemplate submitted to Curator:`);
    console.log(`  Template ID : ${templateId}`);
    console.log(`  Title       : ${tmpl.title || meta.title || 'Untitled Template'}`);
    console.log(`  Games       : ${gameCount}`);
    console.log(`  Zip         : ${templateZipPath}`);
    console.log(`\nStaging workspace cleaned up.`);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function listStaging() {
    if (!fs.existsSync(STAGING_DIR)) {
        console.log('No staging directory found. Nothing in progress.');
        return;
    }
    const entries = fs.readdirSync(STAGING_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory());
    if (!entries.length) {
        console.log('No staging workspaces found.');
        return;
    }
    console.log('Staging workspaces:');
    for (const e of entries) {
        const manifestPath = path.join(STAGING_DIR, e.name, 'templatize-manifest.json');
        let info = '';
        if (fs.existsSync(manifestPath)) {
            const m = readJson(manifestPath);
            info = ` — ${m.source || ''} (${m.createdAt?.slice(0, 10) || '?'})`;
        }
        console.log(`  ${e.name}${info}`);
    }
}

function cleanStaging(stagingId) {
    const stagingPath = path.join(STAGING_DIR, stagingId);
    if (!fs.existsSync(stagingPath)) {
        console.error(`Staging workspace not found: ${stagingId}`);
        process.exit(1);
    }
    fs.rmSync(stagingPath, { recursive: true, force: true });
    console.log(`Deleted staging workspace: ${stagingId}`);
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function usage() {
    console.log(`
Usage:
  node scripts/templatize.js --workspace <uuid>    Analyze a Composer workspace
  node scripts/templatize.js --zip <path>          Analyze a cartridge zip
  node scripts/templatize.js --apply <staging-id>  Submit staged template to Curator
  node scripts/templatize.js --list                List staging workspaces
  node scripts/templatize.js --clean <staging-id>  Delete a staging workspace
`.trim());
}

if (args[0] === '--workspace' && args[1]) {
    const workspaceId = args[1];
    const workspacePath = path.isAbsolute(workspaceId)
        ? workspaceId
        : path.join(WORKSPACE_PATH, workspaceId);
    if (!fs.existsSync(workspacePath)) {
        console.error(`Workspace not found: ${workspacePath}`);
        process.exit(1);
    }
    runAnalyze(workspacePath, false).catch(err => { console.error(err); process.exit(1); });

} else if (args[0] === '--zip' && args[1]) {
    const zipPath = path.isAbsolute(args[1]) ? args[1] : path.join(process.cwd(), args[1]);
    if (!fs.existsSync(zipPath)) {
        console.error(`Zip file not found: ${zipPath}`);
        process.exit(1);
    }
    runAnalyze(zipPath, true).catch(err => { console.error(err); process.exit(1); });

} else if (args[0] === '--apply' && args[1]) {
    runApply(args[1]).catch(err => { console.error(err); process.exit(1); });

} else if (args[0] === '--list') {
    listStaging();

} else if (args[0] === '--clean' && args[1]) {
    cleanStaging(args[1]);

} else {
    usage();
    process.exit(1);
}
