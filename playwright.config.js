import { defineConfig, devices } from '@playwright/test';

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
