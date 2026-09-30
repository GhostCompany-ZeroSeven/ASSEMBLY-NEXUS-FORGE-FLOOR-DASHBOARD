import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './helpers';
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

/**
 * Words that may legitimately appear untransformed: DATA from the demo
 * adapter and the config (names, titles, ids, the authority value), the
 * languages' own names, and key names. Everything else visible in the
 * pseudo-locale must come from the catalog; a plain-ASCII word is hard-coded.
 */
function dataWords(): string[] {
  const files = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const words = new Set(['Ctrl', 'Cmd', 'Esc', 'Tab', 'Enter', 'Shift', 'English', 'Español']);
  // Month names come from Intl locale data (pseudo text formats dates as English).
  for (let i = 0; i < 12; i++)
    for (const month of ['short', 'long'] as const)
      words.add(new Date(Date.UTC(2026, i, 15)).toLocaleString('en', { month }).replace('.', ''));
  for (const f of [...files('src/adapters/demo'), ...files('src/config')])
    if (f.endsWith('.ts') && !f.includes('.test.'))
      for (const m of readFileSync(f, 'utf8').matchAll(/(['"`])((?:(?!\1).)*)\1/g))
        for (const w of m[2]!.match(/[A-Za-z]{2,}/g) ?? []) words.add(w);
  return [...words];
}
const ALLOWED = dataWords();

interface PseudoReport {
  untranslated: string[];
  clipped: string[];
  overflow: number;
}

/** Scan visible text and labelling attributes for untranslated or cut-off text. */
async function scan(page: Page): Promise<PseudoReport> {
  return page.evaluate((allowedList) => {
    const allowed = new Set(allowedList);
    const untranslated = new Set<string>();
    const skip = (el: Element) =>
      !!el.closest('[translate="no"], time, script, style, .visually-hidden') ||
      // Content of a closed <details> is not rendered (Chrome still reports boxes).
      !!el.closest('details:not([open]) > :not(summary)');
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && el.getClientRects().length > 0;
    };
    // Letters only (accented pseudo letters are not ASCII, so they never match).
    const words = (t: string) => t.match(/(?<![\p{L}])[A-Za-z]{2,}(?![\p{L}])/gu) ?? [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || skip(el) || !visible(el)) continue;
      for (const w of words(n.textContent ?? ''))
        if (!allowed.has(w))
          untranslated.add(`${w} :: ${(n.textContent ?? '').trim().slice(0, 60)}`);
    }
    for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
      if (skip(el)) continue;
      for (const a of ['aria-label', 'title', 'placeholder']) {
        const v = el.getAttribute(a);
        for (const w of words(v ?? ''))
          if (!allowed.has(w)) untranslated.add(`${w} :: @${a}="${v!.slice(0, 60)}"`);
      }
    }
    // Pseudo text that does not fit its box: clipped, or spilling over neighbours.
    // Scrollable boxes are fine (the text is reachable); a `title` carrying the
    // full text is accepted for deliberate ellipsis. Only the deepest offending
    // box is reported (its ancestors' scroll widths include the same overflow).
    const offenders: Element[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!(el.textContent ?? '').includes('[!!')) continue;
      if (skip(el) || !visible(el)) continue;
      const s = getComputedStyle(el);
      if (s.display === 'inline' || s.display === 'contents') continue;
      if (s.overflowX === 'auto' || s.overflowX === 'scroll') continue;
      if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) continue;
      // Overflow caused only by absolutely positioned decorations (e.g. a
      // floor token's speech bubble) is layout by design, not cut-off text.
      const right = el.getBoundingClientRect().right + 1;
      const over = [...el.querySelectorAll('*')].filter(
        (k) => k.getBoundingClientRect().width > 0 && k.getBoundingClientRect().right > right,
      );
      if (over.length && over.every((k) => /absolute|fixed/.test(getComputedStyle(k).position)))
        continue;
      // A deliberate ellipsis is fine when the title repeats the full text.
      const title = el.getAttribute('title')?.trim();
      if (title && title === (el.textContent ?? '').trim()) continue;
      offenders.push(el);
    }
    const clipped = offenders
      .filter((el) => !offenders.some((o) => o !== el && el.contains(o)))
      .map((el) => `${el.className} :: ${(el.textContent ?? '').slice(0, 60)}`);
    return {
      untranslated: [...untranslated],
      clipped,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, ALLOWED);
}

async function openPseudo(page: Page, route: string) {
  await page.goto(`/?pseudo=1&demo=paused#${route}`);
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
}

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
