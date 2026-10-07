import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_DIR = path.join(__dirname, '..', 'schemas');
const DEFINITIONS_DIR = path.join(SCHEMA_DIR, 'definitions');
const OUTPUT_FILE = path.join(__dirname, '..', 'SCHEMA.md');

// Utility to read JSON schema
function readSchema(filepath) {
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

// Load all major schemas
const gameSchema = readSchema(path.join(SCHEMA_DIR, 'game.schema.json'));
const contentSchema = readSchema(path.join(DEFINITIONS_DIR, 'content.schema.json'));
const scoringSchema = readSchema(path.join(DEFINITIONS_DIR, 'scoring.schema.json'));
const camporeeInstanceSchema = readSchema(path.join(SCHEMA_DIR, 'camporee-instance.schema.json'));
const presetSchema = readSchema(path.join(SCHEMA_DIR, 'preset.schema.json'));
const libraryCatalogSchema = readSchema(path.join(SCHEMA_DIR, 'library-catalog.schema.json'));
const camporeeCatalogSchema = readSchema(path.join(SCHEMA_DIR, 'camporee-catalog.schema.json'));

let markdown = `# Camporee Conductor Data Schemas\n\n`;
markdown += `This document is auto-generated from the \`schemas/*.json\` files. It describes the structure of game templates and scoring models across the application.\n\n`;

function generateTable(properties, requiredList = []) {
    let table = `| Field | Type | Required | Description |\n`;
    table += `| :--- | :--- | :---: | :--- |\n`;

    for (const [key, details] of Object.entries(properties || {})) {
        let typeStr = details.type || '';

        // Handle anyOf types (like library_uuid allowing empty string or UUID)
        if (details.anyOf) {
            typeStr = 'string (uuid or empty)';
        }

        if (typeStr === 'array' && details.items && details.items.type) {
            typeStr = `${details.items.type}[]`;
        }

        if (details.enum) {
            typeStr += `<br>_Enum:_ \`${details.enum.join('`, `')}\``;
        }

        const isRequired = requiredList.includes(key) ? '✅' : '❌';

        let desc = details.description || '';
        if (details.default !== undefined) {
            desc += ` _(Default: ${JSON.stringify(details.default)})_`;
        }

        // If it's a ref or has properties, mention it's an object
        if (details.$ref) {
            typeStr = 'object';
            desc = `See **${key} Object** definitions below.`;
        } else if (details.type === 'object' && details.properties) {
            desc += ` <br>(Contains nested properties, see below or source for details)`;
        }

        table += `| \`${key}\` | ${typeStr} | ${isRequired} | ${desc} |\n`;
    }
    return table + `\n`;
}

// 1. Root Game Schema
if (gameSchema) {
    markdown += `## 1. Game Definition Schema\n\n`;
    markdown += `${gameSchema.description || 'Root schema object for Active Events and Curator Library Games.'}\n\n`;
    markdown += generateTable(gameSchema.properties, gameSchema.required);
}

// 2. Content Schema ($ref)
if (contentSchema) {
    markdown += `## 2. Content Object\n\n`;
    markdown += `${contentSchema.description || 'Heavy narrative text and logistics for human consumption.'}\n\n`;
    markdown += generateTable(contentSchema.properties, contentSchema.required);

    // Add logistics sub-table
    if (contentSchema.properties.logistics && contentSchema.properties.logistics.properties) {
        markdown += `### Logistics Sub-Object\n\n`;
        markdown += generateTable(contentSchema.properties.logistics.properties, []);
    }
}

// 3. Scoring Schema ($ref)
if (scoringSchema) {
    markdown += `## 3. Scoring Model Object\n\n`;
    markdown += `${scoringSchema.description || 'Defines how the game is scored by judges and tallied.'}\n\n`;
    markdown += generateTable(scoringSchema.properties, scoringSchema.required);

    // Inputs array
    if (scoringSchema.properties.inputs && scoringSchema.properties.inputs.items && scoringSchema.properties.inputs.items.properties) {
        markdown += `### Scoring Inputs Array Items\n\n`;
        markdown += `Every item inside the \`inputs\` array follows this structure:\n\n`;
        markdown += generateTable(scoringSchema.properties.inputs.items.properties, scoringSchema.properties.inputs.items.required);

        // Config object inside inputs
        const configProps = scoringSchema.properties.inputs.items.properties.config;
        if (configProps && configProps.properties) {
            markdown += `#### Config Sub-Object (Type-Specific Constraints)\n\n`;
            markdown += generateTable(configProps.properties, []);
        }
    }
}

// Generic recursive renderer for schemas not already hand-rolled above.
// Walks nested objects and arrays-of-objects, emitting a subsection per level
// instead of just "(Contains nested properties, see below or source for details)".
function renderObjectSchema(title, schema, level) {
    if (!schema) return '';
    const hashes = '#'.repeat(level);
    let out = `${hashes} ${title}\n\n`;
    if (schema.description) out += `${schema.description}\n\n`;
    out += generateTable(schema.properties, schema.required);

    for (const [key, details] of Object.entries(schema.properties || {})) {
        if (details.$ref) continue; // already rendered elsewhere by name
        if (details.type === 'object' && details.properties) {
            out += renderObjectSchema(`${key} Object`, details, level + 1);
        } else if (details.type === 'object' && details.additionalProperties && details.additionalProperties.properties) {
            // keyed map of objects (e.g. type_defaults keyed by league id)
            out += renderObjectSchema(`${key} Value Shape (keyed by league id)`, details.additionalProperties, level + 1);
        } else {
            const items = details.items;
            if (items && items.type === 'object' && items.properties) {
                out += renderObjectSchema(`${key} Array Items`, items, level + 1);
            }
        }
    }
    return out;
}

// 4. Camporee Instance (Manifest) Schema
if (camporeeInstanceSchema) {
    markdown += `## 4. Camporee Event Configuration (Manifest)\n\n`;
    markdown += `${camporeeInstanceSchema.description || 'The camporee.json manifest inside a cartridge zip — event metadata, terminology, leagues, rosters, and the game playlist.'}\n\n`;
    markdown += generateTable(camporeeInstanceSchema.properties, camporeeInstanceSchema.required);
    // Walk nested object/array-of-object properties as ### subsections
    for (const [key, details] of Object.entries(camporeeInstanceSchema.properties || {})) {
        if (details.type === 'object' && details.properties) {
            markdown += renderObjectSchema(`${key} Object`, details, 3);
        } else if (details.type === 'object' && details.additionalProperties && details.additionalProperties.properties) {
            markdown += renderObjectSchema(`${key} Value Shape (keyed by league id)`, details.additionalProperties, 3);
        } else if (details.items && details.items.type === 'object' && details.items.properties) {
            markdown += renderObjectSchema(`${key} Array Items`, details.items, 3);
        }
    }
}

// 5. Common Field Preset Schema
if (presetSchema) {
    markdown += `## 5. Common Field Preset\n\n`;
    markdown += `${presetSchema.description || ''}\n\n`;
    markdown += generateTable(presetSchema.properties, presetSchema.required);
    if (presetSchema.properties.config && presetSchema.properties.config.properties) {
        markdown += `### config Object\n\n`;
        markdown += generateTable(presetSchema.properties.config.properties, []);
    }
}

// 6. Game Library Index Schema (Curator game-list catalog)
if (libraryCatalogSchema) {
    markdown += `## 6. Game Library Index\n\n`;
    markdown += `${libraryCatalogSchema.description || 'Index of games in the Curator game library — used for browse/search without loading every full game file.'}\n\n`;
    markdown += generateTable(libraryCatalogSchema.properties, libraryCatalogSchema.required);
    if (libraryCatalogSchema.properties.games && libraryCatalogSchema.properties.games.items) {
        markdown += `### games Array Items\n\n`;
        markdown += generateTable(libraryCatalogSchema.properties.games.items.properties, libraryCatalogSchema.properties.games.items.required);
    }
}

// 7. Camporee Archive Index Schema (Curator template catalog)
if (camporeeCatalogSchema) {
    markdown += `## 7. Camporee Archive Index\n\n`;
    markdown += `${camporeeCatalogSchema.description || 'Index of archived camporee cartridges — used for browse/search without unpacking every zip.'}\n\n`;
    markdown += generateTable(camporeeCatalogSchema.properties, camporeeCatalogSchema.required);
    if (camporeeCatalogSchema.properties.camporees && camporeeCatalogSchema.properties.camporees.items) {
        markdown += `### camporees Array Items\n\n`;
        markdown += generateTable(camporeeCatalogSchema.properties.camporees.items.properties, camporeeCatalogSchema.properties.camporees.items.required);
    }
}

fs.writeFileSync(OUTPUT_FILE, markdown);
console.log(`Generated concise documentation at ${OUTPUT_FILE}`);
