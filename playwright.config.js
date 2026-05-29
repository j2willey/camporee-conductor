import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node server.js',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        ACTIVE_SERVICES: 'curator,composer',
      },
    },
    {
      command: 'node server.js',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
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
