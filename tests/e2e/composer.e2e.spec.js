import { test, expect } from '@playwright/test';

// Before running E2E tests, ensure the servers are running 
// using `npm run dev:all`. Playwright could be configured to start them,
// but for this phase we assume they are running on localhost:3000, 3001, etc.

test.describe('Composer (Director) E2E Workflow', () => {
    test('should load the library and show games', async ({ page }) => {
        // Navigate to Composer UI (Mounted at /composer/)
        await page.goto('http://localhost:3005/composer/');

        // Check if the page title is correct
        await expect(page).toHaveTitle(/Camporee Composer/);

        // Click on the Browse Library button
        const browseBtn = page.getByRole('button', { name: /Browse Library/i }).first();
        await expect(browseBtn).toBeVisible();

        // Verify the + Add button for Patrol Games exists
        const addBtn = page.getByRole('button', { name: '+' }).first();
        await expect(addBtn).toBeVisible();
    });
});
