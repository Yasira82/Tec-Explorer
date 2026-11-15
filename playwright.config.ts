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
    { name: 'chromium', testIgnore: /pi-browser\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Pi Browser (App Excellence Standard E14): where every Pioneer actually opens the
    // app — an Android phone, and Pi Browser's own user agent, which the app and Pi's
    // SDK both read. Runs the pi-browser specs only.
    {
      name: 'pi-browser',
      testMatch: /pi-browser\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        userAgent: `${devices['Pixel 7'].userAgent} PiBrowser/2.3.0`,
      },
    },
  ],
  webServer: {
    command:            'npm run start',
    url:                'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout:            120000,
  },
});
