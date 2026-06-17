/**
 * scripts/seed-demo-composer.js
 *
 * Seeds the Demo Composer workspace from the Circus 2026 cartridge ZIP.
 * Extracts camporee.json + presets.json + games/*.json into the demo workspace dir
 * so the read-only demo has content on first boot and after nightly resets.
 *
 * Run inside the demo-composer container:
 *   docker exec camporee-demo-composer node scripts/seed-demo-composer.js
 *
 * Nightly cron (VPS crontab) — run after seed-demo to keep cartridge in sync:
 *   30 3 * * * docker exec camporee-demo-composer node scripts/seed-demo-composer.js >> /var/log/seed-demo-composer.log 2>&1
 *
 * Required env (set in docker-compose):
 *   DEMO_CARTRIDGE_PATH   path to CamporeeConfig.zip inside the container
 *   WORKSPACE_PATH        root dir for composer workspaces
 *   DEMO_WORKSPACE_UUID   UUID used as the workspace directory name
 */

import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.join(__dirname, '..');

const CARTRIDGE_PATH = process.env.DEMO_CARTRIDGE_PATH;
if (!CARTRIDGE_PATH) {
    console.error('[seed-demo-composer] ERROR: DEMO_CARTRIDGE_PATH env var is required');
    process.exit(1);
}
if (!fs.existsSync(CARTRIDGE_PATH)) {
    console.error(`[seed-demo-composer] ERROR: Cartridge not found at ${CARTRIDGE_PATH}`);
    process.exit(1);
}

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || path.join(APP_ROOT, 'data', 'composer');
const DEMO_WORKSPACE_UUID = process.env.DEMO_WORKSPACE_UUID || 'd0000000-0000-4000-0000-000000000001';
const workspaceDir = path.join(WORKSPACE_PATH, DEMO_WORKSPACE_UUID);

console.log(`[seed-demo-composer] ${new Date().toISOString()}`);
console.log(`[seed-demo-composer] Cartridge  : ${CARTRIDGE_PATH}`);
console.log(`[seed-demo-composer] Workspace  : ${workspaceDir}`);

fs.rmSync(workspaceDir, { recursive: true, force: true });
fs.mkdirSync(workspaceDir, { recursive: true });
new AdmZip(CARTRIDGE_PATH).extractAllTo(workspaceDir, true);

const gamesDir = path.join(workspaceDir, 'games');
const gameCount = fs.existsSync(gamesDir)
    ? fs.readdirSync(gamesDir).filter(f => f.endsWith('.json')).length
    : 0;

console.log('[seed-demo-composer] Done');
console.log(`  UUID      : ${DEMO_WORKSPACE_UUID}`);
console.log(`  Games     : ${gameCount}`);
