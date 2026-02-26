import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const GAMES_DIR = path.join(__dirname, '..', 'data', 'composer', 'workspaces', 'camp0002', 'games');

const turndownService = new TurndownService({ headingStyle: 'atx' });

// Ensure bolding and bullets map well
turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => '~' + content + '~'
});

async function run() {
    console.log('--- Starting DOCX import to camp0002 ---');
    const files = fs.readdirSync(SCRATCH_DIR).filter(f => f.endsWith('.docx'));

    for (const file of files) {
        // Matches PG 1, P 1, PG1, PG10, etc and strips it from the title
        const match = file.match(/^PG?\s*(\d+)\s*[-:]\s*(.*?)(_\.docx|\.docx)$/i);
        if (!match) {
            console.log(`⚠️  Skipping ${file}, does not match expected format.`);
            continue;
        }

        const gameId = `p${match[1]}`;
        // Clean up trailing underscores or weird characters from title
        const gameTitle = match[2].trim().replace(/_+$/, '');

        const docxPath = path.join(SCRATCH_DIR, file);
        const { value: html } = await mammoth.convertToHtml({ path: docxPath });
        const markdown = turndownService.turndown(html);

        const sections = extractSections(markdown);

        await updateGameJson(gameId, gameTitle, sections);
    }
}

function extractSections(md) {
    const lines = md.split('\n');
    const sections = {};
    let currentHeader = 'unassigned';
    let currentContent = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Mammoth turns Word headers into H1/H2, which Turndown converts to # or ##
        const headerMatch = line.match(/^#{1,3}\s+(.+)$/);

        if (headerMatch) {
            if (currentContent.length > 0) {
                sections[currentHeader] = currentContent.join('\n').trim();
            }
            // Normalize header names: lowercase, alphanumeric only
            currentHeader = headerMatch[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    }

    if (currentContent.length > 0) {
        sections[currentHeader] = currentContent.join('\n').trim();
    }

    return sections;
}

async function updateGameJson(gameId, gameTitle, sections) {
    const jsonPath = path.join(GAMES_DIR, `${gameId}.json`);
    if (!fs.existsSync(jsonPath)) {
        console.log(`❌  Game JSON not found: ${gameId}.json (${gameTitle})`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    data.game_title = gameTitle;
    if (!data.content) data.content = {};
    if (!data.content.logistics) data.content.logistics = {};

    const content = data.content;
    const logistics = content.logistics;

    // Helper to find mapped sections
    const getSec = (...keys) => {
        for (let k of keys) {
            for (let secK in sections) {
                if (secK.includes(k)) { // e.g., 'timeandscoring' includes 'scoring'
                    return sections[secK];
                }
            }
        }
        return '';
    };

    const legend = getSec('story');
    // The user had placeholder text in many story headers, we strip it.
    if (legend) content.legend = legend.replace(/^\(\s*be creative.*?\)\s*/im, '').trim();

    const quest = getSec('challenge');
    if (quest) content.quest = quest;

    const briefing = getSec('description');
    if (briefing) content.briefing = briefing;

    const scoringOverview = getSec('timeandscoring');
    if (scoringOverview) content.scoring_overview = scoringOverview;

    const rulesStr = getSec('rules');
    if (rulesStr) {
        // Convert rules to an array, stripping out markdown bullets
        content.rules = rulesStr.split('\n')
            .filter(l => l.trim().length > 0)
            .map(l => l.replace(/^[*+-]\s*/, '').trim());
    }

    const judgingNotes = getSec('scoringnotes');
    if (judgingNotes) content.judging_notes = judgingNotes;

    const setup = getSec('setup');
    if (setup) logistics.setup = setup;

    const supplies = getSec('supplies');
    if (supplies) logistics.supplies_text = supplies;

    const staffing = getSec('staffing');
    if (staffing) logistics.staffing = staffing;

    const notes = getSec('notes');
    if (notes) content.notes = notes;

    const references = getSec('references');
    if (references) content.references = references;

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`✅  Updated ${gameId}.json (${gameTitle})`);
}

run().catch(console.error);
