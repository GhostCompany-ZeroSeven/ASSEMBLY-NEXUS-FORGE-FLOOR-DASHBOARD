import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

/**
 * Stress dataset (120 workers, 400 missions, 500 retained events, 40 alerts,
 * 30 gates) in a real browser. Budgets are generous: they catch
 * order-of-magnitude regressions, not micro-benchmarks.
 */
for (const route of ['/', '/floor', '/missions', '/workers', '/approvals']) {
  test(`stress: ${route} renders within budget without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    const t0 = Date.now();
    await page.goto(`/?demo=stress#${route}`);
    await page.locator('[data-surface="ready"]').waitFor();
    const ms = Date.now() - t0;
    expect(ms, `first render took ${ms}ms`).toBeLessThan(5000);
    await expect(page.getByText('DEMO · SIMULATED')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('stress: running the simulation at 4× stays responsive (no long-task storm)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    (window as unknown as { __long: number[] }).__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        (window as unknown as { __long: number[] }).__long.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto('/?demo=stress#/floor');
  await page.locator('[data-surface="ready"]').waitFor();
  await page.getByLabel('Simulation speed').selectOption('4');
  await page.waitForTimeout(8000);
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  const worst = Math.max(0, ...long);
  const total = long.reduce((a, b) => a + b, 0);
  console.log(
    `long tasks: ${long.length}, worst ${worst.toFixed(0)}ms, total ${total.toFixed(0)}ms over 8s`,
  );
  expect(worst, 'no single frame should block for >500ms').toBeLessThan(500);
  expect(total, 'main thread blocked <40% of the time').toBeLessThan(3200);
  // Clicking still works promptly while the simulation runs.
  const t0 = Date.now();
  await page
    .getByRole('link', { name: /Missions/ })
    .first()
    .click();
  await page.locator('[data-surface-name="missions"]').waitFor();
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(errors).toEqual([]);
});
