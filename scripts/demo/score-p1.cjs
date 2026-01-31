const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p1 (Boiling the Ocean)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Boiling the Ocean")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p1...");
    
    // Attempt Friction Fire
    await page.fill('#f_attempt_friction_fire', '5');
    await sleep(waitTime);
    // charing or powder
    await page.fill('#f_charing_or_powder', '5');
    await sleep(waitTime);
    // smoke
    await page.fill('#f_smoke', '5');
    await sleep(waitTime);
    // ember
    await page.fill('#f_ember', '5');
    await sleep(waitTime);
    // Ignite tinder
    await page.fill('#f_ignite_tinder', '5');
    await sleep(waitTime);
    // ignite kindling
    await page.fill('#f_ignite_kindling', '5');
    await sleep(waitTime);
    // water boils
    await page.fill('#f_water_boils', '5');
    await sleep(waitTime);
    // Extinguish fire & reset
    await page.fill('#f_extinguish_fire_reset', '5');
    await sleep(waitTime);
    // Matches Used (Count)
    await page.fill('#f_matches_used_count', '5');
    await sleep(waitTime);
    // Time to Boil or N.A.  mm:ss
    await page.fill('#f_time_to_boil_or_n_a_mm_ss_mm', '01');
    await page.fill('#f_time_to_boil_or_n_a_mm_ss_ss', '23');
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
