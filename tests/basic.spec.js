const { test, expect } = require('@playwright/test');

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Coyote Collator/);
});

test('admin dashboard loads', async ({ page }) => {
  await page.goto('/admin.html');
  await expect(page.locator('h1')).toContainText('Coyote Admin');
});
