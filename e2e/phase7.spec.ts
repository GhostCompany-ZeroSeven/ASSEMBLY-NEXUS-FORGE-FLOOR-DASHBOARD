import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { collectErrors } from './helpers';
import { scan } from './pseudo';
import { go, openRuntime, row, wireEvent, type RuntimeMock } from './runtimeMock';

/**
 * Phase 7: adversarial MOCK runtime. The dashboard's REST + SSE adapter runs
 * against a real local HTTP + Server-Sent Events mock server
 * (scripts/mock-runtime-server.ts), and each test injects controlled
 * conditions through its bounded test-data controls: late, out-of-order,
 * duplicate and conflicting events, history truncation, resource and
 * transport failures, malformed records and unsafe links.
 *
 * Nothing here is the Assembly Nexus contract, and no injected event is
 * authority: the suite also checks that no decision control appears.
 */

test.describe.configure({ timeout: 90_000 });

const MIN = 60_000;
const HOUR = 60 * MIN;
const changes = (page: Page) =>
  page.getByRole('region', { name: 'Since you last viewed this mission' });
const coverage = (page: Page) => changes(page).locator('[data-coverage]');
const card = (page: Page, id: string) => page.locator(`a.mission-card[href$="/missions/${id}"]`);
/**
 * Controls that would decide, grant or publish anything. None may appear on
 * these surfaces. (The pre-existing alert "Acknowledge" control, governed since
 * Phase 2, is an operational acknowledgement, not a decision, and is checked
 * separately: the Phase 7 surfaces contain no control but the local view ones.)
 */
const AUTHORITY_CONTROL = /^(approve|deny|hold|certify|dispatch|grant|revoke|deploy|publish)\b/i;

async function onlyLocalViewControls(page: Page) {
  const names = await page
    .locator('.mission-changes button, .mission-evidence button, .stream button')
    .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
  expect(names.sort()).toEqual(['Forget this mission view', 'Mark mission as seen']);
}

async function markSeenAndLeave(page: Page) {
  await changes(page).getByRole('button', { name: 'Mark mission as seen' }).click();
  await expect(changes(page).getByText(/Your last view of this mission/)).toBeVisible();
  await go(page, '/missions');
}

async function timelineIds(page: Page): Promise<string[]> {
  return page
    .locator('.stream__item')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-focus-id') ?? ''));
}

async function waitForRow(page: Page, mock: RuntimeMock, id: string) {
  void mock;
  await expect(row(page, id)).toHaveCount(1, { timeout: 15_000 });
}

test('LATE_EVENT + FOUNDER_RETURN: late event kept, EXACT coverage, arrival shown, unknowns named, baseline persists', async ({
  page,
}, info) => {
  const errors = collectErrors(page);
  const mock = await openRuntime(page, info, '/missions/AN-0142');
  await markSeenAndLeave(page);

  // While away: a normal event, a LATE event (source time 2h ago, arriving now),
  // a duplicate delivery of the first (stream again + listing), and alerts failing.
  await mock.events('stream', [wireEvent('p7-new', -1000)]);
  await mock.events('stream', [wireEvent('p7-late', -2 * HOUR)]);
  await mock.events('both', [wireEvent('p7-new', -1000)]);
  await mock.fault('alerts', 'http500');
  await expect(card(page, 'AN-0142').getByText('CHANGED')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.provenance')).toHaveAttribute('data-qualifiers', /PARTIAL/, {
    timeout: 15_000,
  });

  // Return.
  await card(page, 'AN-0142').click();
  await page.locator('[data-surface="ready"]').waitFor();

  // HOW CERTAIN: the checkpoint's newest event is retained and no gap was seen,
  // so EXACT; the duplicate is counted once, the late one is counted.
  await expect(coverage(page)).toHaveAttribute('data-coverage', 'exact');
  await expect(coverage(page)).toContainText('2 new events observed');

  // WHAT CHANGED: both events are in the scoped timeline, tagged new; the late
  // one keeps its source time, is marked ARRIVED LATE and sorts by event time.
  const late = row(page, 'p7-late');
  await expect(late.locator('.stream__new')).toBeVisible();
  await expect(late.locator('.stream__late')).toBeVisible();
  await expect(row(page, 'p7-new')).toHaveCount(1);
  await expect(row(page, 'p7-new').locator('.stream__via')).toHaveAttribute('data-via', 'stream');
  await expect(row(page, 'p7-new').locator('.stream__late')).toHaveCount(0);
  const ids = await timelineIds(page);
  expect(ids.indexOf('p7-new')).toBeLessThan(ids.indexOf('p7-late'));
  const lateAt = await late.locator('time').getAttribute('datetime');
  expect(Date.now() - Date.parse(lateAt!)).toBeGreaterThan(HOUR);

  // WHAT IS UNKNOWN: alerts cannot be compared now.
  await expect(
    changes(page).locator('.mission-changes__unknown [data-area="alerts"]'),
  ).toBeVisible();
  // WHAT NEEDS ME: the mission's attention answer is incomplete, not "nothing".
  await expect(
    page
      .getByRole('region', { name: 'Founder attention for this mission' })
      .getByText(/Incomplete/),
  ).toBeVisible();
  // WHERE IS THE EVIDENCE.
  await expect(page.locator('.mission-evidence')).toBeVisible();

  // No surface here can decide anything.
  await expect(page.getByRole('button', { name: AUTHORITY_CONTROL })).toHaveCount(0);
  await onlyLocalViewControls(page);

  // Mark seen, reload: the new baseline persists (local view state only).
  await changes(page).getByRole('button', { name: 'Mark mission as seen' }).click();
  await expect(coverage(page)).toContainText('0 new events observed');
  await page.reload();
  await page.locator('[data-surface="ready"]').waitFor();
  await expect(changes(page).locator('[data-baseline]')).toHaveAttribute('data-baseline', 'ok');
  await expect(changes(page).getByText(/Your last view of this mission/)).toBeVisible();
  expect(errors.filter((e) => !/500|Failed to load resource/.test(e))).toEqual([]);
});

