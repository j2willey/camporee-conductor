/**
 * One-time migration: Camporee schema v2.9 → v3.0
 *
 * Transformations applied:
 *   camporee.json — schemaVersion, terminology, leagues, sessions, rosters, type_defaults keys
 *   games/*.json  — type → league, remove type, add session: null
 *   presets.json  — add tier field to each preset
 *
 * Safe to re-run: files already at schemaVersion "3.0" are skipped.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_TO_LEAGUE = {
  patrol: 'patrol-games',
  troop: 'troop-challenges',
  exhibition: 'exhibition',
};

const DEFAULT_TERMINOLOGY = {
  unit: 'Troop',
  subunit: 'Patrol',
  member: 'Scout',
  event: 'Camporee',
  organizer: 'Event Director',
};

const DEFAULT_LEAGUES = [
  { id: 'patrol-games',     label: 'Patrol Games',       tier: 'subunit', registration: 'registered', divisions: [] },
  { id: 'exhibition',       label: 'Exhibition Events',  tier: 'subunit', registration: 'registered', divisions: [] },
  { id: 'troop-challenges', label: 'Troop Challenges',   tier: 'unit',    registration: 'registered', divisions: [] },
];

const DEFAULT_EXHIBITION_TYPE_DEFAULT = {
  prefix: [],
  suffix: ['off_score', 'final_rank', 'overall_points'],
};

// Preset id → tier assignment per CAMPOREESCHEMA.md §3
const PRESET_TIER_MAP = {
  p_flag:         'subunit',
  p_yell:         'subunit',
  p_spirit:       'subunit',
  ten_ess:        'subunit',
  unscout:        'subunit',
  off_notes:      'subunit',
  off_score:      'all',
  final_rank:     'all',
  overall_points: 'all',
};

// ─── Migration helpers ────────────────────────────────────────────────────────

function migrateCamporeeJson(existing) {
  if (existing.schemaVersion === '3.0') return null; // already migrated

  // Migrate type_defaults keys: patrol → patrol-games, troop → troop-challenges
  const oldTd = existing.type_defaults || {};
  const newTd = {};

  // patrol → patrol-games (prefer already-renamed key)
  if (oldTd['patrol-games'] !== undefined) {
    newTd['patrol-games'] = oldTd['patrol-games'];
  } else if (oldTd.patrol !== undefined) {
    newTd['patrol-games'] = oldTd.patrol;
  }

  // exhibition — always ensure present
  newTd.exhibition = oldTd.exhibition !== undefined
    ? oldTd.exhibition
    : { ...DEFAULT_EXHIBITION_TYPE_DEFAULT };

  // troop → troop-challenges
  if (oldTd['troop-challenges'] !== undefined) {
    newTd['troop-challenges'] = oldTd['troop-challenges'];
  } else if (oldTd.troop !== undefined) {
    newTd['troop-challenges'] = oldTd.troop;
  }

  // Preserve any unknown keys (forward-compat)
  const knownOldKeys = new Set(['patrol', 'troop', 'patrol-games', 'troop-challenges', 'exhibition']);
  for (const [k, v] of Object.entries(oldTd)) {
    if (!knownOldKeys.has(k)) newTd[k] = v;
  }

  return {
    schemaVersion: '3.0',
    meta: existing.meta,
    terminology: existing.terminology ?? { ...DEFAULT_TERMINOLOGY },
    leagues:  existing.leagues  ?? JSON.parse(JSON.stringify(DEFAULT_LEAGUES)),
    sessions: existing.sessions ?? [],
    rosters:  existing.rosters  ?? { units: [], subunits: [], individuals: [] },
    officials: existing.officials ?? [],
    playlist: existing.playlist,
    type_defaults: newTd,
  };
}

function migrateGameJson(existing) {
  if (existing.schemaVersion === '3.0') return null; // already migrated

  let league = existing.league; // may already be set if partially migrated
  if (!league) {
    if (existing.type) {
      league = TYPE_TO_LEAGUE[existing.type];
      if (!league) {
        console.warn(`    WARNING: Unknown game.type "${existing.type}" — defaulting to "patrol-games"`);
        league = 'patrol-games';
      }
    } else {
      console.warn(`    WARNING: No type or league on game "${existing.id || '(unknown)'}" — defaulting to "patrol-games"`);
      league = 'patrol-games';
    }
  }

  // Build output: spread all existing fields, omit type, set league/session/schemaVersion
  const { type: _removed, ...rest } = existing;
  return {
    ...rest,
    league,
    session: existing.session !== undefined ? existing.session : null,
    schemaVersion: '3.0',
  };
}

function migratePresetsJson(existing) {
  // Presets file may be a flat array or { presets: [...] }
  const isWrapped = !Array.isArray(existing) && Array.isArray(existing?.presets);
  const items = isWrapped ? existing.presets : existing;

  if (!Array.isArray(items)) {
    console.warn('    WARNING: Unexpected presets.json format — skipping');
    return null;
  }

  let changed = false;
  const migrated = items.map(preset => {
    if (preset.tier !== undefined) return preset; // already has tier

    const tier = PRESET_TIER_MAP[preset.id];
    if (tier === undefined) {
      console.warn(`    WARNING: Unrecognized preset id "${preset.id}" — defaulting to tier: "all"`);
    }
    changed = true;
    return { ...preset, tier: tier ?? 'all' };
  });

  if (!changed) return null;
  return isWrapped ? { ...existing, presets: migrated } : migrated;
}

// ─── File I/O helpers ────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ─── Directory walking ────────────────────────────────────────────────────────

/**
 * Recursively collect all camporee.json paths under baseDir.
 */
