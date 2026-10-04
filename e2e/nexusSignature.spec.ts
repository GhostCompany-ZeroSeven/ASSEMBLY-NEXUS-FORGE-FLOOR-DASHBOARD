import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openPaused, ROUTES } from './helpers';

/**
 * Nexus Signature is THE dashboard presentation: explicit panel families,
 * protected Founder amber, a green APPROVE action distinct from the APPROVED
 * state, visible keyboard focus, no horizontal overflow, quiet under reduced
 * motion, and no "classic" theme to switch back to.
 */

/** [r, g, b] in 0–255 from `rgb(…)` or a color-mix result `color(srgb r g b / a)`. */
const rgb = (s: string) => {
  const n = (s.match(/\d*\.?\d+/g) ?? []).slice(0, 3).map(Number);
  return s.startsWith('color(') ? n.map((v) => v * 255) : n;
};

async function axe(page: Page) {
  const r = await new AxeBuilder({
    page,
  } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('every titled panel declares a family; Founder panels are amber, ops cyan', async ({
  page,
}) => {
  await openPaused(page, '/?field=off');
  const families = await page
    .locator('section.panel')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.family));
  expect(families.length).toBeGreaterThan(5);
  expect(families.every((f) => !!f)).toBe(true);
  const border = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((e) => getComputedStyle(e).borderTopColor);
  const founder = rgb(await border('section.panel[data-family="founder"]'));
  expect(founder[0]).toBeGreaterThan(200); // amber: strong red + green, little blue
  expect(founder[1]).toBeGreaterThan(150);
  expect(founder[2]).toBeLessThan(80);
  const ops = rgb(await border('section.panel[data-family="ops"]'));
  expect(ops[2]).toBeGreaterThan(200); // cyan
  expect(ops[0]).toBeLessThan(120);
});

test('APPROVE is a green action; APPROVED is a filled lime state; HOLD UV; DENY red', async ({
  page,
}) => {
  await openPaused(page, '/approvals');
  const gate = page.getByRole('group', { name: 'Decide APR-031' });
  const colour = async (name: RegExp) =>
    rgb(
      await gate.getByRole('button', { name }).evaluate((e) => getComputedStyle(e).borderTopColor),
    );
  const [ar, ag, ab] = await colour(/^approve/i);
  expect(ag).toBeGreaterThan(ar! + 60);
  expect(ag).toBeGreaterThan(ab! + 60);
  const [hr, , hb] = await colour(/hold/i);
  expect(hb).toBeGreaterThan(200); // ultraviolet
  expect(hr).toBeGreaterThan(120);
  const [dr, dg] = await colour(/^deny/i);
  expect(dr).toBeGreaterThan(200);
  expect(dg).toBeLessThan(100);
  // The decided state badge is filled, unlike the outlined action.
  const approved = page.locator(".gate[data-status='APPROVED'] .gate__head .badge").first();
  await expect(approved).toBeVisible();
  const bg = rgb(await approved.evaluate((e) => getComputedStyle(e).backgroundColor));
  expect(bg[1]).toBeGreaterThan(200); // lime fill
  const actionBg = rgb(
    await gate
      .getByRole('button', { name: /^approve/i })
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  expect(actionBg[1]).toBeLessThan(100); // the action is dark inside, not a filled state
});

test('keyboard focus stays visible on Nexus controls', async ({ page }) => {
  await openPaused(page, '/approvals');
  const approve = page.getByRole('group', { name: 'Decide APR-031' }).getByRole('button', {
    name: /^approve/i,
  });
  await approve.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(approve).toBeFocused();
  const outline = await approve.evaluate((e) => {
    const s = getComputedStyle(e);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test('there is no Classic theme: Settings offers the Nexus Signature default and Snow Wolf', async ({
  page,
}) => {
  await openPaused(page, '/settings');
  const options = await page
    .getByRole('combobox', { name: /theme/i })
    .locator('option')
    .allTextContents();
  expect(options).toEqual(['Nexus Signature', 'Snow Wolf']);
  expect(options.join(' ')).not.toMatch(/classic/i);
});

test('the critical-alert sidenav count meets WCAG AA contrast (axe cannot judge 1–2 digit text)', async ({
  page,
}) => {
  await openPaused(page, '/alerts');
  for (let i = 0; i < 7; i++) await page.keyboard.press('n');
  const count = page.locator('.sidenav__count[data-tone="danger"]');
  await expect(count).toBeVisible();
  const [fg, bg] = await count.evaluate((e) => {
    const s = getComputedStyle(e);
    return [s.color, s.backgroundColor];
  });
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(rgb(fg)), lum(rgb(bg))].sort((a, b) => b - a);
  expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
});

test('axe on the Visual Forge Floor with Nexus HUD frames', async ({ page }) => {
  await openPaused(page, '/visual-floor');
  expect(await axe(page)).toEqual([]);
  const families = await page
    .locator('.vf__panel')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.family));
  expect(families.length).toBeGreaterThanOrEqual(4);
  expect(families.every((f) => !!f)).toBe(true);
});

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`no horizontal page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [...ROUTES, '/visual-floor']) {
      await openPaused(page, route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} @${width}`).toBeLessThanOrEqual(1);
    }
  });
}

test('reduced motion: nothing decorative keeps animating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/', '/approvals', '/missions', '/visual-floor']) {
    await openPaused(page, route);
    await page.waitForTimeout(200);
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.playState === 'running' && (a.effect?.getTiming().iterations ?? 1) > 1)
          .length,
    );
    expect(running, route).toBe(0);
  }
});