test('OUT_OF_ORDER_EVENTS: arrival E3, E1, E2 is shown in event-time order with arrival facts kept', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/activity?mission=AN-0142&details=1');
  const needsFounder = async () => {
    await go(page, '/brief');
    const t = await page.locator('[data-figure="needsFounder"]').innerText();
    await go(page, '/activity?mission=AN-0142&details=1');
    return t;
  };
  const before = await needsFounder();
  for (const [id, off] of [
    ['p7-e3', -10_000],
    ['p7-e1', -30_000],
    ['p7-e2', -20_000],
  ] as const) {
    await mock.events('stream', [wireEvent(id, off)]);
    await waitForRow(page, mock, id);
    await page.waitForTimeout(20); // distinct arrival instants
  }
  const ids = (await timelineIds(page)).filter((i) => i.startsWith('p7-'));
  expect(ids).toEqual(['p7-e3', 'p7-e2', 'p7-e1']); // event time, newest first
  // E1 and E2 arrived after E3, which is later in event time.
  await expect(row(page, 'p7-e3').locator('.stream__late')).toHaveCount(0);
  await expect(row(page, 'p7-e2').locator('.stream__late')).toBeVisible();
  await expect(row(page, 'p7-e1').locator('.stream__late')).toBeVisible();
  // Arrival facts are shown, separate from the event time.
  for (const id of ['p7-e1', 'p7-e2', 'p7-e3'])
    await expect(row(page, id).locator('.stream__received')).toBeVisible();
  // A REST re-sync does not rewrite the received history.
  await mock.events('list', [wireEvent('p7-e1', -30_000)]);
  await page.waitForTimeout(3000);
  await expect(row(page, 'p7-e1').locator('.stream__via')).toHaveAttribute('data-via', 'stream');
  await expect(row(page, 'p7-e1').locator('.stream__late')).toBeVisible();
  // Founder attention is not inferred from arrival order.
  expect(await needsFounder()).toBe(before);
});

