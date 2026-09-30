import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './helpers';
import { installMockBackend, REST_APP } from './mockBackend';

/**
 * Phase 4 browser checks: Spanish UI, URL state, transport diagnostics,
 * mobile/ultrawide layout with long strings and large counts, accessibility
 * (incl. <html lang>), and stability of locale switching.
 */

const VIEWPORTS = {
  w320: { width: 320, height: 700 },
  w390: { width: 390, height: 844 },
  w768: { width: 768, height: 1024 },
  hd1080: { width: 1920, height: 1080 },
  w1440: { width: 1440, height: 900 },
  w2560: { width: 2560, height: 1440 },
} as const;

const ROUTES = [
  '/',
  '/floor',
  '/floor?room=founder-gate',
  '/missions',
  '/missions/AN-0144',
  '/workers',
  '/approvals',
  '/alerts',
  '/activity',
  '/settings?focus=transport',
];

async function spanish(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
  });
}

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

const LONG_NAME = 'Maximiliana Wolfeschlegelsteinhausenbergerdorff-Vandersloot';
const LONG_TITLE =
  'Reconciliación exhaustiva de la infraestructura de despliegue multirregión con verificación criptográfica de artefactos';

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`Spanish + stress dataset: no horizontal overflow at ${name}`, async ({ page }) => {
    const errors = collectErrors(page);
    await spanish(page);
    await page.setViewportSize(vp);
    for (const route of ROUTES) {
      await page.goto(`/?demo=stress,paused#${route}`);
      await page.locator('[data-surface="ready"]').waitFor();
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      const o = await overflow(page);
      expect(o, `${route} overflows by ${o}px at ${name}`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });

  test(`long worker names and mission titles (REST): no overflow at ${name}`, async ({ page }) => {
    const errors = collectErrors(page);
    await spanish(page);
    await page.setViewportSize(vp);
    const now = Date.parse('2026-09-30T12:00:00Z');
    await installMockBackend(page, 'healthy', now, (s) => {
      for (const w of s.workers) w.name = `${LONG_NAME} ${w.id}`;
      for (const m of s.missions) m.title = `${LONG_TITLE} ${m.id}`;
      for (const a of s.approvals) a.title = `${LONG_TITLE} ${a.id}`;
    });
    for (const route of ['/', '/floor', '/missions', '/workers', '/approvals', '/settings']) {
      await page.goto(`${REST_APP}/#${route}`);
      await page.locator('[data-surface="ready"]').waitFor();
      const o = await overflow(page);
      expect(o, `${route} overflows by ${o}px at ${name}`).toBeLessThanOrEqual(0);
    }
    // Open the palette and the room panel with long names too.
    await page.goto(`${REST_APP}/#/floor?room=founder-gate`);
    await page.locator('[data-surface="ready"]').waitFor();
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: /Buscar comandos/ }).fill('Maximiliana');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test('axe (WCAG 2.2 AA incl. contrast and lang) on every surface in Spanish', async ({ page }) => {
  await spanish(page);
  for (const route of ROUTES) {
    await page.goto(`/?demo=paused#${route}`);
    await page.locator('[data-surface="ready"]').waitFor();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<
      typeof AxeBuilder
    >[0])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      route,
    ).toEqual([]);
  }
});

test('switching language updates <html lang> without a page reload or reconnect', async ({
  page,
}) => {
  const errors = collectErrors(page);
  let navigations = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++;
  });
  await page.goto('/?demo=paused#/settings');
  await page.locator('[data-surface="ready"]').waitFor();
  const start = navigations;
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Language').selectOption('es');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // Hash-only URL changes count as same-document navigations; none happened here.
  expect(navigations - start).toBe(0);
  // Persisted for the next visit.
  await page.getByLabel('Language').selectOption('es');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(errors).toEqual([]);
});

test('repeated language switching leaves no timer or listener growth', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __iv: number };
    w.__iv = 0;
    const si = window.setInterval.bind(window);
    const ci = window.clearInterval.bind(window);
    const live = new Set<number>();
    window.setInterval = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
      const id = si(fn, ms, ...a);
      live.add(id);
      w.__iv = live.size;
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) live.delete(id);
      w.__iv = live.size;
      ci(id);
    }) as typeof window.clearInterval;
  });
  await page.goto('/?demo=stress,paused#/settings');
  await page.locator('[data-surface="ready"]').waitFor();
  const before = await page.evaluate(() => (window as unknown as { __iv: number }).__iv);
  for (let i = 0; i < 10; i++) {
    await page.getByLabel(/^(Language|Idioma)/).selectOption(i % 2 ? 'en' : 'es');
    await expect(page.locator('html')).toHaveAttribute('lang', i % 2 ? 'en' : 'es');
  }
  const after = await page.evaluate(() => (window as unknown as { __iv: number }).__iv);
  expect(after).toBeLessThanOrEqual(before);
});

test('URL filters survive reload and Back/Forward in a real browser', async ({ page }) => {
  await page.goto('/?demo=paused#/missions');
  await page.locator('[data-surface="ready"]').waitFor();
  const quick = page.getByRole('radiogroup', { name: /quick filter/ });
  await quick.getByRole('radio', { name: /^Blocked/ }).click();
  await quick.getByRole('radio', { name: /^Queued/ }).click();
  await expect(page).toHaveURL(/#\/missions\?group=queued$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/missions\?group=blocked$/);
  await expect(quick.getByRole('radio', { name: /^Blocked/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.goForward();
  await expect(quick.getByRole('radio', { name: /^Queued/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.reload();
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(
    page.getByRole('radiogroup', { name: /quick filter/ }).getByRole('radio', { name: /^Queued/ }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('transport diagnostics on a live REST mock: no addresses shown, freshness shown', async ({
  page,
}) => {
  await installMockBackend(page, 'healthy', Date.parse('2026-09-30T12:00:00Z'));
  await page.goto(`${REST_APP}/#/settings?focus=transport`);
  const panel = page.getByRole('region', { name: 'Transport and freshness' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('REST polling')).toBeVisible();
  await expect(panel.locator('[data-freshness-source="LIVE"]')).toBeVisible();
  await expect(panel).not.toContainText('mock-backend.test');
  await expect(panel).not.toContainText('http');
});

test('palette in Spanish: search, keyboard selection and focus restore', async ({ page }) => {
  await spanish(page);
  await page.goto('/?demo=paused#/');
  await page.locator('[data-surface="ready"]').waitFor();
  const trigger = page.getByRole('button', { name: /Comandos/ });
  await trigger.focus();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: /Buscar comandos/ });
  await expect(input).toBeFocused();
  await input.fill('AN-0142');
  const first = page.getByRole('listbox').getByRole('option').first();
  await expect(first).toContainText('Forge Floor telemetry ingest');
  await expect(first).toContainText('Misión'); // type label localized; the title (backend text) is not
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
