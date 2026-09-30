import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

/**
 * Pseudo-locale detector shared by the Phase 5 and Phase 6 browser suites.
 * It is not weakened per suite: the allowlist is data only (demo adapter and
 * config literals), language names, key names and Intl month names.
 */
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

export interface PseudoReport {
  untranslated: string[];
  clipped: string[];
  overflow: number;
}

/** Scan visible text and labelling attributes for untranslated or cut-off text. */
export async function scan(page: Page): Promise<PseudoReport> {
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

export async function openPseudo(page: Page, route: string) {
  await page.goto(`/?pseudo=1&demo=paused#${route}`);
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
}