test('DUPLICATES: SSE→SSE, REST→REST, SSE→REST and REST→SSE are each counted once, first ingest kept', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/missions/AN-0142');
  await markSeenAndLeave(page);
  await mock.events('stream', [wireEvent('d-sse', -4000)]);
  await mock.events('stream', [wireEvent('d-sse', -4000)]);
  await mock.events('list', [wireEvent('d-rest', -3000), wireEvent('d-rest', -3000)]);
  await mock.events('stream', [wireEvent('d-s2r', -2000)]);
  await mock.events('list', [wireEvent('d-s2r', -2000)]);
  await mock.events('list', [wireEvent('d-r2s', -1000)]);
  await go(page, '/activity?details=1');
  await waitForRow(page, mock, 'd-r2s');
  await mock.events('stream', [wireEvent('d-r2s', -1000)]);
  await page.waitForTimeout(3000); // at least one re-sync after every delivery
  const via = async (id: string) => {
    await expect(row(page, id)).toHaveCount(1);
    return row(page, id).locator('.stream__via').getAttribute('data-via');
  };
  expect(await via('d-sse')).toBe('stream');
  expect(await via('d-rest')).toBe('poll');
  expect(await via('d-s2r')).toBe('stream');
  expect(await via('d-r2s')).toBe('poll');

  await go(page, '/missions/AN-0142');
  await expect(coverage(page)).toHaveAttribute('data-coverage', 'exact');
  await expect(coverage(page)).toContainText('4 new events observed');
  // The events resource stays available: one duplicate is not an outage.
  await expect(changes(page).locator('.mission-changes__unknown [data-area="events"]')).toHaveCount(
    0,
  );

  await go(page, '/quality');
  await expect(page.locator('.quality__issues [data-class="duplicate-delivery"]')).toHaveCount(1);
  // Identical re-deliveries are transport duplicates, never conflicts (Phase 8, P8-D1).
  await expect(page.locator('.quality__issues [data-class="event-conflict"]')).toHaveCount(0);
  await expect(page.locator('[data-available="false"]')).toHaveCount(0);
});

test('STREAM_ONLY / REST_ONLY / SAME_ID_CONFLICT: observed events survive re-sync; conflicts are surfaced, never rewritten', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/activity?details=1');
  // A: stream only, never listed.
  await mock.events('stream', [wireEvent('only-stream', -5000)]);
  // B: listed only, never streamed.
  await mock.events('list', [wireEvent('only-list', -4000)]);
  // C: both, compatible.
  await mock.events('both', [wireEvent('both-ok', -3000)]);
  // D: same id, conflicting facts (other mission, other time) in the listing.
  await mock.events('stream', [wireEvent('clash', -2000)]);
  await waitForRow(page, mock, 'clash');
  await mock.events('list', [wireEvent('clash', -9 * HOUR, { missionId: 'AN-0141' })]);
  await page.waitForTimeout(3500); // several re-syncs
  await expect(row(page, 'only-stream')).toHaveCount(1);
  await expect(row(page, 'only-list').locator('.stream__via')).toHaveAttribute('data-via', 'poll');
  await expect(row(page, 'both-ok')).toHaveCount(1);
  const clash = row(page, 'clash');
  await expect(clash).toHaveCount(1);
  await expect(clash.locator('a[href$="/missions/AN-0142"]')).toHaveCount(1);
  await expect(clash.locator('a[href$="/missions/AN-0141"]')).toHaveCount(0);
  expect(
    Date.now() - Date.parse((await clash.locator('time').getAttribute('datetime'))!),
  ).toBeLessThan(HOUR);
  await go(page, '/quality');
  await expect(
    page.locator('.quality__issues [data-class="event-conflict"]').first(),
  ).toBeVisible();
});

test('HISTORY_TRUNCATION (in session): a source window that skips events gives LOWER_BOUND and a visible gap, never EXACT', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/missions/AN-0142');
  await markSeenAndLeave(page);
  // The source keeps only its newest 50 events, and 300 arrive at once: the
  // next listing shares nothing with the previous one.
  await mock.fixture({ op: 'events.window', size: 50 });
  await mock.bulk({ count: 300, deliver: 'list', missionId: 'AN-0142', prefix: 'win' });
  await expect(card(page, 'AN-0142').getByText('CHANGED')).toBeVisible({ timeout: 15_000 });
  await go(page, '/missions/AN-0142');
  await expect(coverage(page)).toHaveAttribute('data-coverage', 'lower-bound');
  await expect(coverage(page)).toContainText('At least 50 new events');
  await expect(
    changes(page).locator('.mission-changes__unknown [data-area="events"]'),
  ).toContainText('gap');
  await go(page, '/quality');
  await expect(page.locator('[data-history-gap="true"]')).toBeVisible();
  await expect(page.locator('.quality__issues [data-class="history-gap"]')).toHaveCount(1);
  // Local storage stays bounded.
  const size = await page.evaluate(
    () =>
      (localStorage.getItem('forge-floor:mission-views') ?? '').length +
      (localStorage.getItem('forge-floor:last-view') ?? '').length,
  );
  expect(size).toBeLessThan(100_000);
});

