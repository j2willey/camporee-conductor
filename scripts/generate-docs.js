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

fs.writeFileSync(OUTPUT_FILE, markdown);
console.log(`Generated concise documentation at ${OUTPUT_FILE}`);
