const fs = require('fs');
const path = require('path');

const gamesDir = path.join(__dirname, '../../config/games');
const outputDir = __dirname;

const files = fs.readdirSync(gamesDir);

files.forEach(file => {
    if (!file.startsWith('p') || !file.endsWith('.json')) return;

    const game = JSON.parse(fs.readFileSync(path.join(gamesDir, file), 'utf8'));
    const gameId = game.id;
    const gameName = game.name;
    const scriptPath = path.join(outputDir, `score-${gameId}.cjs`);

    let fieldInteractions = '';
    game.fields.forEach(f => {
        if (f.adminOnly) return; // Skip fields only visible to admins
        const safeLabel = f.label.replace(/\n/g, ' ');
        if (f.type === 'number' || f.type === 'boolean') {
            fieldInteractions += `
    // ${safeLabel}
    await page.fill('#f_${f.id}', '5');
    await sleep(waitTime);`;
        } else if (f.type === 'time_mm_ss') {
            fieldInteractions += `
    // ${safeLabel}
    await page.fill('#f_${f.id}_mm', '01');
    await page.fill('#f_${f.id}_ss', '23');
    await sleep(waitTime);`;
        }
    });

    const scriptContent = `const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game ${gameId} (${gameName})...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("${gameName}")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for ${gameId}...");
    ${fieldInteractions}

    // common: patrol_spirit
    await page.fill('#f_patrol_spirit', '5');
    await sleep(waitTime);

    // 4. Submit
    console.log("Submitting...");
    page.on('dialog', dialog => dialog.dismiss());
    await page.click('#btn-submit');
    await sleep(waitTime);

    await finish();
}

run().catch(console.error);
`;

    fs.writeFileSync(scriptPath, scriptContent);
    console.log(`Generated ${scriptPath}`);
});
