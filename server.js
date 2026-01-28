import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Database Setup
const db = new Database(path.join(dataDir, 'camporee.db'));

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('patrol', 'troop')) NOT NULL,
    troop_number TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS judges (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    unit TEXT
  );

  CREATE TABLE IF NOT EXISTS scores (
    uuid TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    score_payload TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    judge_id INTEGER,
    FOREIGN KEY(entity_id) REFERENCES entities(id),
    FOREIGN KEY(judge_id) REFERENCES judges(id)
  );
`);

// Seed Entities if empty
const entCount = db.prepare('SELECT count(*) as count FROM entities').get();
if (entCount.count === 0) {
  // Basic seed if no roster imported
  const insert = db.prepare('INSERT INTO entities (id, name, type, troop_number) VALUES (?, ?, ?, ?)');
  const seedData = [
    [101, 'Flaming Flamingoes', 'patrol', '101'],
    [201, 'Troop 101', 'troop', '101']
  ];
  const transaction = db.transaction((data) => {
    for (const row of data) insert.run(row);
  });
  transaction(seedData);
}

app.use(express.json());
app.use(express.static('public'));

// --- API ROUTES ---

// 1. GET /games.json (Configuration)
app.get('/games.json', (req, res) => {
  try {
    const configDir = path.join(__dirname, 'config');
    const commonPath = path.join(configDir, 'common.json');
    const gamesDir = path.join(configDir, 'games');

    // Read common scoring
    let commonScoring = [];
    if (fs.existsSync(commonPath)) {
        commonScoring = JSON.parse(fs.readFileSync(commonPath, 'utf-8'));
    }

    // Read games
    const games = [];
    if (fs.existsSync(gamesDir)) {
      const files = fs.readdirSync(gamesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(gamesDir, file), 'utf-8');
          games.push(JSON.parse(content));
        }
      }
    }

    // Sort games by "Game N" number, placing Exhibition last
    games.sort((a, b) => {
        const getNum = (str) => {
            const match = str.match(/(?:Game|p)\s*(\d+)/i);
            return match ? parseInt(match[1], 10) : Infinity;
        };

        const numA = getNum(a.name) !== Infinity ? getNum(a.name) : getNum(a.id);
        const numB = getNum(b.name) !== Infinity ? getNum(b.name) : getNum(b.id);

        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
    });

    res.json({
      metadata: { version: "1.0", generated_at: new Date().toISOString() },
      common_scoring: commonScoring,
      games: games
    });
  } catch (err) {
    console.error('Error serving games.json:', err);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// 2. GET /api/entities (THE MISSING ROUTE!)
app.get('/api/entities', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM entities ORDER BY troop_number ASC, name ASC');
    const rows = stmt.all();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching entities:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 3. POST /api/score (Submit Score)
app.post('/api/score', (req, res) => {
  const { uuid, game_id, entity_id, score_payload, timestamp, judge_name, judge_email, judge_unit } = req.body;

  if (!uuid || !game_id || !entity_id || !score_payload) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const transaction = db.transaction(() => {
        let judgeId = null;

        if (judge_email) {
            const getJudge = db.prepare('SELECT id FROM judges WHERE email = ?');
            const existingJudge = getJudge.get(judge_email);

            if (existingJudge) {
                judgeId = existingJudge.id;
            } else if (judge_name) {
                const insertJudge = db.prepare('INSERT INTO judges (name, email, unit) VALUES (?, ?, ?)');
                const info = insertJudge.run(judge_name, judge_email, judge_unit || null);
                judgeId = info.lastInsertRowid;
            }
        }

        const insert = db.prepare(`
          INSERT OR IGNORE INTO scores (uuid, game_id, entity_id, score_payload, timestamp, judge_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        return insert.run(uuid, game_id, entity_id, JSON.stringify(score_payload), timestamp, judgeId);
    });

    const result = transaction();
    if (result.changes === 0) return res.status(200).json({ status: 'already_exists' });

    res.status(201).json({ status: 'success' });

  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 4. Admin & Export Routes
app.get('/api/admin/all-data', (req, res) => {
  try {
    const rows = db.prepare(`
        SELECT s.uuid, s.game_id, s.timestamp, e.name as entity_name, e.troop_number, e.type as entity_type, s.score_payload
        FROM scores s JOIN entities e ON s.entity_id = e.id
    `).all();

    // Parse JSON payloads for display
    const parsed = rows.map(r => ({ ...r, score_payload: JSON.parse(r.score_payload) }));

    const stats = {};
    parsed.forEach(r => {
        stats[r.game_id] = (stats[r.game_id] || 0) + 1;
    });

    res.json({ scores: parsed, stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN: RESET DATA
app.delete('/api/admin/data', (req, res) => {
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM scores').run();
            // Optional: db.prepare('DELETE FROM entities').run(); // Determine if we want to nuke entities too
        })();
        res.json({ success: true, message: 'Scores deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// POST /api/entities (Create new Troop or Patrol)
app.post('/api/entities', (req, res) => {
  const { name, type, troop_number } = req.body;

  if (!name || !type || !troop_number) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const insert = db.prepare('INSERT INTO entities (name, type, troop_number) VALUES (?, ?, ?)');
    const info = insert.run(name, type, troop_number);
    res.json({ id: info.lastInsertRowid, name, type, troop_number });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});