import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';

// Connect to DB
const dbPath = path.join(process.cwd(), 'data', 'camporee.db');
const db = new Database(dbPath);

console.log('🌱 Seeding dummy scores...');

try {
    // 1. Create a pool of Judges
    const judgeData = [
        { name: 'Judge Dredd', email: 'dredd@mega-city.com', unit: 'Hall of Justice' },
        { name: 'Judge Judy', email: 'judy@tv.com', unit: 'CBS' },
        { name: 'Simon Cowell', email: 'simon@idol.com', unit: 'Sony Music' },
        { name: 'Gordon Ramsay', email: 'gordon@kitchen.com', unit: 'Hell\'s Kitchen' }
    ];

    const judgeIds = [];
    const upsertJudge = db.prepare(`
        INSERT INTO judges (name, email, unit)
        VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET name=excluded.name
        RETURNING id
    `);

    judgeData.forEach(j => {
        const res = upsertJudge.run(j.name, j.email, j.unit);
        judgeIds.push(res.id);
    });
    console.log(`   Prepared ${judgeIds.length} judges.`);

    // 2. Get some Entities (Patrols)
    const entities = db.prepare("SELECT id, name FROM entities WHERE type='patrol' LIMIT 5").all();

    if (entities.length === 0) {
        throw new Error("No patrols found! Run 'npm run import:roster' first.");
    }

    // 3. Insert Scores
    const insertScore = db.prepare(`
        INSERT INTO scores (uuid, game_id, entity_id, score_payload, timestamp, judge_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    let count = 0;

    // START LOOP
    entities.forEach((entity, idx) => {
        const payload = JSON.stringify({
            attempt_friction_fire: Math.floor(Math.random() * 5) + 1,
            ignite_tinder: Math.floor(Math.random() * 5) + 1,
            water_boils: Math.floor(Math.random() * 5) + 1,
            judge_notes: "Automatically seeded demo score."
        });

        // Cycle through judges
        const judgeId = judgeIds[idx % judgeIds.length];

        insertScore.run(
            randomUUID(),
            'p1',
            entity.id,
            payload,
            Date.now(),
            judgeId
        );
        count++;
    });
    // END LOOP (This brace was likely missing or mismatched)

    console.log(`✅ Successfully seeded ${count} dummy scores.`);

} catch (err) { // END TRY
    console.error('❌ Seeding failed:', err);
}