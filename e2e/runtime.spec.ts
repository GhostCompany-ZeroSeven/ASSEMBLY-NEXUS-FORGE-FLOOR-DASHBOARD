import { expect, test } from '@playwright/test';
import { collectErrors, openPaused, ROUTES } from './helpers';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'command-center', width: 2560, height: 1440 },
];

for (const vp of VIEWPORTS) {
  test(`no runtime errors or horizontal overflow at ${vp.name}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of ROUTES) {
      await openPaused(page, route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
}

// Layout must not depend on the data: large counts and long labels (as a real
// backend may send) once pushed filter bars past the viewport on phones.
test('no horizontal overflow at 320px with the large stress dataset', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const route of ['/floor', '/missions', '/workers', '/approvals', '/alerts', '/activity']) {
    await page.goto(`/?demo=stress,paused#${route}`);
    await page.locator('[data-surface="ready"]').waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test('demo runs live for a while without errors and never shows LIVE', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/#/');
  await page.getByLabel('Simulation speed').selectOption('4');
  await page.waitForTimeout(6000);
  await expect(page.getByText('DEMO · SIMULATED')).toBeVisible();
  await expect(page.getByText('LIVE', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