test('HISTORY_TRUNCATION (capacity): at 500 retained events a LATE event is kept; the earliest observed go first', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/missions/AN-0142');
  await markSeenAndLeave(page);
  await mock.bulk({
    count: 600,
    deliver: 'stream',
    missionId: 'AN-0141',
    prefix: 'cap',
    startOffsetMs: -600_000,
    stepMs: 900,
  });
  await mock.events('stream', [wireEvent('cap-late', -3 * HOUR)]);
  await go(page, '/quality');
  await expect(page.locator('.quality')).toContainText('500 of at most 500 events retained', {
    timeout: 15_000,
  });
  await page.waitForTimeout(3000); // re-syncs merge the listing into the full log
  await mock.bulk({ count: 10, deliver: 'stream', missionId: 'AN-0141', prefix: 'cap2' });
  await page.waitForTimeout(3000);
  // The earliest observed (seed history, first bulk events) were dropped and
  // stay dropped: re-syncs that still list them do not re-admit them.
  await go(page, '/activity?details=1&ticks=1');
  await expect(row(page, 'cap-600')).toHaveCount(1);
  for (const id of ['seed-1', 'seed-13', 'cap-1', 'cap-100'])
    await expect(row(page, id)).toHaveCount(0);
  await go(page, '/activity?mission=AN-0142&details=1');
  await expect(row(page, 'cap-late')).toHaveCount(1);
  await expect(row(page, 'cap-late').locator('.stream__late')).toBeVisible();
  // The mission's checkpoint event was observed first, so it has been dropped:
  // coverage cannot be proven. "At least 1", never an exact count.
  await go(page, '/missions/AN-0142');
  await expect(coverage(page)).toHaveAttribute('data-coverage', 'lower-bound');
  await expect(coverage(page)).toContainText('At least 1 new event');
  await expect(changes(page).getByText(/Nothing changed/)).toHaveCount(0);
});

const VIEWS_KEY = 'forge-floor:mission-views';

test('CHECKPOINT_OUTDATED / CORRUPT / OVERSIZED / MISSING: each is named for what it is, and none is read as "no change"', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/missions/AN-0142');
  void mock;
  const cases: [string, string, RegExp, string][] = [
    ['missing', '', /You have not viewed this mission/, 'none stored'],
    [
      'outdated',
      JSON.stringify({ v: 0, missions: {} }),
      /another version/,
      'discarded (other version)',
    ],
    ['corrupt', '{"v":1,"missions":', /You have not viewed this mission/, 'invalid, ignored'],
    [
      'corrupt entry',
      JSON.stringify({ v: 1, missions: { 'AN-0142': { at: 'yesterday', lies: true } } }),
      /unreadable or invalid and was ignored/,
      'stored',
    ],
    [
      'oversized',
      JSON.stringify({ v: 1, missions: {}, pad: 'x'.repeat(1_100_000) }),
      /You have not viewed this mission/,
      'invalid, ignored',
    ],
  ];
  for (const [name, stored, message, storageText] of cases) {
    await go(page, '/quality'); // leave the mission first (leaving records a view)
    await page.evaluate(
      ([k, v]) => (v ? localStorage.setItem(k!, v) : localStorage.removeItem(k!)),
      [VIEWS_KEY, stored],
    );
    await page.reload();
    await page.locator('[data-surface="ready"]').waitFor();
    await expect(
      page.locator('.quality').getByText(storageText, { exact: true }).last(),
      name,
    ).toBeVisible();
    await go(page, '/missions/AN-0142');
    await expect(changes(page).getByText(message), name).toBeVisible();
    // No comparable view: no event count at all (not zero), and no "nothing changed".
    await expect(changes(page).locator('[data-baseline]'), name).toHaveAttribute(
      'data-baseline',
      'none',
    );
    await expect(coverage(page), name).toHaveCount(0);
    await expect(changes(page).getByText(/Nothing changed/), name).toHaveCount(0);
  }
});

test('MISSION_DISAPPEARS / MISSION_REAPPEARS: "no longer reported" is not "deleted", and reappearing is not "resumed"', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/missions/AN-0142');
  await markSeenAndLeave(page);
  await mock.fixture({ op: 'mission.hide', id: 'AN-0142' });
  await expect(card(page, 'AN-0142')).toHaveCount(0, { timeout: 15_000 });
  await go(page, '/missions/AN-0142');
  const gone = changes(page).locator('[data-change="missionNoLongerReported"]');
  await expect(gone).toContainText('not deleted or completed');
  await go(page, '/missions');
  await mock.fixture({ op: 'mission.restore', id: 'AN-0142' });
  await expect(card(page, 'AN-0142')).toHaveCount(1, { timeout: 15_000 });
  await go(page, '/missions/AN-0142');
  await expect(changes(page).locator('[data-change="missionReappeared"]')).toContainText(
    'does not mean work resumed',
  );
  await expect(changes(page).getByText(/Nothing changed/)).toHaveCount(0);
});