function findCamporeeJsonFiles(baseDir) {
  if (!existsSync(baseDir)) return [];
  const results = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry === 'camporee.json') {
        results.push(full);
      }
    }
  }

  walk(baseDir);
  return results;
}

// ─── Migration runner ─────────────────────────────────────────────────────────

const SEARCH_DIRS = [
  join(ROOT, 'data', 'curator'),
  join(ROOT, 'data', 'composer', 'workspaces'),
  join(ROOT, 'data', 'collator', 'active-event'),
];

let totalCamporee = 0;
let totalGames = 0;
let totalPresets = 0;
let skippedAlready = 0;

for (const baseDir of SEARCH_DIRS) {
  if (!existsSync(baseDir)) {
    console.log(`Skipping ${baseDir} (does not exist)`);
    continue;
  }

  const camporeeFiles = findCamporeeJsonFiles(baseDir);

  if (camporeeFiles.length === 0) {
    console.log(`No camporee.json files found in ${baseDir}`);
    continue;
  }

  for (const camporeeFile of camporeeFiles) {
    const eventDir = dirname(camporeeFile);
    console.log(`\nProcessing: ${camporeeFile}`);

    // ── camporee.json ──────────────────────────────────────────────────────
    const existingCamporee = readJson(camporeeFile);
    const migratedCamporee = migrateCamporeeJson(existingCamporee);
    if (migratedCamporee === null) {
      console.log('  camporee.json — already v3.0, skipped');
      skippedAlready++;
    } else {
      writeJson(camporeeFile, migratedCamporee);
      console.log('  camporee.json — migrated');
      totalCamporee++;
    }

    // ── games/*.json ───────────────────────────────────────────────────────
    const gamesDir = join(eventDir, 'games');
    if (existsSync(gamesDir)) {
      const gameFiles = readdirSync(gamesDir).filter(f => f.endsWith('.json'));
      for (const gameFile of gameFiles) {
        const gamePath = join(gamesDir, gameFile);
        const existingGame = readJson(gamePath);
        const migratedGame = migrateGameJson(existingGame);
        if (migratedGame === null) {
          console.log(`  games/${gameFile} — already v3.0, skipped`);
        } else {
          writeJson(gamePath, migratedGame);
          console.log(`  games/${gameFile} — migrated (league: ${migratedGame.league})`);
          totalGames++;
        }
      }
    } else {
      console.log('  games/ — directory not found, skipping');
    }

    // ── presets.json ───────────────────────────────────────────────────────
    const presetsPath = join(eventDir, 'presets.json');
    if (existsSync(presetsPath)) {
      const existingPresets = readJson(presetsPath);
      const migratedPresets = migratePresetsJson(existingPresets);
      if (migratedPresets === null) {
        console.log('  presets.json — already has tier fields, skipped');
      } else {
        writeJson(presetsPath, migratedPresets);
        console.log('  presets.json — migrated (tier fields added)');
        totalPresets++;
      }
    } else {
      console.log('  presets.json — not found, skipping');
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────');
console.log('Migration complete.');
console.log(`  camporee.json files migrated : ${totalCamporee}`);
console.log(`  game files migrated          : ${totalGames}`);
console.log(`  presets.json files migrated  : ${totalPresets}`);
if (skippedAlready > 0) {
  console.log(`  already at v3.0 (skipped)    : ${skippedAlready}`);
}
console.log('─────────────────────────────────────────');
