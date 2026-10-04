import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnnSnapshotHost } from '../scripts/ann-snapshot-host.ts';
import { annMockFeed } from '../src/adapters/ann/mockFeed.ts';
import { openPaused } from './helpers';

/**
 * ann-local in a real browser: the dashboard build `--mode e2e-ann-local`
 * (port 4178, origin http://localhost:4178) reads the PRESERVED read-only
 * snapshot host, which THIS harness starts explicitly on 127.0.0.1:4391 with
 * a temporary fixture (atomic temp + rename writes, harness only).
 *
 * Serial: one host port, one fixture file.
 */
test.describe.configure({ mode: 'serial' });

const DASH = 'http://localhost:4178';
const HOST_PORT = 4391;
const ENDPOINT = `http://127.0.0.1:${HOST_PORT}/ann/snapshot`;
const AUTH = 'Founder #0007';

type R = Record<string, unknown>;
type Feed = R & { missions: R[]; health?: R };
let dir: string;
let snapshot: string;
let host: ReturnType<typeof createAnnSnapshotHost> | null = null;

async function startHost() {
  host = createAnnSnapshotHost({
    snapshotPath: snapshot,
    port: HOST_PORT,
    allowedOrigins: [DASH],
  });
  await host.listen();
}
async function stopHost() {
  await host?.close();
  host = null;
}
/** Atomic producer write (temp file in the same directory, then rename). */
function writeFeed(feed: unknown) {
  const tmp = join(dir, 'snapshot.tmp');
  writeFileSync(tmp, JSON.stringify(feed));
  renameSync(tmp, snapshot);
}
const simFeed = (variant: 'normal' | 'stale' = 'normal'): Feed =>
  structuredClone(annMockFeed(variant, Date.now(), AUTH)) as unknown as Feed;
/** The fixture declared LIVE by a claimed ANN runtime: a claim, never proof. */
const liveFeed = (variant: 'normal' | 'stale' = 'normal'): Feed => {
  const f = simFeed(variant);
  f.sourceMode = 'LIVE';
  f.source = { id: 'ann-runtime-01', name: 'ANN runtime', kind: 'ann-runtime' };
  // One mission with no stated priority.
  delete f.missions.find((m) => m.id === 'ann-msn-e410')!.priority;
  return f;
};

async function openLocal(page: Page, route: string) {
  await page.goto(`${DASH}/#${route}`);
  await page.getByRole('navigation', { name: 'Primary' }).waitFor();
  await page.locator('[data-surface="ready"]').waitFor();
}
/** Every non-asset request the page makes (to prove the one GET, and nothing else). */
function recordRequests(page: Page): { method: string; url: string }[] {
  const seen: { method: string; url: string }[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(DASH)) seen.push({ method: r.method(), url: r.url() });
  });
  return seen;
}

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ann-local-e2e-'));
  snapshot = join(dir, 'ann-snapshot.json');
  writeFeed(liveFeed());
  await startHost();
});
test.afterAll(async () => {
  await stopHost();
  rmSync(dir, { recursive: true, force: true });
});
test.beforeEach(() => writeFeed(liveFeed()));

test('1. ann-local is never active unless the build selects it: default and ann-mock builds never contact the host', async ({
  page,
}) => {
  const seen = recordRequests(page);
  await openPaused(page, '/');
  await page.goto('http://localhost:4177/#/');
  await page.locator('[data-surface="ready"]').waitFor();
  expect(seen.filter((r) => r.url.includes('127.0.0.1'))).toEqual([]);
});

test('2–3. the dashboard reaches the host with ONE GET and renders the normalized snapshot', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const seen = recordRequests(page);
  await openLocal(page, '/?field=off');
  await expect(page.locator('main')).toContainText('Forge Floor telemetry ingest');
  await expect(page.locator('main')).toContainText('ANN feed v1 · ANN runtime');
  expect(seen).toEqual([{ method: 'GET', url: ENDPOINT }]);
  expect(await page.locator('main').innerText()).not.toMatch(/NaN|undefined|Invalid Date/);
  expect(errors).toEqual([]);
});

test('4–5. Missions show the source ordinals and never fabricate a missing one', async ({
  page,
}) => {
  await openLocal(page, '/missions');
  const ids = await page.locator('.mission-card__id').allInnerTexts();
  expect(ids).toEqual(expect.arrayContaining(['AN-0142', 'AN-0144', 'AN-0139', 'AN-0140']));
  expect(ids).toContain('ann-msn-e410');
  expect(ids.filter((t) => /^AN-\d+$/.test(t))).toHaveLength(4);
});

test('6. a source-declared LIVE feed is visibly NOT authenticated live', async ({ page }) => {
  await openLocal(page, '/?field=off');
  const prov = page.locator('.provenance');
  await expect(prov).toHaveAttribute('data-mode', 'disconnected');
  await expect(prov).not.toHaveAttribute('data-mode', 'live');
  await expect(prov.locator('.provenance__mode')).not.toHaveText('LIVE');
  await openLocal(page, '/settings');
  await expect(page.locator('main')).toContainText(/Source-declared LIVE; not verified/);
});

test('6b. a SIMULATED feed over the real local transport stays visibly SIMULATED', async ({
  page,
}) => {
  writeFeed(simFeed());
  await openLocal(page, '/?field=off');
  const prov = page.locator('.provenance');
  await expect(prov).toHaveAttribute('data-mode', 'demo');
  await expect(prov).toContainText('SIMULATED');
  await openLocal(page, '/approvals');
  await expect(page.locator('[data-focus-id="ann-apr-030"]')).toContainText(
    'Simulated — no backend received this decision',
  );
});

