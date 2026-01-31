const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p3 (Showtime in Atlantis)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Showtime in Atlantis")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p3...");
    
    // Skit name
    await page.fill('#f_skit_name', '5');
    await sleep(waitTime);
    // Approx. Length in minutes
    await page.fill('#f_approx_length_in_minutes', '5');
    await sleep(waitTime);
    // points
    await page.fill('#f_points', '5');
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
