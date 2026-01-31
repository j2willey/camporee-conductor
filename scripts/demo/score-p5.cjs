const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p5 (Catch Fish Fry Fly)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Catch Fish Fry Fly")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p5...");
    
    // Mix batter
    await page.fill('#f_mix_batter', '5');
    await sleep(waitTime);
    // prep skillet
    await page.fill('#f_prep_skillet', '5');
    await sleep(waitTime);
    // batter into skillet
    await page.fill('#f_batter_into_skillet', '5');
    await sleep(waitTime);
    // Pancake resembles Fish
    await page.fill('#f_pancake_resembles_fish', '5');
    await sleep(waitTime);
    // Fully Cook Pancake
    await page.fill('#f_fully_cook_pancake', '5');
    await sleep(waitTime);
    // Catch & Eat....
    await page.fill('#f_catch_eat', '5');
    await sleep(waitTime);
    // Wash and Clean up
    await page.fill('#f_wash_and_clean_up', '5');
    await sleep(waitTime);
    // SUM
    await page.fill('#f_sum', '5');
    await sleep(waitTime);
    // Time mm:ss
    await page.fill('#f_time_mm_ss_mm', '01');
    await page.fill('#f_time_mm_ss_ss', '23');
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
