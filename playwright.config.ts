import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
// E2E_PORT lets several checkouts run e2e at the same time on one machine.
const PORT = Number(process.env.E2E_PORT ?? 4173);

// In some sandboxes a Chromium binary is pre-installed and downloads are blocked.
// Set PW_CHROMIUM_PATH to that binary to reuse it; CI leaves it unset and installs
// the browser with `npx playwright install --with-deps chromium`.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
