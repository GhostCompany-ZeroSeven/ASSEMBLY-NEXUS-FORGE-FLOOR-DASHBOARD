import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openPaused } from './helpers';
import { openPseudo, scan } from './pseudo';

/**
 * Phases 12–15 browser checks: action safety, the mission lifecycle ladder
 * (false-green guard), explained health, the connection claim, worker ≠
 * Associate, and their accessibility, keyboard reach, overflow and pseudo-
 * locale behaviour.
 */

async function axe(page: Page) {
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const SURFACES = [
  '/',
  '/missions/AN-0139',
  '/missions/AN-0144',
  '/approvals',
  '/alerts',
  '/quality',
  '/workers/w-ada',
];

test('changed surfaces pass axe (WCAG 2.2 AA) without runtime errors', async ({ page }) => {
  const errors = collectErrors(page);
  for (const route of SURFACES) {
    await openPaused(page, route);
    expect(await axe(page), route).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('lifecycle ladder: six separate rungs, Founder decision pending on a gated mission', async ({
  page,
}) => {
  await openPaused(page, '/missions/AN-0144');
  const rungs = page.locator('.ladder__rung');
  await expect(rungs).toHaveCount(6);
  await expect(page.locator('.ladder__rung[data-step="founder"]')).toHaveAttribute(
    'data-state',
    'PENDING',
  );
  await expect(page.locator('.ladder__rung[data-step="deployment"]')).toContainText('Not tracked');
  await expect(page.locator('.ladder')).not.toContainText('%');
});

test('keyboard: the header health status opens its explanation', async ({ page }) => {
  await openPaused(page, '/missions');
  const link = page.locator('.topbar__health');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/\?focus=health/);
  const panel = page.locator('[data-focus-id="health"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('health-source')).toContainText('Simulated by the demo');
  await expect(panel.locator('[data-not-covered="associates"]')).toHaveCount(1);
});

test('demo approval controls are visibly a simulation before any click', async ({ page }) => {
  await openPaused(page, '/approvals');
  const group = page.getByRole('group', { name: 'Decide APR-031' });
  for (const b of await group.getByRole('button').all())
    await expect(b).toHaveAttribute('data-action-class', 'DEMO_SIMULATION');
  await expect(
    page.locator('.action-class[data-action-class="DEMO_SIMULATION"]').first(),
  ).toBeVisible();
  await expect(page.getByTestId('gate-view-note')).toBeVisible();
});

test('data-quality inspector states the source class and the connection claim', async ({
  page,
}) => {
  await openPaused(page, '/quality');
  await expect(page.locator('[data-source-class="DEMO"]')).toBeVisible();
  await expect(page.locator('[data-claim="DEMO_SIMULATED"]')).toBeVisible();
});

test('visual floor: Associates are UNKNOWN (not connected), never ONLINE from workers', async ({
  page,
}) => {
  await openPaused(page, '/visual-floor');
  const row = page.locator('.vf__hud--systems li').filter({ hasText: 'ASSOCIATES' });
  await expect(row).toContainText('UNKNOWN');
  await expect(row).toContainText('not connected');
  await expect(row).not.toContainText('ONLINE');
});

for (const width of [320, 390, 1440]) {
  test(`no page overflow at ${width}px on changed surfaces (en and es)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of SURFACES) {
      await openPaused(page, route);
      expect(await overflow(page), `en ${route}`).toBeLessThanOrEqual(0);
    }
    await page.addInitScript(() => {
      localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
    });
    for (const route of SURFACES) {
      await page.goto(`/?demo=paused#${route}`);
      await page.locator('[data-surface="ready"]').waitFor();
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      expect(await overflow(page), `es ${route}`).toBeLessThanOrEqual(0);
    }
  });
}

test('Spanish: the ladder and health explanation are translated', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
  });
  await page.goto('/?demo=paused#/missions/AN-0144');
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.locator('.ladder__rung[data-step="founder"]')).toContainText(
    'Decisión del Founder',
  );
  await page.goto('/?demo=paused#/?focus=health');
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.getByTestId('health-source')).toContainText('Simulado por la demostración');
});

test('pseudo-locale: no untranslated text, clipping or overflow on changed surfaces', async ({
  page,
}) => {
  const problems: string[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of SURFACES) {
      await openPseudo(page, route);
      const r = await scan(page);
      problems.push(...r.untranslated.map((u) => `${width} ${route} untranslated: ${u}`));
      problems.push(...r.clipped.map((c) => `${width} ${route} clipped: ${c}`));
      if (r.overflow > 0) problems.push(`${width} ${route} overflows by ${r.overflow}px`);
    }
  }
  expect(problems).toEqual([]);
});
