import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openPaused } from './helpers';

/**
 * Nexus ambient dot field (C5 mechanism) — acceptance tests on the real
 * canvas pixels: a fixed 34px lattice; the pointer changes only the radius,
 * opacity and blur of dots within 150px of its CURRENT position.
 */

const S = 34;
const R = 150;
/**
 * A resting dot: #161B26 at full opacity, radius 1px. Centred on a pixel
 * corner it antialiases over four pixels (~75% coverage each), so a pixel
 * test checks its colour and partial coverage rather than one solid pixel.
 */
const isRest = (p: number[]) =>
  Math.abs(p[0]! - 22) <= 2 &&
  Math.abs(p[1]! - 27) <= 2 &&
  Math.abs(p[2]! - 38) <= 2 &&
  p[3]! >= 150 &&
  p[3]! <= 230;
const field = (page: Page) => page.locator('canvas.nx-field');
const stats = (page: Page) =>
  field(page).evaluate((c) => ({ ...(c as HTMLCanvasElement).dataset }));
const box = async (page: Page) => (await field(page).boundingBox())!;

/** RGBA of the canvas at local CSS px (DPR 1 in these tests). */
const pixel = (page: Page, x: number, y: number) =>
  field(page).evaluate(
    (c, [x, y]) =>
      Array.from(
        (c as HTMLCanvasElement)
          .getContext('2d')!
          .getImageData(Math.round(x!), Math.round(y!), 1, 1).data,
      ),
    [x, y],
  );

/** A fingerprint of every non-transparent pixel position (the drawn geometry). */
const geometry = (page: Page) =>
  field(page).evaluate((c) => {
    const cv = c as HTMLCanvasElement;
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    let h = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) h = (h * 31 + i) | 0;
    return h;
  });

/** Lattice points (local px) at distance band [from, to) of a local point. */
async function latticeAround(page: Page, px: number, py: number, from: number, to: number) {
  const b = await box(page);
  const out: [number, number][] = [];
  for (let y = 0; y <= b.height; y += S)
    for (let x = 0; x <= b.width; x += S) {
      const d = Math.hypot(x - px, y - py);
      if (d >= from && d < to && x < b.width && y < b.height) out.push([x, y]);
    }
  return out;
}

async function pointAt(page: Page, x: number, y: number) {
  const b = await box(page);
  await page.mouse.move(b.x + x, b.y + y);
  await expect.poll(async () => (await stats(page)).state).toBe('lit');
}

test('ON by default on the Command Center; ?field=off never requests the renderer', async ({
  page,
}) => {
  await openPaused(page, '/');
  await expect(field(page)).toHaveCount(1);
  await expect(field(page)).toHaveAttribute('data-field-mode', 'full');
  const chunks: string[] = [];
  page.on('request', (r) => chunks.push(r.url()));
  await page.goto('about:blank');
  await openPaused(page, '/?field=off');
  await expect(field(page)).toHaveCount(0);
  expect(chunks.filter((u) => /NexusFieldCanvas/.test(u))).toEqual([]);
});

test('Command Center only: other routes ignore the toggle', async ({ page }) => {
  for (const route of ['/missions', '/alerts?field=full', '/visual-floor?field=full']) {
    await openPaused(page, route);
    await expect(field(page), route).toHaveCount(0);
  }
});

test('TEST 3 rest: no pointer → every dot at rest; a faint lattice and nothing else', async ({
  page,
}) => {
  await openPaused(page, '/?field=full');
  await expect(field(page)).toHaveCount(1);
  const s = await stats(page);
  expect(s.state).toBe('rest');
  expect(s.lit).toBe('0');
  expect(isRest(await pixel(page, 5 * S, 3 * S))).toBe(true);
  expect((await pixel(page, 5 * S + 17, 3 * S + 17))[3]).toBe(0); // between dots: nothing
});

test('TEST 1 + 11 positions never change; pointer exit restores the exact resting field', async ({
  page,
}) => {
  await openPaused(page, '/?field=full');
  await expect(field(page)).toHaveCount(1);
  const rest = await geometry(page);
  for (const [x, y] of [
    [5 * S, 3 * S],
    [18 * S, 4 * S],
    [26 * S, 12 * S],
  ]) {
    await pointAt(page, x!, y!);
    // The lit dot under the pointer is solid exactly on its lattice point.
    expect((await pixel(page, x!, y!))[3]).toBe(255);
  }
  await page.mouse.move(100, 400); // onto the side nav: off the surface
  await expect.poll(async () => (await stats(page)).state).toBe('rest');
  expect((await stats(page)).lit).toBe('0');
  expect(await geometry(page)).toBe(rest);
});

