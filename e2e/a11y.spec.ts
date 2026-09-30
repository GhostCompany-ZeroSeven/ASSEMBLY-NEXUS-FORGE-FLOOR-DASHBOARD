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
