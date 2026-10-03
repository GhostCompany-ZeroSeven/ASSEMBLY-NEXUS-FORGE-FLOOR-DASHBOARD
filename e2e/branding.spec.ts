import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openPaused } from './helpers';

/**
 * Founder branding geometry, measured in the rendered page: the five-line
 * identity hierarchy is a composed mark (A•N spans Assembly's m|b → y|▪, the
 * G of Ghost sits under the W of Wolf), the square is the SMALL square, and
 * the hollow and filled circles have the same visible diameter.
 */

const LINES = [
  'Founder #0007',
  'A•N',
  '《Assembly▪︎Nexus》',
  'Wolf◇Technologies',
  'Ghost○●Company-07',
];

interface Geometry {
  text: string[];
  W: number;
  G: number;
  m: [number, number];
  b: [number, number];
  y: [number, number];
  sq: [number, number];
  A: number;
  N: number;
  circles: number[];
  square: number;
  xHeight: number;
  em: number;
  overflow: number;
}

async function measure(page: Page, selector: string): Promise<Geometry> {
  await page.locator(selector).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((sel) => {
    const ol = document.querySelector<HTMLElement>(sel)!;
    const items = [...ol.querySelectorAll<HTMLElement>(':scope > li')];
    const box = (li: HTMLElement, index: number) => {
      const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
      let rest = index;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const len = (n as Text).length;
        if (rest < len) {
          const r = document.createRange();
          r.setStart(n, rest);
          r.setEnd(n, rest + 1);
          const b = r.getBoundingClientRect();
          return [b.left, b.right] as [number, number];
        }
        rest -= len;
      }
      throw new Error(`no character ${index}`);
    };
    const ctx = document.createElement('canvas').getContext('2d')!;
    const ink = (el: HTMLElement, s: string) => {
      // Measured at a 100px probe and scaled: canvas ink bounds are whole pixels.
      const cs = getComputedStyle(el);
      const k = parseFloat(cs.fontSize) / 100;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
      const t = ctx.measureText(s);
      return {
        w: (t.actualBoundingBoxLeft + t.actualBoundingBoxRight) * k,
        h: (t.actualBoundingBoxAscent + t.actualBoundingBoxDescent) * k,
        top: t.actualBoundingBoxAscent * k,
      };
    };
    const asm = items[2]!;
    const asmText = asm.textContent!;
    const an = items[1]!;
    const glyphs = [...ol.querySelectorAll<HTMLElement>('.brand-glyph')];
    const size = (g: HTMLElement) => {
      const i = ink(g, g.textContent!);
      return Math.max(i.w, i.h);
    };
    return {
      text: items.map((li) => li.textContent!),
      W: box(items[3]!, 0)[0],
      G: box(items[4]!, 0)[0],
      m: box(asm, asmText.indexOf('mbly')),
      b: box(asm, asmText.indexOf('bly')),
      y: box(asm, asmText.indexOf('y▪')),
      sq: box(asm, asmText.indexOf('▪')),
      A: box(an, 0)[0],
      N: box(an, 2)[1],
      circles: glyphs.filter((g) => g.dataset.glyph === 'circle').map(size),
      square: size(glyphs.find((g) => g.dataset.glyph === 'small-square')!),
      xHeight: ink(asm, 'x').top,
      em: parseFloat(getComputedStyle(items[4]!).fontSize),
      overflow: Math.max(
        ol.scrollWidth - ol.clientWidth,
        ...items.map((li) => li.getBoundingClientRect().right - ol.getBoundingClientRect().right),
      ),
    };
  }, selector);
}

function expectGeometry(g: Geometry) {
  expect(g.text).toEqual(LINES);
  // Founder review: the G of Ghost starts one space (0.281em) left of the W of Wolf.
  expect(g.W - g.G).toBeCloseTo(0.281 * g.em, 0);
  // A•N: the A begins in the m|b region, the N ends at the y|▪ transition.
  expect(g.A).toBeGreaterThanOrEqual(g.m[0]);
  expect(g.A).toBeLessThanOrEqual(g.b[1]);
  expect(g.N).toBeGreaterThanOrEqual(g.y[0]);
  expect(g.N).toBeLessThanOrEqual(g.sq[1]);
  // ○ and ● share one visible diameter; the square is small.
  expect(g.circles).toHaveLength(2);
  expect(Math.abs(g.circles[0]! - g.circles[1]!)).toBeLessThanOrEqual(0.25);
  expect(g.square).toBeLessThan(0.6 * g.xHeight);
  expect(g.overflow).toBeLessThanOrEqual(0);
}

for (const width of [1440, 1000]) {
  test(`sidebar branding geometry at ${width}px`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await openPaused(page, '/');
    await page.evaluate(() => document.fonts.ready);
    expectGeometry(await measure(page, '.sidenav__footer .hierarchy'));
    expect(errors).toEqual([]);
  });
}

for (const width of [1440, 390]) {
  test(`settings branding geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openPaused(page, '/settings');
    await page.evaluate(() => document.fonts.ready);
    expectGeometry(await measure(page, '.hierarchy--large'));
  });
}

test('the sidebar branding is hidden on phones (Settings carries it there)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openPaused(page, '/');
  await expect(page.locator('.sidenav__footer .hierarchy')).toBeHidden();
});