test('pointer exit: the lit dots dim in place, then the field is exactly at rest', async ({
  page,
}) => {
  await openPaused(page, '/?field=full');
  await expect(field(page)).toHaveCount(1);
  const rest = await geometry(page);
  await pointAt(page, 10 * S, 5 * S);
  await page.mouse.move(100, 400); // onto the side nav
  // Never a frozen scanner: the state leaves "lit" at once and settles at rest.
  await expect.poll(async () => (await stats(page)).state).not.toBe('lit');
  await expect.poll(async () => (await stats(page)).state, { timeout: 2000 }).toBe('rest');
  expect(await geometry(page)).toBe(rest);
  const f = (await stats(page)).frames;
  await page.waitForTimeout(300);
  expect((await stats(page)).frames).toBe(f); // no work at rest
});

test('circular cursor: a precise reticle over open space only, never over controls or text', async ({
  page,
}) => {
  await openPaused(page, '/?field=full');
  await expect(field(page)).toHaveCount(1);
  const reticle = page.locator('.nx-reticle');
  await expect(reticle).toHaveAttribute('aria-hidden', 'true');
  await expect(reticle).toHaveCSS('pointer-events', 'none');
  const pageRoot = page.locator('.page--field');
  // Open space in the page header, right of the title.
  await page.mouse.move(1000, 95);
  await page.mouse.move(1001, 96);
  await expect(reticle).toHaveAttribute('data-visible', 'true');
  await expect(pageRoot).toHaveCSS('cursor', 'none');
  const b = (await reticle.boundingBox())!;
  expect(b.width).toBeLessThanOrEqual(16); // small instrument, not an orb
  expect(Math.abs(b.x + b.width / 2 - 1001)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.y + b.height / 2 - 96)).toBeLessThanOrEqual(1);
  // Over a panel the native cursor returns and the reticle hides.
  const panel = (await page.locator('.panel').first().boundingBox())!;
  await page.mouse.move(panel.x + panel.width / 2, panel.y + 40);
  await expect(reticle).toHaveAttribute('data-visible', 'false');
  await expect(pageRoot).not.toHaveCSS('cursor', 'none');
  // Leaving the surface hides it too.
  await page.mouse.move(100, 400);
  await expect(reticle).toHaveAttribute('data-visible', 'false');
  // Clicks still reach the controls under the pointer.
  await page.getByRole('link', { name: 'Open mission' }).click();
  await expect(page).toHaveURL(/#\/missions\/AN-0144/);
});

