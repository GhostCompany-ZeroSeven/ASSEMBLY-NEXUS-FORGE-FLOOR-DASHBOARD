import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openPaused } from './helpers';
import { openPseudo, scan } from './pseudo';

/**
 * Browser checks for the Founder universe (approved Baby Ghost/skull focal,
 * Snow Wolf Crew, eight Crown-Tops, banner and humor). Decorative hotspots are
 * keyboard-reachable and accessible, and nothing overflows in en or
 * pseudo-locale. Phase 9 states/firewall/motion stay covered by phase9.spec.
 */

async function axe(page: Page) {
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('universe renders: 8 approved Crown-Tops, 8 crew, Baby Ghost/skull focal and sprites', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPaused(page, '/visual-floor');
  const svg = page.locator('.vf__art svg');
  await expect(svg.locator('[data-character="crown-top"]')).toHaveCount(8);
  await expect(svg.locator('[data-founder-asset="CROWN_TOP_04"]')).toHaveCount(1);
  const shadesII = svg.locator('[data-founder-asset="CROWN_TOP_07"]');
  await expect(shadesII).toHaveCount(1);
  await expect(shadesII).toHaveAttribute(
    'href',
    /crown-top-scientist-07-shades-ii-transparent\.webp$/,
  );
  await expect(svg.locator('[data-character="snow-wolf"]')).toHaveCount(8);
  await expect(svg.locator('[data-founder-focal="sacred-cyber-skull"]')).toHaveCount(1);
  const canonicalBaby = svg.locator('[data-character="baby-ghost-canon"]');
  await expect(canonicalBaby).toHaveCount(1);
  await expect(canonicalBaby).toHaveAttribute('href', /baby-ghost-transparent\.webp$/);
  await expect(canonicalBaby).toHaveAttribute('data-canonical-baby-ghost', 'true');
  const babyBox = await canonicalBaby.boundingBox();
  expect(babyBox).not.toBeNull();
  expect(babyBox!.width).toBeGreaterThan(100);
  expect(babyBox!.height).toBeGreaterThan(100);
  await expect(svg.locator('[data-character="07-ghost-sprite"]')).toHaveCount(2);
  await expect(
    svg.locator('[data-character="07-ghost-sprite"][data-canonical-baby-ghost="false"]'),
  ).toHaveCount(2);
  await expect(svg.locator('[data-banner="boldness"]')).toBeVisible();
  // Every principal character is actually on screen (inside the scene box).
  const box = (await page.locator('.vf__canvas').boundingBox())!;
  for (const sel of ['[data-character="crown-top"]', '[data-character="snow-wolf"]']) {
    for (const b of await svg
      .locator(sel)
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(b.width).toBeGreaterThan(20);
      expect(b.x).toBeGreaterThanOrEqual(box.x - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
  }
  expect(errors).toEqual([]);
});

test('07 Ghost Sprite and crew are keyboard-selectable with truthful details; axe clean', async ({
  page,
}) => {
  await openPaused(page, '/visual-floor');
  await page.locator('.vf__hotspot[data-station="wisp-1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.vf__detail')).toContainText('07 Ghost Sprite');
  await expect(page.locator('.vf__detail')).toContainText(
    'separate from the Founder-approved Baby Ghost',
  );
  await expect(page.locator('.vf__detail')).toContainText('not a worker, a runtime or a fact');
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('.vf__hotspot[data-station="ban-5"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.vf__detail')).toContainText('Snow Wolf Crew · Boxer');
  await expect(page.locator('.vf__detail')).toContainText('Approved knitted balaclava');
  expect(await axe(page)).toEqual([]);
});

test('accomplished and red-alert presets keep the universe and the provenance', async ({
  page,
}) => {
  for (const preset of ['accomplished', 'red-alert']) {
    await openPaused(page, `/visual-floor?preview=${preset}`);
    await expect(page.locator('.vf__art [data-character="snow-wolf"]')).toHaveCount(8);
    await expect(page.locator('.vf__chip[data-provenance]')).toContainText('VISUAL PREVIEW');
    await expect(page.getByText('PREVIEW PRESET · NOT FROM DATA')).toBeVisible();
  }
});

test('pseudo-locale: persona labels translated, no clipping or overflow', async ({ page }) => {
  const problems: string[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/visual-floor?station=ban-8', '/visual-floor?station=wisp-2']) {
      await openPseudo(page, route);
      const r = await scan(page);
      problems.push(...r.untranslated.map((u) => `${width} ${route} untranslated: ${u}`));
      problems.push(...r.clipped.map((c) => `${width} ${route} clipped: ${c}`));
      if (r.overflow > 0) problems.push(`${width} ${route} overflows by ${r.overflow}px`);
    }
  }
  expect(problems).toEqual([]);
});

test('narrow view starts on the intentional Founder focal frame and retains factual panels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPaused(page, '/visual-floor');
  const stage = page.locator('.vf__stage-scroll');
  await expect.poll(() => stage.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('[data-character="baby-ghost-canon"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current mission' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alerts board' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System status' })).toBeVisible();
});
