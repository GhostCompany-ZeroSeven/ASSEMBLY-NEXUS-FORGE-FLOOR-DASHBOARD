import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openPaused } from './helpers';
import { openPseudo, scan } from './pseudo';

/**
 * Phase 9 browser checks for the VISUAL Forge Floor preview: entry points,
 * provenance, the boards, every preview state, reduced motion, keyboard
 * selection, accessibility, overflow in en/es/pseudo, and that the existing
 * operational views are untouched.
 */

const PRESETS = ['countdown', 'countdown-critical', 'accomplished', 'red-alert'] as const;
const VIEWPORTS = [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
];

async function axe(page: Page) {
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('entry: Forge Floor link and command palette open the preview', async ({ page }) => {
  const errors = collectErrors(page);
  await openPaused(page, '/floor');
  await page.getByRole('link', { name: /Visual Forge Floor/ }).click();
  await expect(page).toHaveURL(/#\/visual-floor/);
  await expect(page.getByRole('heading', { level: 1, name: 'Visual Forge Floor' })).toBeVisible();

  await openPaused(page, '/');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.type('visual');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/visual-floor/);
  // The operational Forge Floor stays in the primary navigation.
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Forge Floor' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('provenance, firewall, boards and UNKNOWN states are visible', async ({ page }) => {
  await openPaused(page, '/visual-floor');
  await expect(page.locator('.vf__chip[data-provenance="DEMO"]')).toHaveText(
    'VISUAL PREVIEW · DEMO DATA',
  );
  await expect(page.locator('.vf__firewall')).toContainText('no Assembly Nexus connection');
  for (const name of ['Current mission', 'Alerts board', 'System status'])
    await expect(page.getByRole('heading', { name })).toBeVisible();
  const ann = page.locator('.vf__hud--systems li').filter({ hasText: 'ANN' });
  await expect(ann).toContainText('UNKNOWN');
  await expect(ann).toContainText('not connected in this build');
  await expect(
    page.locator('.vf__hud--systems li').filter({ hasText: 'DEPLOYMENT' }),
  ).toContainText('BLOCKED');
  await expect(page.locator('.vf__flow-list [data-stage="test"]')).toHaveAttribute(
    'data-status',
    'unknown',
  );
});

for (const preset of PRESETS) {
  test(`preset ${preset} renders, is labelled a preset, and passes axe`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPaused(page, `/visual-floor?preview=${preset}`);
    const root = page.locator('.vf');
    await expect(root).toHaveAttribute('data-source', 'preset');
    await expect(page.getByText('PREVIEW PRESET · NOT FROM DATA')).toBeVisible();
    if (preset === 'accomplished') {
      await expect(root).toHaveAttribute('data-mode', 'accomplished');
      await expect(page.locator('.vf__timer--done')).toContainText('MISSION ACCOMPLISHED');
      await expect(page.locator('.vf__timer--done')).toContainText(
        'certifies and approves nothing',
      );
    }
    if (preset === 'red-alert') {
      await expect(root).toHaveAttribute('data-mode', 'red-alert');
      await expect(page.getByRole('alert')).toContainText('RED ALERT · PREVIEW PRESET');
    }
    if (preset === 'countdown')
      await expect(page.locator('.vf__clock')).toHaveText(/^0[0-2]:\d\d:\d\d$/);
    if (preset === 'countdown-critical')
      await expect(page.locator('.vf__hud--mission')).toHaveAttribute('data-critical', 'true');
    expect(await axe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the preview state radios are keyboard operable', async ({ page }) => {
  await openPaused(page, '/visual-floor');
  const radio = page.getByRole('radio', { name: 'From data' });
  await radio.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/preview=countdown/);
  await expect(page.locator('.vf')).toHaveAttribute('data-source', 'preset');
});

test('characters are keyboard-selectable; Escape closes the details', async ({ page }) => {
  await openPaused(page, '/visual-floor');
  const spot = page.locator('.vf__hotspot[data-station="sci-1"]');
  await spot.focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: 'Details', exact: true });
  await expect(heading).toBeFocused();
  await expect(page.locator('.vf__detail')).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.vf__detail')).toHaveCount(0);
  // Boards open their details too.
  await page.locator('.vf__hud--mission .vf__details-btn').click();
  await expect(page.locator('.vf__detail')).toContainText('Stage statuses map from mission fields');
});

test('reduced motion: the scene does not animate; full motion does', async ({ page }) => {
  const running = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('.vf *')].filter(
          (el) => getComputedStyle(el).animationName !== 'none',
        ).length,
    );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openPaused(page, '/visual-floor?preview=red-alert');
  expect(await running()).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('.vf').waitFor();
  expect(await running()).toBe(0);
});

for (const vp of VIEWPORTS) {
  test(`no page overflow at ${vp.width}px in en and es`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openPaused(page, '/visual-floor');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await openPaused(page, '/visual-floor?preview=red-alert&station=sci-1');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test('Spanish: no page overflow and Spanish labels', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?demo=paused#/visual-floor?preview=red-alert');
    await page.locator('[data-surface="ready"]').waitFor();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('alert')).toContainText('ALERTA ROJA');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  }
});

test('pseudo-locale: no untranslated text, clipping or overflow', async ({ page }) => {
  const problems: string[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/visual-floor',
      '/visual-floor?preview=accomplished',
      '/visual-floor?preview=red-alert&station=sci-1',
    ]) {
      await openPseudo(page, route);
      const r = await scan(page);
      problems.push(...r.untranslated.map((u) => `${width} ${route} untranslated: ${u}`));
      problems.push(...r.clipped.map((c) => `${width} ${route} clipped: ${c}`));
      if (r.overflow > 0) problems.push(`${width} ${route} overflows by ${r.overflow}px`);
    }
  }
  expect(problems).toEqual([]);
});

test('existing operational views still render', async ({ page }) => {
  const errors = collectErrors(page);
  for (const route of ['/', '/floor', '/missions/AN-0142', '/workers', '/approvals', '/alerts']) {
    await openPaused(page, route);
    await page.locator('[data-surface="ready"]').waitFor();
  }
  expect(errors).toEqual([]);
});