test('TEST 2 no randomness: identical geometry across reloads and identical lit frames', async ({
  page,
}) => {
  await openPaused(page, '/?field=reduced'); // colour cycle frozen at t = 0
  const a = await geometry(page);
  await pointAt(page, 12 * S + 9, 5 * S + 4);
  const litA = await field(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.mouse.move(100, 400); // off the surface
  await page.reload();
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(field(page)).toHaveCount(1);
  expect(await geometry(page)).toBe(a);
  await pointAt(page, 12 * S + 9, 5 * S + 4);
  expect(await field(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(litA);
});

test('TEST 4 cursor centre: the dot under the pointer is a full-strength core', async ({
  page,
}) => {
  await openPaused(page, '/?field=reduced'); // t = 0: colour of (col,row) is known
  const col = 10;
  const row = 4;
  await pointAt(page, col * S, row * S);
  const phase = ((col * 3 + row * 5) / 8) % 1;
  const colours = [
    [177, 76, 255],
    [157, 255, 60],
    [60, 230, 255],
  ];
  const expected = colours[Math.floor(phase * 3) % 3]!;
  expect(await pixel(page, col * S, row * S)).toEqual([...expected, 255]);
  // Core radius 2.6px: the pixel spanning 1–2px out is solid core; the one
  // spanning 4–5px out is glow only (glow radius 5px, blurred).
  expect((await pixel(page, col * S + 1, row * S))[3]).toBe(255);
  const glow = (await pixel(page, col * S + 4, row * S))[3]!;
  expect(glow).toBeGreaterThan(0);
  expect(glow).toBeLessThan(255);
});

test('TEST 5 + 6 boundary at 150px and lit population ≈ 61', async ({ page }) => {
  await openPaused(page, '/?field=full');
  const [px, py] = [17 * S + 11, 9 * S + 7];
  await pointAt(page, px, py);
  const lit = Number((await stats(page)).lit);
  expect(lit).toBe((await latticeAround(page, px, py, 0, R + 0.0001)).length);
  expect(lit).toBeGreaterThanOrEqual(55);
  expect(lit).toBeLessThanOrEqual(67);
  for (const [x, y] of await latticeAround(page, px, py, R + 0.0001, R + 60))
    expect(isRest(await pixel(page, x, y)), `${x},${y}`).toBe(true);
  for (const [x, y] of await latticeAround(page, px, py, 0, R - 20))
    expect(isRest(await pixel(page, x, y))).toBe(false);
});

test('TEST 7 + 8 no trail, no cursor object', async ({ page }) => {
  await openPaused(page, '/?field=full');
  await expect(field(page)).toHaveCount(1);
  const b = await box(page);
  for (let x = 0; x < b.width; x += 60) await page.mouse.move(b.x + x, b.y + 300);
  const [px, py] = [8 * S + 17, 12 * S + 17]; // midway between four dots
  await pointAt(page, px, py);
  // Nothing lit except around the CURRENT pointer.
  const far = await latticeAround(page, px, py, R + 1, 4000);
  for (const [x, y] of far.filter((_, i) => i % 7 === 0))
    expect(isRest(await pixel(page, x, y))).toBe(true);
  // No cursor sprite: the pixel under the pointer (between dots) stays near-empty.
  expect((await pixel(page, px, py))[3]).toBeLessThan(40);
});

test('TEST 9 behind the content, pointer-transparent, hidden from assistive tech', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(new Date('2026-09-30T12:00:00Z'));
  await openPaused(page, '/?field=off');
  const off = await page.locator('main').ariaSnapshot();
  await openPaused(page, '/?field=full');
  const c = field(page);
  await expect(c).toHaveAttribute('aria-hidden', 'true');
  await expect(c).toHaveCSS('pointer-events', 'none');
  await expect(c).toHaveCSS('z-index', '-1');
  expect(await page.locator('main').ariaSnapshot()).toBe(off);
  const hits = await page.evaluate(() =>
    [
      [600, 75],
      [1430, 120],
      [700, 420],
      [1025, 300],
    ].map(([x, y]) => document.elementFromPoint(x!, y!)?.classList.contains('nx-field')),
  );
  expect(hits.every((h) => !h)).toBe(true);
  const r = await new AxeBuilder({
    page,
  } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('link', { name: 'Open mission' }).click();
  await expect(page).toHaveURL(/#\/missions\/AN-0144/);
  expect(errors).toEqual([]);
});

test('FULL: the colour cycle runs only while lit; the field is static at rest', async ({
  page,
}) => {
  await openPaused(page, '/?field=full');
  await expect(field(page)).toHaveCount(1);
  const f0 = (await stats(page)).frames;
  await page.waitForTimeout(400);
  expect((await stats(page)).frames).toBe(f0); // no animation at rest
  await pointAt(page, 400, 200);
  const t0 = (await stats(page)).t;
  await expect.poll(async () => (await stats(page)).t).not.toBe(t0); // cycle advances
  expect((await stats(page)).cycle).toBe('running');
});

test('TEST 10 reduced motion: cycle frozen, proximity response direct, no extra frames', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPaused(page, '/?field=full');
  await expect(field(page)).toHaveAttribute('data-field-mode', 'reduced');
  await pointAt(page, 400, 200);
  const s = await stats(page);
  expect(s.cycle).toBe('frozen');
  expect(s.t).toBe('0.0000');
  expect(Number(s.lit)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  expect((await stats(page)).frames).toBe(s.frames); // pointer still: nothing redraws
  await page.mouse.move((await box(page)).x + 600, (await box(page)).y + 300);
  await expect
    .poll(async () => Number((await stats(page)).frames))
    .toBeGreaterThan(Number(s.frames));
});

test('a hidden tab stops all drawing', async ({ page }) => {
  await openPaused(page, '/?field=full');
  await pointAt(page, 400, 200);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(field(page)).toHaveAttribute('data-paused', 'true');
  const f = (await stats(page)).frames;
  await page.waitForTimeout(400);
  expect((await stats(page)).frames).toBe(f);
});

test('TEST 12 Snow Wolf theme: the field works and the page is unchanged', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ themeId: 'snow-wolf' })),
  );
  await page.clock.setFixedTime(new Date('2026-09-30T12:00:00Z'));
  await openPaused(page, '/?field=off');
  const text = await page.locator('main').innerText();
  await openPaused(page, '/?field=full');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'snow-wolf');
  await pointAt(page, 400, 200);
  expect(await page.locator('main').innerText()).toBe(text);
  expect(isRest(await pixel(page, 12 * S, 6 * S))).toBe(false);
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('a tap never lights the field or leaves a stuck reticle', async ({ page }) => {
    await openPaused(page, '/?field=full');
    await expect(field(page)).toHaveCount(1);
    await page.locator('.page__title').tap();
    expect((await stats(page)).state).toBe('rest');
    await expect(page.locator('.nx-reticle')).toHaveAttribute('data-visible', 'false');
    await expect(page.locator('.nx-reticle')).toBeHidden();
  });
});
