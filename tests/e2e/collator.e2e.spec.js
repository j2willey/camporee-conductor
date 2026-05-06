import { test, expect } from '@playwright/test';

test.describe('Collator (Judge) E2E Workflow', () => {
    test('should load the judge interface', async ({ page }) => {
        await page.goto('/judge.html');

        await expect(page).toHaveTitle(/Camporee Judge/);

        const stationList = page.locator('#station-list');
        await expect(stationList).toBeVisible();

        const syncStatus = page.locator('#unsynced-count');
        await expect(syncStatus).toBeVisible();
    });

    test('should load the admin dashboard', async ({ page }) => {
        await page.goto('/admin.html');

        await expect(page).toHaveTitle(/Camporee/);
        await expect(page.locator('header')).toBeVisible();
    });
});
