const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p11 (Raft-a-drift at Sea)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Raft-a-drift at Sea")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p11...");
    
    // Patrol Sprirt
    await page.fill('#f_patrol_sprirt', '5');
    await sleep(waitTime);
    // BONUS for Scout Sea worthy Puns/Jokes
    await page.fill('#f_bonus_for_scout_sea_worthy_puns_jokes', '5');
    await sleep(waitTime);
    // Time Raft 1 mm::sec
    await page.fill('#f_time_raft_1_mm_sec_mm', '01');
    await page.fill('#f_time_raft_1_mm_sec_ss', '23');
    await sleep(waitTime);
    // OPTIONAL Time Raft 3 mm::sec
    await page.fill('#f_optional_time_raft_3_mm_sec_mm', '01');
    await page.fill('#f_optional_time_raft_3_mm_sec_ss', '23');
    await sleep(waitTime);
    // AVG Time mm::sec
    await page.fill('#f_avg_time_mm_sec_mm', '01');
    await page.fill('#f_avg_time_mm_sec_ss', '23');
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
