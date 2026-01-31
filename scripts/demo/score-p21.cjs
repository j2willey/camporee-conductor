const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p21 (Crocodile Crossing)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Crocodile Crossing")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p21...");
    
    // Patrol Sprirt
    await page.fill('#f_patrol_sprirt', '5');
    await sleep(waitTime);
    // Time Taken
    await page.fill('#f_time_taken_mm', '01');
    await page.fill('#f_time_taken_ss', '23');
    await sleep(waitTime);
    // Speed(Motivation)
    await page.fill('#f_speed_motivation', '5');
    await sleep(waitTime);
    // Following Rules
    await page.fill('#f_following_rules', '5');
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
