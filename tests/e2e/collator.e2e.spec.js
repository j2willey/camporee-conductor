import { test, expect } from '@playwright/test';
import AdmZip from 'adm-zip';

// ---------------------------------------------------------------------------
// Minimal camporee cartridge — uploaded once before tests that need a loaded
// event (admin dashboard, station list). Checked in inline so it works in CI
// with no external workspace data.
// ---------------------------------------------------------------------------
function buildMinimalCartridge() {
    const camporee = {
        schemaVersion: '3.0',
        meta: { title: 'E2E Test Camporee', theme: 'Testing', year: 2026, camporeeId: 'e2e-test-id' },
        terminology: null,
        leagues: [{ id: 'patrol-games', label: 'Patrol Games', tier: 'subunit', registration: 'open', divisions: [] }],
        sessions: [],
        rosters: { units: [{ id: 1, name: 'Troop 1' }], subunits: [{ id: 100, name: 'Eagles', parentId: 1 }], individuals: [] },
        officials: [],
        playlist: [{ gameId: 'e2e-game-1', enabled: true, order: 1 }],
        type_defaults: {}
    };
    const game = {
        id: 'e2e-game-1', league: 'patrol-games', session: null, sortOrder: 10,
        schemaVersion: '3.0',
        content: { title: 'E2E Test Game', story: '', challenge: '', description: '' },
        scoring_model: { method: 'points_desc', inputs: [
            { id: 'score', label: 'Points', type: 'number', kind: 'points', weight: 1, audience: 'judge', config: { min: 0, max: 10 } }
        ]}
    };
    const zip = new AdmZip();
    zip.addFile('camporee.json', Buffer.from(JSON.stringify(camporee, null, 2)));
    zip.addFile('presets.json', Buffer.from('[]'));
    zip.addFile('games/e2e-game-1.json', Buffer.from(JSON.stringify(game, null, 2)));
    return zip.toBuffer();
}

// Upload the minimal cartridge once before all tests that need an event.
// Uses Node 18+ native FormData + fetch. The test collator (NODE_ENV=test)
// bypasses requireOfficial so API calls succeed without an identified official.
test.beforeAll(async () => {
    const buf = buildMinimalCartridge();
    const formData = new FormData();
    formData.append('configZip', new Blob([buf], { type: 'application/zip' }), 'CamporeeConfig.zip');
    await fetch('http://localhost:4000/collator/api/setup/upload', { method: 'POST', body: formData });
});

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
        await page.goto('/collator/admin.html');

        await expect(page).toHaveTitle(/Camporee/);
        await expect(page.locator('header')).toBeVisible();
    });
});

test.describe('Collator — Station List and Scoring', () => {
    test('judge interface shows at least one station card with text', async ({ page }) => {
        await page.goto('/collator/judge.html');

        await expect(page).toHaveTitle(/Camporee Judge/);

        // Wait for the station list to be visible
        const stationList = page.locator('#station-list');
        await expect(stationList).toBeVisible();

        // Wait for at least one station card to appear (games load via fetch)
        // Cards are list-group-items rendered by renderStationList()
        const firstCard = stationList.locator('.list-group-item').first();
        await expect(firstCard).toBeVisible({ timeout: 5000 });

        // The card should have some non-empty text content (the game title)
        const cardText = await firstCard.textContent();
        expect(cardText?.trim().length).toBeGreaterThan(0);
    });

    test('judge can tap a station card to open the entity selection view', async ({ page }) => {
        // Use the judge_email URL param so the app auto-fills judge info and hides the modal
        await page.goto('/collator/judge.html?judge_name=Test+Judge&judge_email=test%40example.com&judge_unit=T42');

        // Wait for station cards to load
        const stationList = page.locator('#station-list');
        const firstCard = stationList.locator('.list-group-item').first();
        await expect(firstCard).toBeVisible({ timeout: 5000 });

        // Click the first station card
        await firstCard.click();

        // After clicking, the app navigates to the entity (patrol/troop selection) view
        const entityView = page.locator('#view-entity');
        await expect(entityView).not.toHaveClass(/hidden/, { timeout: 3000 });
    });
});

test.describe('Collator — Admin Dashboard', () => {
    test('admin dashboard loads and displays the main navigation grid', async ({ page }) => {
        await page.goto('/collator/admin.html');

        await expect(page).toHaveTitle(/Camporee/);

        // Header should be visible
        await expect(page.locator('header')).toBeVisible();

        // The dashboard section should be visible with navigation buttons
        const dashboardSection = page.locator('#view-dashboard');
        await expect(dashboardSection).toBeVisible({ timeout: 5000 });

        // Should have at least one dashboard navigation button/link
        const navButtons = page.locator('#view-dashboard .dashboard-link-btn');
        await expect(navButtons.first()).toBeVisible({ timeout: 3000 });
    });
});

test.describe('Collator — Setup Page', () => {
    test('setup page is reachable and has a file input for zip upload', async ({ page }) => {
        await page.goto('/collator/setup');

        // Page should load (title or body visible)
        await expect(page.locator('body')).toBeVisible();

        // There must be a file input accepting .zip files
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toBeVisible();

        const acceptAttr = await fileInput.getAttribute('accept');
        expect(acceptAttr).toContain('.zip');
    });
});
