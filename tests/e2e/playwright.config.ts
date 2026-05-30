import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const parsedBaseURL = new URL(baseURL);
const webServerPort =
  parsedBaseURL.port || (parsedBaseURL.protocol === 'https:' ? '443' : '80');
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    // Disable entrance animations (gated behind prefers-reduced-motion in
    // globals.css) so layout assertions measure settled, final positions.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results',
  webServer: skipWebServer
    ? undefined
    : {
        command: `pnpm --filter @mini-commerce/web exec next dev --port ${webServerPort}`,
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
