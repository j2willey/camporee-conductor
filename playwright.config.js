import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Empty workspace dir for the test Composer, so it always starts in the
// first-time ("no camporees yet") state regardless of local data/composer contents.
// Stored in process.env so worker processes (which re-evaluate this config) reuse it.
process.env.E2E_WORKSPACE_PATH ||= fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-composer-workspaces-'));
const E2E_WORKSPACE_PATH = process.env.E2E_WORKSPACE_PATH;

// E2E tests use dedicated ports (4000/4001) that Docker never binds to.
// This prevents Playwright from reusing Docker containers (which lack NODE_ENV=test)
// and ensures tests always run against a fresh TEST_MODE server.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node server.js',
      port: 4001,
      reuseExistingServer: false,
      timeout: 20000,
      env: {
        NODE_ENV: 'test',
        PORT: '4001',
        ACTIVE_SERVICES: 'curator,composer',
        WORKSPACE_PATH: E2E_WORKSPACE_PATH,
      },
    },
    {
      command: 'node server.js',
      port: 4000,
      reuseExistingServer: false,
      timeout: 20000,
      env: {
        NODE_ENV: 'test',
        PORT: '4000',
        ACTIVE_SERVICES: 'collator',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ]
});
