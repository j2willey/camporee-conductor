/**
 * Imports a CamporeeConfig.zip into the Curator template library.
 *
 * Run inside the composer container:
 *   docker exec camporee-composer node scripts/import-curator-template.js /path/to/zip
 *
 * On the VPS, stage the zip somewhere the composer container can see it:
 *   cp /tmp/CamporeeConfig.zip /opt/camporee-conductor-data/curator/import.zip
 *   docker exec camporee-composer node scripts/import-curator-template.js /app/data/library/import.zip
 *   rm /opt/camporee-conductor-data/curator/import.zip
 */

import fs from 'fs';
import { submit } from '../src/lib/curator-service.js';

const [,, zipPath] = process.argv;
if (!zipPath) {
    console.error('Usage: node scripts/import-curator-template.js <path-to-zip>');
    process.exit(1);
}
if (!fs.existsSync(zipPath)) {
    console.error(`File not found: ${zipPath}`);
    process.exit(1);
}

const buf = fs.readFileSync(zipPath);
const { id } = submit(buf, 'system-import');
console.log(`Curator template imported: ${id}`);
