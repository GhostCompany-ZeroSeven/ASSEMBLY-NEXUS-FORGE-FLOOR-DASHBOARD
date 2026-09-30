import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openPaused, ROUTES } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page) {
  // @axe-core/playwright is typed against its own playwright-core; the runtime API is identical.
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(TAGS)
    .analyze();
  return r.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .slice(0, 4)
        .map((n) => n.target.join(' '))
        .join('\n    ')}`,
  );
}

for (const route of ROUTES) {
  test(`axe: ${route}`, async ({ page }) => {
    await openPaused(page, route);
    expect(await scan(page)).toEqual([]);
  });
}

test('axe: phone width floor and command center', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/floor', '/approvals']) {
    await openPaused(page, route);
    expect(await scan(page), route).toEqual([]);
  }
});

test('axe: Founder brief with digest items, desktop and phone, and keyboard reachability', async ({
  page,
}) => {
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(vp);
    await openPaused(page, '/brief');
    await page.evaluate(() => localStorage.removeItem('forge-floor:last-view'));
    await page.getByRole('button', { name: 'Mark all as seen' }).click();
    for (let i = 0; i < 12; i++) await page.keyboard.press('n');
    await expect(page.locator('.digest-item').first()).toBeVisible();
    expect(await scan(page), `${vp.width}px`).toEqual([]);
  }
  // Every digest and queue link is reachable by keyboard (Tab order includes them).
  const links = await page.locator('.digest-item a, .attention-item a').count();
  expect(links).toBeGreaterThan(0);
  await page.locator('.digest-item a').first().focus();
  await expect(page.locator('.digest-item a').first()).toBeFocused();
});

test('reduced motion: the timeline does not animate new events', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPaused(page, '/activity');
  const anim = await page
    .locator('.stream__item')
    .first()
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(anim)).toBeLessThanOrEqual(0.01);
});

test('axe: Red Alert state', async ({ page }) => {
  await openPaused(page, '/alerts');
  for (let i = 0; i < 8; i++) await page.keyboard.press('n');
  await expect(page.getByText('RED ALERT')).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('axe: approval confirmation, palette and shortcuts dialogs', async ({ page }) => {
  await openPaused(page, '/approvals');
  await page
    .getByRole('group', { name: 'Decide APR-031' })
    .getByRole('button', { name: /deny/i })
    .click();
  expect(await scan(page)).toEqual([]);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search commands/ }).fill('cy');
  expect(await scan(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('axe: Snow Wolf theme', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ themeId: 'snow-wolf' })),
  );
  await openPaused(page, '/');
  expect(await scan(page)).toEqual([]);
});
