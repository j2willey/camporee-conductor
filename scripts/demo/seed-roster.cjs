const { getContext } = require('./utils.cjs');

async function run() {
    const { page, waitTime, sleep, finish, startDemo } = await getContext();

    // Data from config CSVs
    const roster = [
        { num: '13', name: 'T13', patrols: ['Skeleton Fishing', 'Spooky Shrimp'] },
        { num: '92', name: 'T92', patrols: ['Shadow Panther', 'Cold Flames', 'Jackalopes', 'Flaming Flamingoes'] },
        { num: '110', name: 'T110', patrols: ['Eaglez'] },
        { num: '116', name: 'T116', patrols: ['Inferno Sharks', 'Grease Fires'] },
        { num: '201', name: 'T201', patrols: ['Ducks', 'Raptors'] },
        { num: '251', name: 'T251', patrols: ['Dark Dragons', 'Orcas', 'Eggos'] },
        { num: '108', name: 'T108', patrols: ['Fearless Firebirds'] },
        { num: '109', name: 'T109', patrols: ['Falcons'] }
    ];

    // Setup dialog handlers to fulfill the prompts
    let currentPromptValue = "";
    page.on('dialog', async dialog => {
        await dialog.accept(currentPromptValue);
    });

    await startDemo();
    await page.goto('http://localhost:3000/admin.html');
    await sleep(waitTime);

    // Switch to Registration View
    await page.click('#nav-registration');
    await sleep(waitTime);

    for (const troop of roster) {
        console.log(`Adding Troop ${troop.num}...`);

        // Add Troop
        currentPromptValue = troop.num;
        // Note: The prompt sequence is Num then Name
        // We'll need to update currentPromptValue dynamically if possible, or use a queue.
    }

    // REDO dialog handler for sequential prompts
    page.removeAllListeners('dialog');

    let promptQueue = [];
    page.on('dialog', async dialog => {
        const val = promptQueue.shift();
        await dialog.accept(val);
    });

    for (const troop of roster) {
        console.log(`Working on Troop ${troop.num}...`);

        promptQueue.push(troop.num);
        promptQueue.push(troop.name);
        await page.click('button:has-text("+ Add Troop")');
        await sleep(waitTime);

        for (const patrol of troop.patrols) {
            console.log(`  Adding Patrol ${patrol}...`);
            promptQueue.push(patrol);
            // Click the "+ Add Patrol" button inside the correct troop details
            // The summary text contains "Troop [num]"
            const troopRow = page.locator('.roster-group', { hasText: `Troop ${troop.num}` });
            await troopRow.locator('button:has-text("+ Add Patrol")').click();
            await sleep(waitTime);
        }
    }

    await finish();
}

run().catch(console.error);
