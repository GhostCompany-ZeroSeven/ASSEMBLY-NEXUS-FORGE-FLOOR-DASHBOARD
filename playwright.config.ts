import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level checks against production builds:
 * - demo build (port 4173): axe incl. colour contrast, keyboard, reduced motion,
 *   runtime errors, overflow, performance, visual regression;
 * - REST build (port 4175, `--mode e2e-rest`): the GenericRESTAdapter against an
 *   in-browser mock backend (e2e/mockBackend.ts), for LIVE/partial/down states.
 * - Runtime build (port 4176, `--mode e2e-runtime`): served with a real same-origin
 *   HTTP + SSE MOCK backend and its bounded injection controls
 *   (scripts/mock-runtime-server.ts), for the Phase 7 adversarial runtime suite.
 *
 * `npm run test:e2e` builds both first. Visual baselines live in e2e/__screenshots__.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  // Baselines are rendered in the pinned CI image, where runs are pixel-identical
  // (measured). A strict budget catches real layout shifts; the old 1% ratio hid one.
  expect: { toHaveScreenshot: { maxDiffPixels: 20, threshold: 0.1 } },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx vite preview --outDir dist-e2e-rest --port 4175 --strictPort',
      url: 'http://localhost:4175',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'node scripts/mock-runtime-server.ts',
      url: 'http://localhost:4176/__mock/state',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
