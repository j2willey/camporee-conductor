const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p19 (Sahara Oasis, Savanna  Irrigation)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Sahara Oasis, Savanna  Irrigation")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p19...");
    
    // Rig bucket w/ knots
    await page.fill('#f_rig_bucket_w_knots', '5');
    await sleep(waitTime);
    // submerge bucket
    await page.fill('#f_submerge_bucket', '5');
    await sleep(waitTime);
    // stop/contain leaks
    await page.fill('#f_stop_contain_leaks', '5');
    await sleep(waitTime);
    // reaching into well (–1 pt per violation)
    await page.fill('#f_reaching_into_well_1_pt_per_violation', '5');
    await sleep(waitTime);
    // bucket over head
    await page.fill('#f_bucket_over_head', '5');
    await sleep(waitTime);
    // bucket without  hands
    await page.fill('#f_bucket_without_hands', '5');
    await sleep(waitTime);
    // stop/contain leaks
    await page.fill('#f_stop_contain_leaks', '5');
    await sleep(waitTime);
    // 2/3  before moving
    await page.fill('#f_2_3_before_moving', '5');
    await sleep(waitTime);
    // stop or contain leaks
    await page.fill('#f_stop_or_contain_leaks', '5');
    await sleep(waitTime);
    // 1/2 before moving
    await page.fill('#f_1_2_before_moving', '5');
    await sleep(waitTime);
    // stop/contain leaks
    await page.fill('#f_stop_contain_leaks', '5');
    await sleep(waitTime);
    // siphon at least 3cups
    await page.fill('#f_siphon_at_least_3cups', '5');
    await sleep(waitTime);
    // Illegal dipping  (–1 pt /violation)
    await page.fill('#f_illegal_dipping_1_pt_violation', '5');
    await sleep(waitTime);
    // Other Penalties
    await page.fill('#f_other_penalties', '5');
    await sleep(waitTime);
    // H2O Cups transferred
    await page.fill('#f_h2o_cups_transferred', '5');
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
