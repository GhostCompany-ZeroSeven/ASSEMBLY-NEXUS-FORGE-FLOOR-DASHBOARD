import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openPaused } from './helpers';

/**
 * ANN v1 adapter in a real browser (build `--mode e2e-ann`, port 4177): the
 * read-only adapter over the deterministic SIMULATED in-memory mock feed.
 * No network, no Assembly Nexus system. Review variants via `?ann=`.
 */

const ANN = 'http://localhost:4177';
async function openAnn(page: Page, route: string, variant?: string) {
  await page.goto(`${ANN}/${variant ? `?ann=${variant}` : ''}#${route}`);
  await page.getByRole('navigation', { name: 'Primary' }).waitFor();
  await page.locator('[data-surface="ready"]').waitFor();
}
const mainText = (page: Page) => page.locator('main').innerText();

test('1–3 the ANN mock loads, is visibly SIMULATED, and the Command Center renders its truth', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openAnn(page, '/?field=off');
  const prov = page.locator('.provenance');
  await expect(prov).toHaveAttribute('data-mode', 'demo');
  await expect(prov).toContainText('SIMULATED');
  // The simulation is attributed to the ANN mock feed, not to a backend.
  await expect(page.locator('main')).toContainText('ANN feed v1 · ANN mock feed');
  await expect(page.locator('main')).toContainText('No Assembly Nexus backend is connected');
  // Simulated health is never lime.
  await expect(page.locator('.topbar__health .badge')).not.toHaveAttribute('data-tone', 'success');
  await expect(page.locator('main')).toContainText('Forge Floor telemetry ingest');
  expect(await mainText(page)).not.toMatch(/NaN|undefined|Invalid Date/);
  expect(errors).toEqual([]);
});

test('4–5 Missions shows the source ordinals and never fabricates a missing one', async ({
  page,
}) => {
  await openAnn(page, '/missions');
  const ids = await page.locator('.mission-card__id').allInnerTexts();
  expect(ids).toEqual(expect.arrayContaining(['AN-0142', 'AN-0144', 'AN-0139', 'AN-0140']));
  // The mission the source did not number keeps its own id.
  expect(ids).toContain('ann-msn-e410');
  expect(ids.filter((t) => /^AN-\d+$/.test(t))).toHaveLength(4);
});

test('6 completed but not certified stays visibly not certified', async ({ page }) => {
  await openAnn(page, '/missions/ann-msn-2b88');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mission timer instrumentation');
  const text = await mainText(page);
  expect(text).toMatch(/Mission Complete/i);
  expect(text).toMatch(/CERTIFICATION\s+PENDING/i);
  expect(text).not.toMatch(/\bCERTIFIED\b/);
});

test('7–8, 12 approvals: unknown risk and reversibility are neutral; no decision controls exist', async ({
  page,
}) => {
  await openAnn(page, '/approvals');
  const gate = page.locator('[data-focus-id="ann-apr-032"]');
  await expect(gate).toHaveAttribute('data-risk', 'unknown');
  await expect(gate.locator('.gate__facts .badge').first()).toHaveAttribute('data-tone', 'neutral');
  await expect(gate.locator('[data-reversible]')).toHaveAttribute('data-reversible', 'unknown');
  await expect(gate).toContainText(/not stated/i);
  await expect(page.locator('.gate-btn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /approve|deny|hold/i })).toHaveCount(0);
  // The fixture decision is visibly simulated and source-asserted, never authenticated.
  const decided = page.locator('[data-focus-id="ann-apr-030"]');
  await expect(decided).toContainText('Simulated — no backend received this decision');
});

test('13 alerts: no acknowledgement control under the read-only adapter', async ({ page }) => {
  await openAnn(page, '/alerts');
  await expect(page.locator('main')).toContainText('Build runner latency elevated');
  await expect(page.getByRole('button', { name: /acknowledge/i })).toHaveCount(0);
});

test('9 an unreported worker role reads as not reported', async ({ page }) => {
  await openAnn(page, '/workers');
  await expect(page.locator('main')).toContainText('Unregistered worker 7c2');
  await expect(page.locator('main')).toContainText('Role not reported');
});

test('10 a stale feed is visibly stale and its health is unknown, never healthy', async ({
  page,
}) => {
  await openAnn(page, '/?field=off', 'stale');
  await expect(page.locator('.data-banners')).toContainText(/stale|last complete sync/i);
  const health = page.locator('.topbar__health .badge');
  await expect(health).toContainText('Unknown');
  await expect(health).not.toHaveAttribute('data-tone', 'success');
});

test('unknown feed: unavailable approvals are UNKNOWN on the Command Center, never "nothing"', async ({
  page,
}) => {
  await openAnn(page, '/?field=off', 'unknown');
  const founder = page.locator('.situation__cell').first();
  await expect(founder).not.toContainText('Nothing');
  await expect(founder).toHaveAttribute('data-tone', 'warning');
});

test('11 a failed source is an error state, never an empty healthy dashboard', async ({ page }) => {
  await page.goto(`${ANN}/?ann=unavailable#/`);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('SOURCE_UNAVAILABLE');
  await expect(alert).not.toContainText(/stack|Error:|at /);
  await expect(page.locator('.situation')).toHaveCount(0);
  await expect(page.locator('.topbar__health')).toHaveCount(0);
});

test('15 Nexus Signature intact under ANN: families, amber Founder gate, axe clean', async ({
  page,
}) => {
  await openAnn(page, '/?field=off');
  await expect(page.locator('section.panel[data-family="founder"]').first()).toBeVisible();
  const r = await new AxeBuilder({
    page,
  } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test('14 the Local Demo Simulation still works separately (default build)', async ({ page }) => {
  await openPaused(page, '/approvals');
  await expect(page.locator('.provenance')).toHaveAttribute('data-mode', 'demo');
  // The demo keeps its simulated decision controls.
  await expect(page.locator('.gate-btn--approve').first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText('ann-apr');
});