test('CHECKPOINT complete→partial and connected→disconnected: comparisons become UNKNOWN, never "nothing changed"', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/missions/AN-0142');
  await markSeenAndLeave(page);
  await mock.fault('missions', 'http500');
  await expect(page.locator('.provenance')).toHaveAttribute('data-qualifiers', /PARTIAL/, {
    timeout: 15_000,
  });
  await go(page, '/missions/AN-0142');
  await expect(
    changes(page).locator('.mission-changes__unknown [data-area="status"]'),
  ).toBeVisible();
  await expect(changes(page).locator('[data-change="dataBecameUnavailable"]')).toContainText(
    'missions',
  );
  await expect(changes(page).getByText(/Nothing changed/)).toHaveCount(0);
  await go(page, '/missions');
  await mock.fault('missions', 'off');
  // Disconnected: every REST resource and the stream fail.
  for (const r of ['health', 'workers', 'missions', 'approvals', 'alerts', 'events'])
    await mock.fault(r, 'http500');
  await mock.fault('stream', 'down');
  await expect(page.locator('.provenance__mode')).toHaveText('DISCONNECTED', { timeout: 20_000 });
  await go(page, '/missions/AN-0142');
  await expect(coverage(page)).toHaveAttribute('data-coverage', 'unknown');
  await expect(changes(page).getByText(/Nothing changed/)).toHaveCount(0);
  await expect(
    changes(page).locator('.mission-changes__unknown [data-area="status"]'),
  ).toBeVisible();
  await expect(changes(page).locator('[data-change="freshnessChanged"]')).toContainText(
    'DISCONNECTED',
  );
});

test('MULTI_TAB: mark seen in A reaches B; forget in B; A leaving records again (last write wins, same browser only)', async ({
  context,
}, info) => {
  const a = await context.newPage();
  const mock = await openRuntime(a, info, '/missions/AN-0142');
  const b = await context.newPage();
  await openRuntime(b, info, '/missions');
  await changes(a).getByRole('button', { name: 'Mark mission as seen' }).click();
  // A new event for the mission: B marks the card CHANGED only if it picked up
  // A's view through the storage event.
  await mock.events('stream', [wireEvent('tab-ev', -1000)]);
  await expect(card(b, 'AN-0142').getByText('CHANGED')).toBeVisible({ timeout: 15_000 });
  // Race: B forgets while A still shows the mission.
  await card(b, 'AN-0142').click();
  await b.locator('[data-surface="ready"]').waitFor();
  await changes(b).getByRole('button', { name: 'Forget this mission view' }).click();
  await expect(changes(b).getByText(/You have not viewed this mission/)).toBeVisible();
  const stored = (p: Page) => p.evaluate((k) => localStorage.getItem(k) ?? '', VIEWS_KEY);
  expect(await stored(a)).not.toContain('AN-0142');
  // A keeps the baseline this visit opened with (documented)…
  await expect(changes(a).getByText(/Your last view of this mission/)).toBeVisible();
  // …and leaving records a fresh view: last write wins.
  await go(a, '/missions');
  expect(await stored(a)).toContain('AN-0142');
  await expect(card(a, 'AN-0142').getByText('CHANGED')).toHaveCount(0);
});

test('CONNECTION: stream down/REST up, REST down/stream up, both down, reconnect: labels stay truthful', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/');
  const mode = page.locator('.provenance__mode');
  const badge = page.locator('.provenance');
  // Connected mock: LIVE is always shown with the MOCK environment next to it.
  await expect(mode).toHaveText('LIVE');
  await expect(badge.locator('.provenance__env')).toHaveText('MOCK');

  // Stream down, REST up: still verified, but polling instead of streaming.
  await mock.fault('stream', 'down');
  await expect(badge).toHaveAttribute('data-transport-mode', 'polling-fallback', {
    timeout: 15_000,
  });
  await expect(mode).toHaveText('LIVE');
  await expect(badge.locator('.provenance__env')).toHaveText('MOCK');
  await mock.fault('stream', 'off');
  await expect(badge).toHaveAttribute('data-transport-mode', 'sse', { timeout: 20_000 });

  // REST down, stream up: not verified, so never LIVE; earlier data is LAST KNOWN.
  await mock.fault('health', 'http500');
  await expect(mode).toHaveText('DISCONNECTED', { timeout: 15_000 });
  await expect(badge).toHaveAttribute('data-qualifiers', /LAST_KNOWN/);
  // Both down.
  await mock.fault('stream', 'down');
  await expect(mode).toHaveText('DISCONNECTED');
  await expect(badge).toHaveAttribute('data-qualifiers', /LAST_KNOWN/);
  // Search results say where they come from and that they are not current.
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search commands/ }).fill('AN-0142');
  await expect(page.locator('.palette__prov').first()).toContainText(/DISCONNECTED|LAST KNOWN/i);
  await page.keyboard.press('Escape');

  // Reconnect: REST first, then the stream.
  await mock.fault('health', 'off');
  await mock.fault('stream', 'off');
  await expect(mode).toHaveText('LIVE', { timeout: 30_000 });
  await expect(badge.locator('.provenance__env')).toHaveText('MOCK');
  await expect(badge).not.toHaveAttribute('data-qualifiers', /LAST_KNOWN/);
});

