const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p14 (Mermaid Tails)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Mermaid Tails")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p14...");
    
    // Patrol Sprirt
    await page.fill('#f_patrol_sprirt', '5');
    await sleep(waitTime);
    // Knot correctly tied
    await page.fill('#f_knot_correctly_tied', '5');
    await sleep(waitTime);
    // Knot Rationale
    await page.fill('#f_knot_rationale', '5');
    await sleep(waitTime);
    // Time Points
    await page.fill('#f_time_points_mm', '01');
    await page.fill('#f_time_points_ss', '23');
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
