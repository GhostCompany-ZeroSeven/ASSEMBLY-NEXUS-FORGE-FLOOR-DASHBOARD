import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './helpers';
import { installMockBackend, REST_APP } from './mockBackend';
import { openPseudo, scan } from './pseudo';

/**
 * Phase 6 browser checks: mission command intelligence, markers, attention
 * explanations, data-quality inspector, scoped timelines and search provenance
 * under pseudo-locale stress, Spanish, phone widths, keyboard-only use and axe.
 */

const VIEWPORTS = {
  w320: { width: 320, height: 700 },
  w390: { width: 390, height: 844 },
  w1440: { width: 1440, height: 900 },
  w2560: { width: 2560, height: 1440 },
} as const;

const ROUTES = [
  '/quality',
  '/missions?since=changed',
  '/missions?sort=activity',
  '/missions/AN-0142',
  '/missions/AN-0144',
  '/activity?approval=APR-031&details=1',
  '/activity?mission=AN-0142',
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function axe(page: Page) {
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(TAGS)
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** View a mission, leave, step the simulation: the mission now has proven changes. */
async function viewThenChange(page: Page, base: string) {
  await page.goto(`${base}#/missions/AN-0142`);
  await page.locator('[data-surface="ready"]').waitFor();
  await page.goto(`${base}#/missions`);
  await page.locator('.mission-card').first().waitFor();
  for (let i = 0; i < 10; i++) await page.keyboard.press('n');
}

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`pseudo-locale on Phase 6 surfaces: no untranslated text, clipping or overflow at ${name}`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(vp);
    await openPseudo(page, '/missions');
    await viewThenChange(page, '/?pseudo=1&demo=paused');
    const problems: string[] = [];
    for (const route of ROUTES) {
      await openPseudo(page, route);
      // Open every explanation so its content is scanned too.
      for (const d of await page.locator('details.explain').all())
        await d.locator('summary').click();
      const r = await scan(page);
      problems.push(...r.untranslated.map((u) => `${route} untranslated: ${u}`));
      problems.push(...r.clipped.map((c) => `${route} clipped: ${c}`));
      if (r.overflow > 0) problems.push(`${route} overflows by ${r.overflow}px`);
    }
    // Palette on a mission: the mission-scoped command and search results.
    await openPseudo(page, '/missions/AN-0142');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.type('AN-01');
    const r = await scan(page);
    problems.push(...r.untranslated.map((u) => `palette untranslated: ${u}`));
    problems.push(...r.clipped.map((c) => `palette clipped: ${c}`));
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`Spanish Phase 6 surfaces: no horizontal overflow at ${name}`, async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' })),
    );
    await page.setViewportSize(vp);
    await viewThenChange(page, '/?demo=stress,paused');
    for (const route of ROUTES) {
      await page.goto(`/?demo=stress,paused#${route}`);
      await page.locator('[data-surface="ready"]').waitFor();
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      const o = await overflow(page);
      expect(o, `${route} overflows by ${o}px at ${name}`).toBeLessThanOrEqual(0);
    }
  });
}

test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('phone (320px) Founder flow by touch: markers, mission changes, explanation, palette', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(VIEWPORTS.w320);
    await viewThenChange(page, '/?demo=paused');
    // Provenance stays visible on the phone topbar.
    await expect(page.locator('.provenance__mode')).toBeVisible();
    await expect(page.locator('.provenance__mode')).toContainText('SIMULATED');
    // Marker is text, visible without hover.
    const card = page.getByRole('link', { name: /AN-0142/ });
    await expect(card.getByText('CHANGED')).toBeVisible();
    await card.tap();
    const changes = page.getByRole('region', { name: 'Since you last viewed this mission' });
    await expect(changes.getByText(/Your last view of this mission/)).toBeVisible();
    await expect(changes.locator('[data-coverage]')).toBeVisible();
    await expect(page.locator('.stream__new').first()).toBeVisible();
    // Attention explanation opens on tap.
    await page.goto('/?demo=paused#/missions/AN-0144');
    await page.locator('[data-surface="ready"]').waitFor();
    const why = page.locator('details.explain summary').first();
    await why.tap();
    await expect(
      page.locator('details.explain[open]').getByText('PENDING_FOUNDER_GATE'),
    ).toBeVisible();
    // Tap targets for the new controls are at least 24px.
    for (const el of await page.locator('details.explain summary, .mission-changes .btn').all()) {
      const box = (await el.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});

test('keyboard only: palette → "What changed in this mission?" focuses the changes panel', async ({
  page,
}) => {
  await page.goto('/?demo=paused#/missions/AN-0142');
  await page.locator('[data-surface="ready"]').waitFor();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('changed in this mission');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/missions\/AN-0142\?focus=changes$/);
  await expect(page.locator('[data-focus-id="changes"]')).toBeFocused();
  // Mark mission as seen by keyboard.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Mark mission as seen' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Your last view of this mission/)).toBeVisible();
});

test('reload keeps the mission view; forgetting it returns to UNKNOWN', async ({ page }) => {
  await page.goto('/?demo=paused#/missions/AN-0142');
  await page.locator('[data-surface="ready"]').waitFor();
  await page.getByRole('button', { name: 'Mark mission as seen' }).click();
  await page.reload();
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.getByText(/Your last view of this mission/)).toBeVisible();
  await page.getByRole('button', { name: 'Forget this mission view' }).click();
  await expect(page.getByText(/You have not viewed this mission/)).toBeVisible();
  // Forgotten locally, now; leaving this view later records a new one (by design).
  expect(
    await page.evaluate(() => localStorage.getItem('forge-floor:mission-views') ?? ''),
  ).not.toContain('AN-0142');
});

test('REST with approvals failing: mission attention INCOMPLETE and inspector names the resource', async ({
  page,
}) => {
  await installMockBackend(page, 'approvals-down', Date.parse('2026-09-30T12:00:00Z'));
  await page.goto(`${REST_APP}/#/missions/AN-0144`);
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(
    page
      .getByRole('region', { name: 'Founder attention for this mission' })
      .getByText(/Incomplete/),
  ).toBeVisible();
  await page.goto(`${REST_APP}/#/quality`);
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.locator('[data-available="false"]')).toContainText('approval gates');
});

for (const locale of ['en', 'es', 'pseudo'] as const) {
  test(`axe (WCAG 2.2 AA) on Phase 6 surfaces: ${locale}`, async ({ page }) => {
    if (locale === 'es')
      await page.addInitScript(() =>
        localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' })),
      );
    const base = `/?demo=paused${locale === 'pseudo' ? '&pseudo=1' : ''}`;
    await viewThenChange(page, base);
    const problems: string[] = [];
    for (const route of ['/missions', '/missions/AN-0142', '/missions/AN-0144', '/quality']) {
      await page.goto(`${base}#${route}`);
      await page.locator('[data-surface="ready"]').waitFor();
      for (const d of await page.locator('details.explain summary').all()) await d.click();
      problems.push(...(await axe(page)).map((v) => `${route}: ${v}`));
    }
    expect(problems).toEqual([]);
  });
}