test('7, 13. the Founder decision is labelled source-asserted; approvals are read-only', async ({
  page,
}) => {
  await openLocal(page, '/approvals');
  const decided = page.locator('[data-focus-id="ann-apr-030"]');
  await expect(decided.locator('[data-assurance="source-asserted"]')).toHaveText(
    'Reported by the data source — not independently verified',
  );
  await expect(page.locator('.gate-btn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /approve|deny|hold/i })).toHaveCount(0);
});

test('11. unknown risk and reversibility stay neutral', async ({ page }) => {
  await openLocal(page, '/approvals');
  const gate = page.locator('[data-focus-id="ann-apr-032"]');
  await expect(gate).toHaveAttribute('data-risk', 'unknown');
  await expect(gate.locator('.gate__facts .badge').first()).toHaveAttribute('data-tone', 'neutral');
  await expect(gate.locator('[data-reversible]')).toHaveAttribute('data-reversible', 'unknown');
});

test('8. missing health is UNKNOWN, never healthy (HTTP 200 is not health)', async ({ page }) => {
  const f = liveFeed();
  delete f.health;
  writeFeed(f);
  await openLocal(page, '/?field=off');
  const health = page.locator('.topbar__health .badge');
  await expect(health).toContainText('Unknown');
  await expect(health).not.toHaveAttribute('data-tone', 'success');
});

test('9. a stale feed is visibly stale and its health UNKNOWN', async ({ page }) => {
  writeFeed(liveFeed('stale'));
  await openLocal(page, '/?field=off');
  await expect(page.locator('.data-banners')).toContainText(/stale|last complete sync/i);
  const health = page.locator('.topbar__health .badge');
  await expect(health).toContainText('Unknown');
  await expect(health).not.toHaveAttribute('data-tone', 'success');
});

test('10. completed but not certified stays visibly not certified', async ({ page }) => {
  await openLocal(page, '/missions/ann-msn-2b88');
  const text = await page.locator('main').innerText();
  expect(text).toMatch(/Mission Complete/i);
  expect(text).toMatch(/CERTIFICATION\s+PENDING/i);
  expect(text).not.toMatch(/\bCERTIFIED\b/);
});

test('12. a missing priority reads as not stated', async ({ page }) => {
  await openLocal(page, '/missions/ann-msn-e410');
  await expect(page.locator('main')).toContainText(/Priority\s*not stated/i);
});

test('14. alerts: no acknowledgement control', async ({ page }) => {
  await openLocal(page, '/alerts');
  await expect(page.locator('main')).toContainText('Build runner latency elevated');
  await expect(page.getByRole('button', { name: /acknowledge/i })).toHaveCount(0);
});

test('15. host unavailable: a bounded source error, never an empty healthy dashboard', async ({
  page,
}) => {
  await stopHost();
  try {
    await page.goto(`${DASH}/#/`);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('SOURCE_UNAVAILABLE');
    await expect(alert).toContainText('LOCAL_SOURCE_UNAVAILABLE');
    await expect(alert).not.toContainText(/127\.0\.0\.1|stack|Error:|at /);
    await expect(page.locator('.situation')).toHaveCount(0);
    await expect(page.locator('.topbar__health')).toHaveCount(0);
  } finally {
    await startHost();
  }
});

test('15b. malformed snapshot bytes: a parse error, never data', async ({ page }) => {
  writeFileSync(join(dir, 'snapshot.tmp'), '{"contract":');
  renameSync(join(dir, 'snapshot.tmp'), snapshot);
  await page.goto(`${DASH}/#/`);
  await expect(page.getByRole('alert')).toContainText('LOCAL_SOURCE_PARSE_FAILED');
  await expect(page.locator('.situation')).toHaveCount(0);
});

test('15c. a dashboard origin the host does not allow cannot read it (CORS), and errors closed', async ({
  page,
}) => {
  await page.goto(`http://127.0.0.1:4178/#/`);
  await expect(page.getByRole('alert')).toContainText('SOURCE_UNAVAILABLE');
  await expect(page.locator('.situation')).toHaveCount(0);
});

test.describe('redirect escape', () => {
  for (const status of [301, 302, 303, 307, 308]) {
    test(`15d. a ${status} from the endpoint is refused, never followed into data`, async ({
      page,
    }) => {
      const seen = recordRequests(page);
      await page.route(ENDPOINT, (route) =>
        route.fulfill({
          status,
          headers: {
            location: 'http://127.0.0.1:4176/__mock/state',
            'access-control-allow-origin': DASH,
          },
        }),
      );
      await page.goto(`${DASH}/#/`);
      await expect(page.getByRole('alert')).toContainText('SOURCE_UNAVAILABLE');
      await expect(page.locator('.situation')).toHaveCount(0);
      expect(seen.filter((r) => !r.url.startsWith(ENDPOINT))).toEqual([]);
    });
  }
});

test('16. the Local Demo Simulation still works separately (default build)', async ({ page }) => {
  await openPaused(page, '/approvals');
  await expect(page.locator('.provenance')).toHaveAttribute('data-mode', 'demo');
  await expect(page.locator('.gate-btn--approve').first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText('ann-apr');
});

test('17. Nexus Signature intact under ann-local: families, amber Founder gate, axe clean', async ({
  page,
}) => {
  await openLocal(page, '/?field=off');
  await expect(page.locator('section.panel[data-family="founder"]').first()).toBeVisible();
  const r = await new AxeBuilder({
    page,
  } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
