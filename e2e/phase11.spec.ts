import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openPaused } from './helpers';
import { openPseudo, scan } from './pseudo';

/**
 * Phase 11 browser checks: role/station labels on the visual Crown-Top desks
 * (no demo worker names on characters), Crown-Top family avatars on the
 * factual views, accessibility and pseudo-locale of the new texts.
 */

async function axe(page: Page) {
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

for (const width of [820, 1920]) {
  test(`role/station labels are readable and no worker names sit on characters at ${width}px`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height: 1080 });
    await openPaused(page, '/visual-floor');
    const plates = page.locator('.vf__nameplate--role');
    await expect(plates).toHaveCount(8);
    for (const p of await plates.all()) {
      await expect(p).toBeVisible();
      const box = (await p.boundingBox())!;
      expect(box.height).toBeGreaterThan(8);
    }
    const stage = page.locator('.vf__canvas');
    for (const name of [
      'Bramwell',
      'Ada',
      'Otto',
      'Mina',
      'Cyrus',
      'Pim',
      'Hedda',
      'Rook',
      'Juniper',
    ])
      await expect(stage).not.toContainText(new RegExp(`\\b${name}\\b`));
    expect(errors).toEqual([]);
  });
}

test('a Crown-Top station detail is keyboard-reachable, truthful and accessible', async ({
  page,
}) => {
  await openPaused(page, '/visual-floor');
  await page.locator('.vf__hotspot[data-station="sci-7"]').focus();
  await page.keyboard.press('Enter');
  const d = page.locator('.vf__detail');
  await expect(d).toContainText('OPERATIONS station (younger generation)');
  await expect(d).toContainText('not a worker, an Associate or an authority');
  await expect(page.getByRole('heading', { name: 'Details', exact: true })).toBeFocused();
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
});

test('factual views render Crown-Top family avatars (chrome and stubble)', async ({ page }) => {
  for (const route of ['/floor', '/workers']) {
    await openPaused(page, route);
    const crowns = await page
      .locator('[data-character="crown-top-avatar"]')
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-crown')))].sort());
    expect(crowns).toEqual(['chrome', 'stubble']);
    expect(await axe(page)).toEqual([]);
  }
});

test('pseudo-locale: station texts translated, no clipping or overflow', async ({ page }) => {
  const problems: string[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/visual-floor', '/visual-floor?station=sci-5']) {
      await openPseudo(page, route);
      const r = await scan(page);
      problems.push(...r.untranslated.map((u) => `${width} ${route} untranslated: ${u}`));
      problems.push(...r.clipped.map((c) => `${width} ${route} clipped: ${c}`));
      if (r.overflow > 0) problems.push(`${width} ${route} overflows by ${r.overflow}px`);
    }
  }
  expect(problems).toEqual([]);
});
