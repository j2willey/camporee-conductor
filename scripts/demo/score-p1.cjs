const { getContext } = require('./utils.cjs');

const gameId = "p1";
const gameName = "Boiling the Ocean";
const patrols = [
  {
    "name": "Spooky Shrimp",
    "scores": {
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "water_boils": 5,
      "extinguish_fire_reset": 2,
      "matches_used_count": "x",
      "time_to_boil_or_n_a_mm_ss": 0.40625
    }
  },
  {
    "name": "Shadow Panther",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 2,
      "ignite_kindling": 2,
      "extinguish_fire_reset": 5,
      "matches_used_count": 2
    }
  },
  {
    "name": "Grease Fires",
    "scores": {
      "patrol_yell": 5,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "extinguish_fire_reset": 5,
      "matches_used_count": 5
    }
  },
  {
    "name": "Ducks",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "water_boils": 5,
      "extinguish_fire_reset": 5,
      "time_to_boil_or_n_a_mm_ss": 0.24722222222222223
    }
  },
  {
    "name": "Raptors",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 3,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "water_boils": 5,
      "extinguish_fire_reset": 4,
      "time_to_boil_or_n_a_mm_ss": 0.5625
    }
  },
  {
    "name": "Eggos",
    "scores": {
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "water_boils": 5,
      "extinguish_fire_reset": 5,
      "time_to_boil_or_n_a_mm_ss": 0.41597222222222224
    }
  },
  {
    "name": "Card Board Boxes",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "water_boils": 5,
      "extinguish_fire_reset": 5,
      "time_to_boil_or_n_a_mm_ss": 0.6034722222222222
    }
  },
  {
    "name": "Space Pirates",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "water_boils": 5,
      "extinguish_fire_reset": 5,
      "time_to_boil_or_n_a_mm_ss": 0.5
    }
  },
  {
    "name": "Krabbie Patties",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "water_boils": 5,
      "extinguish_fire_reset": 5,
      "matches_used_count": "2x",
      "time_to_boil_or_n_a_mm_ss": 0.2673611111111111
    }
  },
  {
    "name": "Wolf Warriors",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 4,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 5,
      "extinguish_fire_reset": 5
    }
  },
  {
    "name": "Fearless Firebirds",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "attempt_friction_fire": 4,
      "charing_or_powder": 2,
      "smoke": 2,
      "ember": 2,
      "ignite_tinder": 5,
      "ignite_kindling": 3,
      "water_boils": 2,
      "extinguish_fire_reset": 4,
      "matches_used_count": 1
    }
  }
];
const fieldConfigs = [{"id":"attempt_friction_fire","label":"Attempt Friction Fire","type":"number","min":0,"max":5,"defaultValue":0},{"id":"charing_or_powder","label":"charing or powder","type":"number","min":0,"max":5,"defaultValue":0},{"id":"smoke","label":"smoke","type":"number","min":0,"max":5,"defaultValue":0},{"id":"ember","label":"ember","type":"number","min":0,"max":5,"defaultValue":0},{"id":"ignite_tinder","label":"Ignite tinder","type":"number","min":0,"max":5,"defaultValue":0},{"id":"ignite_kindling","label":"ignite kindling","type":"number","min":0,"max":5,"defaultValue":0},{"id":"water_boils","label":"water boils","type":"number","min":0,"max":5,"defaultValue":0},{"id":"extinguish_fire_reset","label":"Extinguish fire & reset","type":"number","min":0,"max":5,"defaultValue":0},{"id":"matches_used_count","label":"Matches Used\n(Count)","type":"number","min":0,"max":20,"defaultValue":0,"excludeFromTotal":true},{"id":"time_to_boil_or_n_a_mm_ss","label":"Time to Boil or N.A.\n\nmm:ss","type":"time_mm_ss","excludeFromTotal":true},{"id":"judges_points_calc","label":"Calculated Points","type":"number","adminOnly":true},{"id":"patrol_flag","label":"Patrol Flag?","sortOrder":1,"type":"range","min":0,"max":5,"defaultValue":0},{"id":"patrol_yell","label":"Patrol Yell?","sortOrder":2,"type":"range","min":0,"max":5,"defaultValue":0},{"id":"patrol_spirit","label":"Patrol Spirit","sortOrder":3,"type":"range","min":0,"max":5,"defaultValue":0},{"id":"unscoutlike","label":"Un-Scout-like Behavior (Penalty)","sortOrder":998,"type":"number","min":0,"max":100,"helperText":"Enter POSITIVE number to deduct points","defaultValue":0},{"id":"judge_notes","label":"Judge Notes / Comments","sortOrder":999,"type":"textarea","placeholder":"Optional notes on performance..."}];

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    for (const p of patrols) {
        console.log(`--- Scoring Patrol: ${p.name} ---`);

        // 1. Select Game
        console.log(`Selecting Game ${gameId} (${gameName})...`);
        await page.click(`button:has-text("${gameName}")`);
        await sleep(waitTime);

        // 2. Select Patrol
        console.log(`Selecting Patrol ${p.name}...`);
        await page.click(`div.list-group-item:has-text("${p.name}")`);
        await sleep(waitTime);

        // 3. Fill Scores
        console.log(`Filling scores for ${p.name}...`);
        for (const [fieldId, val] of Object.entries(p.scores)) {
            const field = fieldConfigs.find(f => f.id === fieldId);
            if (!field) continue;

            if (field.type === 'time_mm_ss') {
                let mm = '00', ss = '00';
                if (typeof val === 'number') {
                    const totalSeconds = Math.round(val * 24 * 60 * 60);
                    mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
                    ss = String(totalSeconds % 60).padStart(2, '0');
                } else if (String(val).includes(':')) {
                    const parts = String(val).split(':');
                    mm = (parts[0] || '00').padStart(2, '0');
                    ss = (parts[1] || '00').padStart(2, '0');
                }
                await page.fill(`#f_${fieldId}_mm`, mm);
                await page.fill(`#f_${fieldId}_ss`, ss);
            } else if (field.type === 'boolean') {
                await page.fill(`#f_${fieldId}`, val === true || val === 'true' || val === 1 ? '1' : '0');
            } else if (field.type === 'number') {
                let cleanVal = String(val).trim();
                let num = parseFloat(cleanVal);
                if (isNaN(num)) {
                    // Common convention: 'x' means 1 or 'checked'
                    if (cleanVal.toLowerCase() === 'x') num = 1;
                    else {
                        // Try to extract first number found (e.g. "5 pts" -> 5)
                        const match = cleanVal.match(/\d+/); // Double escaped for template string
                        num = match ? parseInt(match[0]) : 0;
                    }
                }
                // Also handle cases where a space or negative sign might be weird
                await page.fill(`#f_${fieldId}`, String(Math.max(0, num)));
            } else {
                await page.fill(`#f_${fieldId}`, String(val));
            }
            await sleep(waitTime / 2);
        }

        // 4. Submit
        console.log("Submitting...");
        const dialogHandler = async dialog => { await dialog.accept(); };
        page.on('dialog', dialogHandler);
        await page.click('#btn-submit');

        // Wait for page to navigate back to station list
        await sleep(waitTime * 2);
        page.off('dialog', dialogHandler);
    }

    await finish();
}

run().catch(console.error);