test('UNSAFE_ARTIFACT_URI: only http(s) links are navigable; other schemes are shown as text', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/missions');
  const uris = [
    ['a-https', 'https://example.test/report'],
    ['a-http', 'http://example.test/log'],
    ['a-js', 'javascript:alert(1)'],
    ['a-js-case', ' JaVaScRiPt:alert(1)'],
    ['a-data', 'data:text/html,<b>x</b>'],
    ['a-file', 'file:///etc/passwd'],
    ['a-rel', '/relative/path'],
    ['a-bad', 'ht!tp://not a uri'],
  ];
  await mock.fixture({
    op: 'artifacts.set',
    id: 'AN-0142',
    artifacts: uris.map(([id, uri]) => ({ id, title: `Artifact ${id}`, uri })),
  });
  await page.waitForTimeout(2500);
  await go(page, '/missions/AN-0142');
  const ev = page.locator('.mission-evidence');
  await expect(ev.locator('[data-focus-id="a-bad"]')).toBeVisible();
  const hrefs = await ev
    .locator('.artifact__title a')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toEqual(['https://example.test/report', 'http://example.test/log']);
  for (const id of ['a-js', 'a-js-case', 'a-data', 'a-file', 'a-rel', 'a-bad'])
    await expect(ev.locator(`[data-focus-id="${id}"]`)).toContainText('no link reported');
  const unsafe = await page
    .locator('a[href]')
    .evaluateAll((els) =>
      els
        .map((e) => e.getAttribute('href') ?? '')
        .filter((h) => /^\s*(javascript|data|file):/i.test(h)),
    );
  expect(unsafe).toEqual([]);
  // Evidence is never presented as certification.
  await expect(ev).toContainText('an artifact is not certification');
});

