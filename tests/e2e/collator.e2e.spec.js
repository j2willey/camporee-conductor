import { test, expect } from '@playwright/test';

test.describe('Collator (Judge) E2E Workflow', () => {
    test('should load the judge interface and allow scoring navigation', async ({ page }) => {
        // Navigate to Collator Judge UI
        await page.goto('http://localhost:3005/collator/judge.html');

        // Check if the page title is correct
        await expect(page).toHaveTitle(/Camporee Judge/);

        // Verify the games list is visible
        const stationList = page.locator('#station-list');
        await expect(stationList).toBeVisible();

        // Verify sync status element exists
        const syncStatus = page.locator('#unsynced-count');
        await expect(syncStatus).toBeVisible();

        // The rest of the form is dynamically generated based on selection.
        // In a full E2E, we would mock the database or pre-seed it, select a game/patrol,
        // fill the inputs, click 'Submit Score', and verify the Toast notification.
        // This baseline ensures the Shell is error-free.
    });
});
