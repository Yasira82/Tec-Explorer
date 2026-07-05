import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:   './e2e',
  timeout:   30000,
  retries:   1,
  use: {
    baseURL:     process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace:       'on-first-retry',
    screenshot:  'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command:            'npm run start',
    url:                'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout:            120000,
  },
});
