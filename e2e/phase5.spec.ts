import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';
import { openPseudo, scan } from './pseudo';
import { installMockBackend, REST_APP } from './mockBackend';

/**
 * Phase 5 browser checks: pseudo-locale stress (untranslated text, truncation,
 * overflow) across every surface, dialog, the palette and mobile; the Founder
 * brief, change digest and attention queue; and their accessibility.
 */

const VIEWPORTS = {
  w320: { width: 320, height: 700 },
  w390: { width: 390, height: 844 },
  w1440: { width: 1440, height: 900 },
  w2560: { width: 2560, height: 1440 },
} as const;

const ROUTES = [
  '/',
  '/brief',
  '/floor',
  '/floor?room=founder-gate',
  '/missions',
  '/missions/AN-0142',
  '/workers',
  '/workers/w-cyrus',
  '/approvals',
  '/alerts',
  '/activity',
  '/settings',
];

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`pseudo-locale: no untranslated text, clipping or overflow at ${name}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(vp);
    const problems: string[] = [];
    for (const route of ROUTES) {
      await openPseudo(page, route);
      const r = await scan(page);
      problems.push(...r.untranslated.map((u) => `${route} untranslated: ${u}`));
      problems.push(...r.clipped.map((c) => `${route} clipped: ${c}`));
      if (r.overflow > 0) problems.push(`${route} overflows by ${r.overflow}px`);
    }
    // Dialogs: palette (with results) and keyboard shortcuts.
    await openPseudo(page, '/');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    let r = await scan(page);
    problems.push(...r.untranslated.map((u) => `palette untranslated: ${u}`));
    problems.push(...r.clipped.map((c) => `palette clipped: ${c}`));
    await page.keyboard.type('AN-0142');
    r = await scan(page);
    problems.push(...r.untranslated.map((u) => `palette results untranslated: ${u}`));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+?');
    await page.getByRole('dialog').waitFor();
    r = await scan(page);
    problems.push(...r.untranslated.map((u) => `shortcuts untranslated: ${u}`));
    problems.push(...r.clipped.map((c) => `shortcuts clipped: ${c}`));
    if (r.overflow > 0) problems.push(`shortcuts overflow ${r.overflow}px`);
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('pseudo-locale keeps ids, authority and enum-driven filters exact', async ({ page }) => {
  await openPseudo(page, '/approvals');
  await expect(page.getByText('Founder #0007').first()).toBeVisible();
  await expect(page.getByText('APR-031').first()).toBeVisible();
  // The flag is diagnostic: it is not persisted.
  expect(await page.evaluate(() => localStorage.getItem('forge-floor:preferences'))).not.toMatch(
    /pseudo/,
  );
  await page.goto('/?demo=paused#/approvals');
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test.describe('Founder brief', () => {
  test('first visit says UNKNOWN; after "Mark all as seen" it compares across a reload', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/?demo=paused#/brief');
    await page.locator('[data-surface="ready"]').waitFor();
    await expect(page.getByText(/No previous view is recorded/)).toBeVisible();
    await expect(page.locator('[data-figure="newSinceLastView"]')).toContainText('UNKNOWN');
    await page.getByRole('button', { name: 'Mark all as seen' }).click();
    await expect(page.getByText(/Compared with your last view/)).toBeVisible();
    await page.reload();
    await page.locator('[data-surface="ready"]').waitFor();
    await expect(page.getByText(/Compared with your last view/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('palette: "What changed since I last looked?" opens the digest by keyboard', async ({
    page,
  }) => {
    await page.goto('/?demo=paused#/');
    await page.locator('[data-surface="ready"]').waitFor();
    await page.keyboard.press('Control+k');
    await page.keyboard.type('what changed');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/brief\?focus=digest$/);
    await expect(page.locator('[data-focus-id="digest"]')).toBeFocused();
  });

  test('REST with approvals failing: queue INCOMPLETE and "Needs Founder" UNKNOWN, not 0', async ({
    page,
  }) => {
    await installMockBackend(page, 'approvals-down', Date.parse('2026-09-30T12:00:00Z'));
    await page.goto(`${REST_APP}/#/brief`);
    await page.locator('[data-surface="ready"]').waitFor();
    const needs = page.locator('[data-figure="needsFounder"]');
    await expect(needs).toContainText('UNKNOWN');
    await expect(needs).not.toContainText(/^\D*0\D*$/);
    await expect(page.getByText(/Incomplete: approval gates could not be loaded/)).toBeVisible();
    await expect(page.locator('[data-problem="unavailable"]')).toBeVisible();
  });

  for (const locale of ['en', 'es', 'pseudo'] as const) {
    test(`accessibility (axe, WCAG 2.2 AA) of the brief: ${locale}`, async ({ page }) => {
      if (locale === 'es')
        await page.addInitScript(() =>
          localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' })),
        );
      await page.goto(`/?demo=paused${locale === 'pseudo' ? '&pseudo=1' : ''}#/brief`);
      await page.locator('[data-surface="ready"]').waitFor();
      await page.getByRole('button', { name: /Mark all as seen|Marcar todo|Ṁåŕķ/ }).click();
      const results = await new AxeBuilder({ page } as unknown as ConstructorParameters<
        typeof AxeBuilder
      >[0])
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`brief: no horizontal overflow on the stress dataset at ${name}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/?demo=stress,paused#/brief');
      await page.locator('[data-surface="ready"]').waitFor();
      await page.getByRole('button', { name: 'Mark all as seen' }).click();
      const o = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(o).toBeLessThanOrEqual(0);
    });
  }
});