test('MALFORMED_TIMESTAMP / UNKNOWN_ENUM / hostile text: no crash, no markup, no guesses; issues are visible', async ({
  page,
}, info) => {
  const errors = collectErrors(page);
  page.on('dialog', (d) => {
    errors.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  const mock = await openRuntime(page, info, '/missions');
  await mock.fixture({
    op: 'mission.patch',
    id: 'AN-0142',
    status: 'TOTALLY_DONE_TRUST_ME',
    title: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
    summary: 'long '.repeat(790),
  });
  await mock.events('list', [
    wireEvent('bad-time', 0, { at: 'the day before yesterday', atOffsetMs: undefined }),
    { kind: 'task.completed', at: new Date().toISOString(), payload: {} }, // no id
    wireEvent('bad-kind', -1000, { kind: 'mission.teleported' }),
  ]);
  await mock.raw('{"kind": "broken');
  await mock.events('stream', [wireEvent('skew-future', 24 * HOUR)]);
  await mock.events('stream', [wireEvent('skew-past', -30 * 24 * HOUR)]);
  await page.waitForTimeout(2500);
  await go(page, '/missions/AN-0142');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('<img src=x');
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.locator('main script').count()).toBe(0);
  await expect(page.locator('.mission-head__state')).toContainText(/unknown/i);
  // Skewed source times are kept as reported, beside their real arrival time.
  await go(page, '/activity?mission=AN-0142&details=1');
  await expect(row(page, 'skew-future')).toHaveCount(1);
  await expect(row(page, 'skew-past').locator('.stream__late')).toBeVisible();
  for (const id of ['bad-time', 'bad-kind']) await expect(row(page, id)).toHaveCount(0);
  await go(page, '/quality');
  await expect(page.locator('.quality__issues li').first()).toBeVisible();
  // The snapshot time is the dashboard's, never the future-skewed source time.
  const produced = await page.locator('.quality time').nth(1).getAttribute('datetime');
  expect(Date.parse(produced!)).toBeLessThan(Date.now() + 60_000);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('PARTIAL_RESOURCE_FAILURE: each resource failing alone is UNAVAILABLE, never EMPTY', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/quality');
  const label: Record<string, RegExp> = {
    missions: /missions/i,
    workers: /workers/i,
    approvals: /approval gates/i,
    alerts: /alerts/i,
    events: /events/i,
  };
  for (const r of Object.keys(label)) {
    await mock.fault(r, 'http500');
    await expect(page.locator('[data-available="false"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-available="false"]')).toContainText(label[r]!);
    if (r === 'events') {
      await go(page, '/activity');
      await expect(page.getByText('Events could not be loaded')).toBeVisible();
      await go(page, '/quality');
    }
    if (r === 'approvals') {
      await go(page, '/brief');
      await expect(page.locator('[data-figure="needsFounder"]')).toContainText('UNKNOWN');
      await go(page, '/quality');
    }
    await mock.fault(r, 'off');
    await expect(page.locator('[data-available="false"]')).toHaveCount(0, { timeout: 15_000 });
  }
  // An EMPTY resource is a real answer and is shown as loaded (not unknown).
  await mock.fault('alerts', 'empty');
  await page.waitForTimeout(2500);
  await expect(page.locator('[data-available="false"]')).toHaveCount(0);
});

test('ATTENTION: every reason code explains trigger, known and unknown facts, without inventing urgency or authority', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/brief');
  await mock.fixture({
    op: 'approval.add',
    id: 'APR-P7-OK',
    title: 'Mock gate for the Founder',
    missionId: 'AN-0142',
  });
  await mock.fixture({
    op: 'approval.add',
    id: 'APR-P7-WORKER',
    title: 'Gate naming a worker',
    requiredAuthority: 'w-ada',
  });
  await mock.fixture({
    op: 'approval.add',
    id: 'APR-P7-NOAUTH',
    title: 'Gate without authority',
    requiredAuthority: '',
  });
  await mock.fixture({
    op: 'approval.add',
    id: 'APR-P7-ODD',
    title: 'Gate with odd status',
    status: 'MAYBE_LATER',
  });
  await mock.fixture({
    op: 'alert.add',
    id: 'ALR-P7',
    title: 'Mock alert needing a human',
    humanActionRequired: true,
    missionId: 'AN-0142',
  });
  const codes = async () => {
    await expect(page.locator('details.explain').first()).toBeVisible({ timeout: 15_000 });
    // Open every explanation (the list re-renders as live data arrives).
    await page
      .locator('details.explain')
      .evaluateAll((els) => els.forEach((e) => ((e as HTMLDetailsElement).open = true)));
    return page.locator('details.explain').allInnerTexts();
  };
  await expect(page.getByText('Mock alert needing a human')).toBeVisible({ timeout: 15_000 });
  let text = (await codes()).join('\n');
  for (const c of [
    'PENDING_FOUNDER_GATE',
    'GATE_AUTHORITY_INVALID',
    'GATE_STATUS_UNRECOGNIZED',
    'ALERT_EXPLICIT_HUMAN_ACTION',
  ])
    expect(text).toContain(c);
  await mock.fault('alerts', 'http500');
  await expect(page.getByText('DATA_UNAVAILABLE_AFFECTS_QUEUE')).toBeAttached({ timeout: 15_000 });
  for (const r of ['health', 'workers', 'missions', 'approvals', 'events'])
    await mock.fault(r, 'http500');
  await mock.fault('stream', 'down');
  await expect(page.locator('.provenance__mode')).toHaveText('DISCONNECTED', { timeout: 20_000 });
  text = (await codes()).join('\n');
  expect(text).toContain('DATA_NOT_CURRENT');
  // Explanations report facts; they never claim urgency, approval or a decision.
  expect(text).not.toMatch(
    /\burgent|approved by|has been approved|decided to|because the worker wants/i,
  );
  await expect(page.getByRole('button', { name: AUTHORITY_CONTROL })).toHaveCount(0);
});

test('TIMELINE_SCOPING: only explicit references scope a timeline; look-alike text does not; UNKNOWN ≠ empty', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/activity?approval=APR-031');
  // An event whose text merely mentions the gate id, without referencing it.
  await mock.events('stream', [
    wireEvent('lookalike', -1000, { payload: { taskId: 'APR-031' }, missionId: 'AN-0141' }),
  ]);
  await page.waitForTimeout(1500);
  await expect(row(page, 'seed-13')).toHaveCount(1); // approval.requested APR-031
  await expect(row(page, 'lookalike')).toHaveCount(0);
  // An alert nothing references: a real empty state…
  await go(page, '/activity?alert=ALR-008');
  await expect(page.locator('.stream__item')).toHaveCount(0);
  await expect(page.getByText('Events: UNKNOWN (they could not be loaded)')).toHaveCount(0);
  // …which becomes UNKNOWN when events cannot be loaded.
  await mock.fault('events', 'http500');
  await expect(page.getByText('Events: UNKNOWN (they could not be loaded)')).toBeVisible({
    timeout: 15_000,
  });
});

