const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext({ mobile: true });

    await startDemo();
    await sleep(waitTime);

    // 1. Select Game
    console.log("Selecting Game p10 (Ladder Lashing)...");
    // Using a more robust selector since names might have special chars
    await page.click('button:has-text("Ladder Lashing")');
    await sleep(waitTime);

    // 2. Select Patrol
    console.log("Selecting Patrol Skeleton Fishing...");
    await page.click('div:has-text("Skeleton Fishing")');
    await sleep(waitTime);

    // 3. Fill Scores
    console.log("Filling scores for p10...");
    
    // ascending order
    await page.fill('#f_ascending_order', '5');
    await sleep(waitTime);
    // uniformly spaced
    await page.fill('#f_uniformly_spaced', '5');
    await sleep(waitTime);
    // Proper lashings (2 ea × 20 pt)
    await page.fill('#f_proper_lashings_2_ea_20_pt', '5');
    await sleep(waitTime);
    // tight and sturdy
    await page.fill('#f_tight_and_sturdy', '5');
    await sleep(waitTime);
    // secured to anchor post
    await page.fill('#f_secured_to_anchor_post', '5');
    await sleep(waitTime);
    // All patrol members complete the climb within time limit
    await page.fill('#f_all_patrol_members_complete_the_climb_within_time_limit_mm', '01');
    await page.fill('#f_all_patrol_members_complete_the_climb_within_time_limit_ss', '23');
    await sleep(waitTime);
    // Spirited celebration
    await page.fill('#f_spirited_celebration', '5');
    await sleep(waitTime);
    // Disassemble ladder,  stack materials
    await page.fill('#f_disassemble_ladder_stack_materials', '5');
    await sleep(waitTime);
    // More than one Scout on ladder at a time  (-5 pt each instance)
    await page.fill('#f_more_than_one_scout_on_ladder_at_a_time_5_pt_each_instance_mm', '01');
    await page.fill('#f_more_than_one_scout_on_ladder_at_a_time_5_pt_each_instance_ss', '23');
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
