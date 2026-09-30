import { expect, test, type Page } from '@playwright/test';
import { installMockBackend, REST_APP, type MockMode } from './mockBackend';

/**
 * Visual regression for key dashboard states.
 *
 * Determinism:
 * - Date is frozen (`page.clock.setFixedTime`), so every clock and relative time is fixed.
 * - The demo starts paused (`?demo=paused`); any simulated steps are explicit.
 * - Reduced motion + `animations: 'disabled'`: no animation frames in screenshots.
 * - Fonts are bundled (no system-font dependency); state glyphs are SVG.
 * - The identity hierarchy (decorative Unicode brackets) is masked.
 *
 * Update baselines intentionally: `npm run test:visual:update`, review the PNG diffs,
 * and commit them with the change that caused them. See docs/VISUAL_REGRESSION.md.
 */

const FIXED = new Date('2026-09-30T12:00:00Z');
const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
  hd: { width: 1920, height: 1080 },
  wide: { width: 2560, height: 1440 },
} as const;

async function open(page: Page, route: string, viewport: keyof typeof VIEWPORTS = 'desktop') {
  await page.setViewportSize(VIEWPORTS[viewport]);
  await page.clock.setFixedTime(FIXED);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?demo=paused#${route}`);
  await page.locator('[data-surface="ready"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function snap(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('.hierarchy')],
    maxDiffPixelRatio: 0.01,
  });
}

const DEMO: [string, string, keyof typeof VIEWPORTS][] = [
  ['command-center-desktop', '/', 'desktop'],
  ['command-center-wide', '/', 'wide'],
  ['command-center-phone', '/', 'phone'],
  ['forge-floor-desktop', '/floor', 'desktop'],
  ['forge-floor-hd', '/floor', 'hd'],
  ['forge-floor-wide', '/floor', 'wide'],
  ['forge-floor-tablet', '/floor', 'tablet'],
  ['forge-floor-phone', '/floor', 'phone'],
  ['forge-floor-selected-worker', '/floor?worker=w-ada', 'desktop'],
  ['forge-floor-room', '/floor?room=founder-gate', 'desktop'],
  ['missions-desktop', '/missions', 'desktop'],
  ['mission-complete', '/missions/AN-0139', 'desktop'],
  ['workers-desktop', '/workers', 'desktop'],
  ['worker-focus', '/workers/w-cyrus', 'desktop'],
  ['approvals-desktop', '/approvals', 'desktop'],
  ['approvals-tablet', '/approvals', 'tablet'],
  ['alerts-desktop', '/alerts', 'desktop'],
];

for (const [name, route, vp] of DEMO) {
  test(`visual: ${name}`, async ({ page }) => {
    await open(page, route, vp);
    await snap(page, name);
  });
}

test('visual: approval confirmation step', async ({ page }) => {
  await open(page, '/approvals');
  await page
    .getByRole('group', { name: 'Decide APR-031' })
    .getByRole('button', { name: /deny/i })
    .click();
  await snap(page, 'approval-confirm-deny');
});

test('visual: Red Alert', async ({ page }) => {
  await open(page, '/alerts');
  for (let i = 0; i < 7; i++) await page.keyboard.press('n');
  await expect(page.getByText('RED ALERT')).toBeVisible();
  await snap(page, 'red-alert');
});

test('visual: command palette search', async ({ page }) => {
  await open(page, '/');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search commands/ }).fill('cyrus');
  await snap(page, 'palette-search');
});

test('visual: empty filter result', async ({ page }) => {
  await open(page, '/missions');
  await page.getByRole('searchbox').fill('no mission is called this');
  await snap(page, 'missions-filtered-empty');
});

/* ------------------------ REST build + mock backend ----------------------- */

async function openRest(page: Page, mode: MockMode, route = '/') {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.clock.setFixedTime(FIXED);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installMockBackend(page, mode, FIXED.getTime());
  await page.goto(`${REST_APP}/#${route}`);
  await page.locator('[data-surface="ready"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test('visual: REST healthy (LIVE · E2E mock)', async ({ page }) => {
  await openRest(page, 'healthy');
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible();
  await snap(page, 'rest-live');
});

test('visual: REST partial data', async ({ page }) => {
  await openRest(page, 'partial');
  await expect(page.getByText('PARTIAL DATA')).toBeVisible();
  await page.getByText('PARTIAL DATA').click();
  await snap(page, 'rest-partial');
});

test('visual: REST backend unavailable', async ({ page }) => {
  await openRest(page, 'down');
  await expect(page.getByText('Data source unavailable')).toBeVisible();
  await snap(page, 'rest-down');
});

test('visual: REST empty backend', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.clock.setFixedTime(FIXED);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installMockBackend(page, 'healthy', FIXED.getTime());
  await page.route('http://mock-backend.test/api/workers', (r) =>
    r.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: '{"workers":[]}',
    }),
  );
  await page.route('http://mock-backend.test/api/missions', (r) =>
    r.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: '{"missions":[]}',
    }),
  );
  await page.goto(`${REST_APP}/#/missions`);
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.getByText('No missions from the data source')).toBeVisible();
  await snap(page, 'rest-empty-missions');
});
