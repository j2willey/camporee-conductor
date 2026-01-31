const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p9 (Hook Line and Stretcher)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Hook Line and Stretcher")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p9...");
    
    // Patrol Sprirt
    await page.fill('#f_patrol_sprirt', '5');
    await sleep(waitTime);
    // Stretcher Runs/ Distance (laps, Decimals OK)
    await page.fill('#f_stretcher_runs_distance_laps_decimals_ok', '5');
    await sleep(waitTime);
    // BONUS for Scout Sea worthy Puns/Jokes
    await page.fill('#f_bonus_for_scout_sea_worthy_puns_jokes', '5');
    await sleep(waitTime);

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
