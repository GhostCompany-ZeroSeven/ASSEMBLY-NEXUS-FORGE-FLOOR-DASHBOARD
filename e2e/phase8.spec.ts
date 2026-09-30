import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './helpers';
import { scan } from './pseudo';
import { go, openRuntime, wireEvent } from './runtimeMock';

/**
 * Phase 8: the adapter-contract panel in the data-quality inspector, against
 * the real runtime mock (build-declared MOCK profile) and the demo (SIMULATED).
 * It states, observes and separates; it never approves, certifies or scores.
 */
test.describe.configure({ timeout: 90_000 });

const panel = (page: Page) => page.locator('[data-focus-id="contract"]');
const ruleRow = (page: Page, id: string) => panel(page).locator(`[data-rule="${id}"]`);

test('runtime mock: MOCK profile, not approved, observations separate from guarantees', async ({
  page,
}, info) => {
  const errors = collectErrors(page);
  const mock = await openRuntime(page, info, '/quality?focus=contract');
  await expect(panel(page).locator('[data-profile-kind="MOCK"]')).toContainText('MOCK PROFILE');
  await expect(panel(page)).toContainText('not the Assembly Nexus contract');
  await expect(panel(page).locator('[data-founder-approved="false"]')).toContainText(
    'not approved',
  );
  await expect(panel(page).locator('[data-history-assured="true"]')).toBeVisible();
  await expect(panel(page).locator('[data-environment="mock"]')).toBeVisible();
  // Before anything happens: nothing seen is NOT a pass.
  await expect(ruleRow(page, 'DUPLICATE_DELIVERY')).toHaveAttribute(
    'data-observed',
    'none-observed',
  );
  await expect(ruleRow(page, 'DUPLICATE_DELIVERY')).toContainText('this is not a pass');

  // Inject a transport duplicate and a same-id conflict.
  await mock.events('list', [wireEvent('p8-dup', -3000), wireEvent('p8-dup', -3000)]);
  await mock.events('stream', [wireEvent('p8-clash', -2000)]);
  await mock.events('list', [wireEvent('p8-clash', -9_000_000, { missionId: 'AN-0141' })]);
  await expect(ruleRow(page, 'DUPLICATE_DELIVERY')).toHaveAttribute('data-observed', 'observed', {
    timeout: 15_000,
  });
  await expect(ruleRow(page, 'SAME_ID_CONFLICT_SEMANTICS')).toHaveAttribute(
    'data-observed',
    'observed',
  );
  // A conflicting report CONTRADICTS uniqueness/stability, and the profile's
  // guarantee stays what the profile says: observation != guarantee.
  for (const id of ['EVENT_ID_UNIQUENESS', 'EVENT_ID_STABILITY']) {
    await expect(ruleRow(page, id)).toHaveAttribute('data-observed', 'violation-observed');
    await expect(ruleRow(page, id)).toHaveAttribute('data-guarantee', 'GUARANTEED');
  }
  // Then a history gap: the window moves past everything listed before.
  await mock.fixture({ op: 'events.window', size: 5 });
  await mock.bulk({ count: 40, deliver: 'list', prefix: 'p8-win' });
  await expect(ruleRow(page, 'HISTORY_TRUNCATION_SIGNAL')).toHaveAttribute(
    'data-observed',
    'observed',
    { timeout: 15_000 },
  );
  // Counts describe the CURRENT data (issues are per sync): the duplicate has
  // left the listing, so it is no longer counted. The gap time is kept.
  await expect(ruleRow(page, 'DUPLICATE_DELIVERY')).toHaveAttribute(
    'data-observed',
    'none-observed',
  );
  await expect(panel(page)).toContainText('Seen in the current data');
  await expect(ruleRow(page, 'LISTING_WINDOW_CONTIGUITY')).toHaveAttribute(
    'data-observed',
    'not-observable',
  );
  // No controls, no score, no approval wording.
  await expect(panel(page).getByRole('button')).toHaveCount(0);
  await expect(panel(page)).not.toContainText(/\d+\s?%|\bscore\b|certified/i);
  expect(errors).toEqual([]);
});

test('demo: SIMULATED, no source contract applies, rules not applicable', async ({ page }) => {
  await page.goto('/?demo=paused#/quality?focus=contract');
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(panel(page).locator('[data-profile-kind="SIMULATED"]')).toBeVisible();
  await expect(panel(page).locator('[data-rule]')).toHaveCount(14);
  await expect(panel(page).locator('[data-observed="not-applicable"]')).toHaveCount(14);
  await expect(panel(page).locator('[data-guarantee="GUARANTEED"]')).toHaveCount(0);
});

const WIDTHS = { w320: 320, w390: 390, w1440: 1440, w2560: 2560 } as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const [name, width] of Object.entries(WIDTHS)) {
  for (const locale of ['en', 'es', 'pseudo'] as const) {
    test(`contract panel ${locale} at ${name}: no overflow${locale === 'pseudo' ? ', untranslated text or clipping' : ''}${width === 1440 ? ', axe clean' : ''}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      if (locale === 'es')
        await page.addInitScript(() =>
          localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' })),
        );
      const mock = await openRuntime(page, info, '/quality');
      if (locale === 'pseudo') {
        await page.goto(`${mock.origin}/?pseudo=1#/quality`);
        await page.locator('[data-surface="ready"]').waitFor();
      }
      await mock.events('list', [wireEvent('s8-dup', -3000), wireEvent('s8-dup', -3000)]);
      await mock.events('stream', [wireEvent('s8-clash', -2000)]);
      await mock.events('list', [wireEvent('s8-clash', -9_000_000, { missionId: 'AN-0141' })]);
      await expect(panel(page).locator('[data-rule="DUPLICATE_DELIVERY"]')).toHaveAttribute(
        'data-observed',
        'observed',
        { timeout: 15_000 },
      );
      await go(page, '/quality?focus=contract');
      const problems: string[] = [];
      if (locale === 'pseudo') {
        const r = await scan(page);
        problems.push(...r.untranslated.map((u) => `untranslated: ${u}`));
        problems.push(...r.clipped.map((c) => `clipped: ${c}`));
        if (r.overflow > 0) problems.push(`overflows by ${r.overflow}px`);
      } else {
        const o = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (o > 0) problems.push(`overflows by ${o}px`);
      }
      if (width === 1440) {
        const r = await new AxeBuilder({
          page,
        } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
          .withTags(TAGS)
          .analyze();
        problems.push(
          ...r.violations.map(
            (v) => `axe ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
          ),
        );
      }
      expect(problems).toEqual([]);
    });
  }
}
