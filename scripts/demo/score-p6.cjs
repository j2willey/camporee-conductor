const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p6 (Compass Game)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Compass Game")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p6...");
    
    // Check folder Column info change
    await page.fill('#f_check_folder_column_info_change', '5');
    await sleep(waitTime);
    // Start
    await page.fill('#f_start', '5');
    await sleep(waitTime);
    // Target Destination
    await page.fill('#f_target_destination', '5');
    await sleep(waitTime);
    // Distance from  Target
    await page.fill('#f_distance_from_target', '5');
    await sleep(waitTime);
    // Flag Height
    await page.fill('#f_flag_height', '5');
    await sleep(waitTime);
    // Vball width
    await page.fill('#f_vball_width', '5');
    await sleep(waitTime);
    // Time mm:ss
    await page.fill('#f_time_mm_ss_mm', '01');
    await page.fill('#f_time_mm_ss_ss', '23');
    await sleep(waitTime);
    // Time
    await page.fill('#f_time_mm', '01');
    await page.fill('#f_time_ss', '23');
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
