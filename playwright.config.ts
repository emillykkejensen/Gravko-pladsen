import { defineConfig } from '@playwright/test';

// Same variable the dev server reads, so a second checkout can test on its own port.
const PORT = Number(process.env.PORT) || 3000;

export default defineConfig({
  testDir: './tests',
  // Generous because CI here renders with software WebGL, where Phaser's clamped
  // delta stretches every transition. On real hardware these finish in a few seconds.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  // No retries on purpose. This suite drives a canvas, so a retry would paper over
  // exactly the timing bugs worth knowing about — two CI failures so far were real
  // nondeterminism in the tests, not infrastructure.
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Exactly the 1.6 the scenes are drawn for, so the stage is 880×550 and `AT` holds.
    // tests/screen.spec.ts covers other shapes.
    viewport: { width: 1200, height: 750 },
    launchOptions: {
      // The sandbox ships Chromium at a fixed path; fall back to Playwright's own.
      executablePath: process.env.CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
