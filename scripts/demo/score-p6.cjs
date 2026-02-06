const { getContext } = require('./utils.cjs');

const gameId = "p6";
const gameName = "Compass Game";
const judgeInfo = {
    name: "Demo Judge 18",
    email: "demojudge18@acme.com",
    unit: "District"
};
const patrols = [
  {
    "name": "Spooky Shrimp",
    "scores": {
      "unscoutlike": -10,
      "patrol_flag": 5,
      "patrol_yell": 5,
      "start": 10,
      "target_destination": 6,
      "distance_from_target": -5,
      "flag_height": -6,
      "vball_width": -5,
      "timed": 0.20833333333333334
    }
  },
  {
    "name": "Atomic Duckies",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "start": 7,
      "target_destination": 17,
      "distance_from_target": -13,
      "flag_height": -1.5,
      "vball_width": -4,
      "timed": 0.1875
    }
  },
  {
    "name": "Orcas",
    "scores": {
      "patrol_yell": 5,
      "start": 10,
      "target_destination": 6,
      "distance_from_target": -8,
      "flag_height": -1,
      "vball_width": -1,
      "timed": 0.3958333333333333
    }
  },
  {
    "name": "Wolves",
    "scores": {
      "patrol_yell": 5,
      "start": 8,
      "target_destination": 16,
      "distance_from_target": -13,
      "flag_height": -2,
      "vball_width": -2.5,
      "timed": 0.22916666666666666
    }
  },
  {
    "name": "Goofy Goobers",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "start": 18,
      "target_destination": 5,
      "distance_from_target": -3,
      "flag_height": -0.5,
      "vball_width": -10,
      "timed": 0.3958333333333333
    }
  },
  {
    "name": "Fancy Frogs",
    "scores": {
      "patrol_yell": 5,
      "start": 10,
      "target_destination": 6,
      "distance_from_target": -1,
      "flag_height": -3.5,
      "vball_width": -13.5,
      "timed": 0.4166666666666667
    }
  },
  {
    "name": "Ice Dragons",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "start": 10,
      "target_destination": 6,
      "distance_from_target": -9,
      "flag_height": -2,
      "vball_width": -3.5,
      "timed": 0.2916666666666667
    }
  },
  {
    "name": "Wolf Warriors",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "start": 10,
      "target_destination": 6,
      "distance_from_target": -6,
      "flag_height": -5,
      "vball_width": -2,
      "timed": 0.1527777777777778
    }
  },
  {
    "name": "Falcons",
    "scores": {
      "patrol_flag": 5,
      "patrol_yell": 5,
      "start": 10,
      "target_destination": 6,
      "distance_from_target": -8,
      "flag_height": -7,
      "vball_width": -5,
      "timed": 0.4166666666666667
    }
  }
];
const fieldConfigs = [{"id":"patrol_flag","label":"Patrol Flag?","audience":"judge","sortOrder":1,"config":{"min":0,"max":5,"defaultValue":0},"type":"number","kind":"points","weight":1},{"id":"patrol_yell","label":"Patrol Yell?","audience":"judge","sortOrder":2,"config":{"min":0,"max":5,"defaultValue":0},"type":"number","kind":"points","weight":1},{"id":"patrol_spirit","label":"Patrol Spirit","audience":"judge","sortOrder":3,"config":{"min":0,"max":5,"defaultValue":0},"type":"number","kind":"points","weight":1},{"id":"check_folder_column_info_change","label":"Check folder Column info change","audience":"judge","sortOrder":900,"config":{},"type":"number","kind":"points","weight":1},{"id":"start","label":"Start","audience":"judge","sortOrder":900,"config":{},"type":"number","kind":"points","weight":1},{"id":"target_destination","label":"Target Destination","audience":"judge","sortOrder":900,"config":{},"type":"number","kind":"points","weight":1},{"id":"distance_from_target","label":"Distance from \nTarget","audience":"judge","sortOrder":900,"config":{},"type":"number","kind":"points","weight":1},{"id":"flag_height","label":"Flag Height","audience":"judge","sortOrder":900,"config":{},"type":"number","kind":"points","weight":1},{"id":"vball_width","label":"Vball width","audience":"judge","sortOrder":900,"config":{},"type":"number","kind":"points","weight":1},{"id":"timed","label":"Time\nmm:ss","audience":"judge","sortOrder":900,"config":{},"type":"stopwatch","kind":"points","weight":1},{"id":"time","label":"Time","audience":"judge","sortOrder":900,"config":{},"type":"stopwatch","kind":"points","weight":1},{"id":"unscoutlike","label":"Un-Scout-like Behavior (Penalty)","audience":"judge","sortOrder":998,"config":{"min":0,"max":100,"defaultValue":0},"type":"number","kind":"penalty","weight":-1},{"id":"judge_notes","label":"Judge Notes / Comments","audience":"judge","sortOrder":999,"config":{"placeholder":"Optional notes on performance..."},"type":"textarea","kind":"metric","weight":0}];

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 0. Set Judge Info
    console.log(`Setting Judge Info: ${judgeInfo.name} (${judgeInfo.unit})`);

    const isModalHidden = await page.evaluate(() => {
        const el = document.getElementById('judge-modal');
        return el ? el.classList.contains('hidden') : true;
    });

    if (isModalHidden) {
        await page.click('#judge-profile-btn');
        await sleep(waitTime / 2);
    }

    await page.fill('#judge-name', judgeInfo.name);
    await page.fill('#judge-email', judgeInfo.email);
    await page.fill('#judge-unit', judgeInfo.unit);

    // Click Save (try button, fallback to JS)
    const saveBtn = await page.$('#judge-modal button.btn-primary');
    if (saveBtn) await saveBtn.click();
    else await page.evaluate(() => app.saveJudgeInfo());
    await sleep(waitTime);

    // 1. Select Game (Only once, app returns to entity list after submit)
    console.log(`Selecting Game ${gameId} (${gameName})...`);
    await page.click(`button:has-text("${gameName}")`);
    await sleep(waitTime);

    for (const p of patrols) {
        console.log(`--- Scoring Patrol: ${p.name} ---`);

        // 2. Select Patrol
        console.log(`Selecting Patrol ${p.name}...`);
        await page.click(`div.list-group-item:has-text("${p.name}")`);
        await sleep(waitTime);

        // 3. Fill Scores
        console.log(`Filling scores for ${p.name}...`);
        for (const [fieldId, val] of Object.entries(p.scores)) {
            const field = fieldConfigs.find(f => f.id === fieldId);
            if (!field) continue;
            if (field.audience === 'admin') continue; // Judges can't see/fill admin fields

            if (field.type === 'timed' || field.type === 'stopwatch') {
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
        const dialogHandler = async dialog => {
            console.log(`  DIALOG [${dialog.type()}]: "${dialog.message()}"`);
            // Wait so the user can read the confirmation
            await new Promise(r => setTimeout(r, waitTime));
            await dialog.accept();
        };
        page.on('dialog', dialogHandler);
        await page.click('#btn-submit');

        // Wait for page to navigate back to station list
        await sleep(waitTime * 2);
        page.off('dialog', dialogHandler);
    }

    await finish();
}

run().catch(console.error);