test('SEARCH_PROVENANCE: results say LIVE-partial and stale data are not current', async ({
  page,
}, info) => {
  const mock = await openRuntime(page, info, '/');
  const search = async () => {
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: /Search commands/ }).fill('AN-0142');
    const prov = await page.locator('.palette__prov').allInnerTexts();
    await page.keyboard.press('Escape');
    return prov;
  };
  expect(await search()).toEqual([]); // LIVE and complete: nothing to qualify
  await mock.fault('missions', 'http500');
  await expect(page.locator('.provenance')).toHaveAttribute('data-qualifiers', /PARTIAL/, {
    timeout: 15_000,
  });
  const prov = await search();
  expect(prov.length).toBeGreaterThan(0);
  for (const p of prov) expect(p).toMatch(/PARTIAL DATA|STALE/);
});

/* ------------------- Phase 7 states: pseudo, Spanish, widths, axe ------------------- */

/** Put the runtime into the new Phase 7 states: late event, conflict, gap, duplicate. */
async function adversarialState(mock: RuntimeMock, page: Page) {
  // Mark mission as seen, in any locale.
  await page.locator('.mission-changes button.btn:not(.btn--ghost)').click();
  await expect(page.locator('.mission-changes [data-baseline]')).toHaveAttribute(
    'data-baseline',
    'ok',
  );
  await go(page, '/missions');
  await mock.events('stream', [wireEvent('st-late', -2 * HOUR)]);
  await mock.events('both', [wireEvent('st-dup', -1000)]);
  await mock.events('stream', [wireEvent('st-clash', -500)]);
  await mock.events('list', [wireEvent('st-clash', -5 * HOUR, { missionId: 'AN-0141' })]);
  await mock.fixture({ op: 'events.window', size: 20 });
  await mock.bulk({ count: 60, deliver: 'list', missionId: 'AN-0142', prefix: 'st-win' });
  await page.waitForTimeout(3000);
}

const P7_ROUTES = [
  '/missions/AN-0142',
  '/activity?mission=AN-0142&details=1',
  '/quality',
  '/missions?since=changed',
];
const WIDTHS = { w320: 320, w390: 390, w1440: 1440, w2560: 2560 } as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const [name, width] of Object.entries(WIDTHS)) {
  for (const locale of ['en', 'es', 'pseudo'] as const) {
    test(`${locale} at ${name}: Phase 7 runtime states have no overflow${locale === 'pseudo' ? ', untranslated text or clipping' : ''}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      if (locale === 'es')
        await page.addInitScript(() =>
          localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' })),
        );
      const q = locale === 'pseudo' ? '?pseudo=1' : '';
      const mock = await openRuntime(page, info, '/missions/AN-0142');
      if (q) {
        await page.goto(`${mock.origin}/${q}#/missions/AN-0142`);
        await page.locator('[data-surface="ready"]').waitFor();
      }
      await adversarialState(mock, page);
      const problems: string[] = [];
      for (const route of P7_ROUTES) {
        await go(page, route);
        await page
          .locator('details')
          .evaluateAll((els) => els.forEach((e) => ((e as HTMLDetailsElement).open = true)));
        if (locale === 'pseudo') {
          const r = await scan(page);
          problems.push(...r.untranslated.map((u) => `${route} untranslated: ${u}`));
          problems.push(...r.clipped.map((c) => `${route} clipped: ${c}`));
          if (r.overflow > 0) problems.push(`${route} overflows by ${r.overflow}px`);
        } else {
          const o = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          if (o > 0) problems.push(`${route} overflows by ${o}px`);
        }
        if (width === 1440) {
          const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<
            typeof AxeBuilder
          >[0])
            .withTags(TAGS)
            .analyze();
          problems.push(
            ...r.violations.map(
              (v) => `${route} axe ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
            ),
          );
        }
      }
      expect(problems).toEqual([]);
    });
  }
}
