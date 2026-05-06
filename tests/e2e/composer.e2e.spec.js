import { test, expect } from '@playwright/test';

// Requires servers running: npm run dev:all
// Composer runs on port 3001, but Playwright baseURL is 3000.
// Navigate to composer directly via its port.

test.describe('Composer (Director) E2E Workflow', () => {
    test('should load the Composer UI with correct title and controls', async ({ page }) => {
        await page.goto('http://localhost:3001/composer/');

        await expect(page).toHaveTitle(/Camporee Composer/);

        // Sidebar nav should show Camporee Info button
        const infoBtn = page.locator('#btn-meta');
        await expect(infoBtn).toBeVisible();

        // Export Zip button should be visible
        const exportBtn = page.getByRole('button', { name: /Export Zip/i });
        await expect(exportBtn).toBeVisible();

        // Browse Library button in meta pane
        const browseBtn = page.getByRole('button', { name: /Browse Library/i }).first();
        await expect(browseBtn).toBeVisible();
    });

    test('should allow adding a patrol game', async ({ page }) => {
        await page.goto('http://localhost:3001/composer/');

        // Click the + button for Patrol Games
        const addPatrolBtn = page.locator('#collapsePatrol button[onclick*="addGame"]').first();
        await expect(addPatrolBtn).toBeVisible();
        await addPatrolBtn.click();

        // Editor pane should now be visible with a game loaded
        const editorPane = page.locator('#editor-pane');
        await expect(editorPane).not.toHaveClass(/d-none/);
    });
});
