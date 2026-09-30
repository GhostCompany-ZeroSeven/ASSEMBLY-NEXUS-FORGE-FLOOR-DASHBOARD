/**
 * Phase 5 adversarial resilience: the digest, brief, attention queue and
 * timeline must fail closed and say what is true when inputs are malformed,
 * missing, duplicated, out of order, stale or disappear mid-session.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { selectAttentionQueue } from '@/domain/attention';
import { createCheckpoint } from '@/domain/checkpoint';
import { computeDigest } from '@/domain/digest';
import { selectFreshness } from '@/domain/freshness';
import { LAST_VIEW_KEY } from '@/store/lastView';
import { restStreamTestAdapter, restTestAdapter } from '@/test/adapters';
import { FakeEventSource } from '@/test/fakeEventSource';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';
import { App } from './App';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const FOUNDER = 'Founder #0007';

async function renderAt(hash: string, adapter: Parameters<typeof App>[0]['adapter']) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
}

describe('malformed stored state', () => {
  it.each([
    ['not JSON', '{{{'],
    ['wrong type', '"a string"'],
    ['prototype pollution attempt', '{"__proto__":{"v":1},"constructor":{"prototype":{"x":1}}}'],
    ['huge garbage', JSON.stringify({ v: 2, at: 'x'.repeat(100_000) })],
    ['oversized payload (refused before parsing)', `{"v":2,"pad":"${'x'.repeat(600_000)}"}`],
  ])('a corrupt checkpoint (%s) is ignored and reported; the app still works', async (_n, raw) => {
    localStorage.setItem(LAST_VIEW_KEY, raw);
    await renderAt('#/brief', testAdapter());
    expect(screen.getByText(/unreadable or invalid and was ignored/)).toBeInTheDocument();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('a checkpoint from an older schema version is reported as outdated, not corrupt', async () => {
    localStorage.setItem(
      LAST_VIEW_KEY,
      JSON.stringify({ v: 1, at: '2026-09-30T11:00:00.000Z', adapterId: 'demo', mode: 'demo' }),
    );
    await renderAt('#/brief', testAdapter());
    expect(
      screen.getByText(/from another version of the dashboard was discarded/),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-figure="newSinceLastView"]')!.textContent).toContain(
      'UNKNOWN',
    );
  });

  it('storage that throws never breaks the brief (reported as unavailable)', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      const user = userEvent.setup();
      await renderAt('#/brief', testAdapter());
      await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
      expect(screen.getByText(/would not store the last-view record/)).toBeInTheDocument();
      // The in-session baseline still works.
      expect(screen.getByText(/Compared with your last view/)).toBeInTheDocument();
    } finally {
      get.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe('events: duplicated, out of order, re-listed, stale', () => {
  it('a stream event later re-listed by polling keeps its first ingest path and time', async () => {
    FakeEventSource.reset();
    const { adapter, backend, clock } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    clock.now += 5_000;
    const ev = {
      id: 'evt-once',
      kind: 'task.completed',
      at: new Date(NOW + 1000).toISOString(),
      missionId: 'AN-0142',
      payload: { taskId: 't-1' },
    };
    FakeEventSource.latest().emit('forge', JSON.stringify(ev));
    const first = adapter.getSnapshot().events.find((e) => e.id === 'evt-once')!;
    expect(first.via).toBe('stream');
    const receivedAt = first.receivedAt;
    // The backend now lists the same event; a re-sync must not relabel it.
    (backend.data.events as { events: unknown[] }).events.push(ev);
    clock.now += 60_000;
    await adapter.refresh();
    const after = adapter.getSnapshot().events.filter((e) => e.id === 'evt-once');
    expect(after).toHaveLength(1);
    expect(after[0]!.via).toBe('stream');
    expect(after[0]!.receivedAt).toBe(receivedAt);
  });

  it('polled events keep the arrival time of their first sync', async () => {
    const { adapter, clock } = restTestAdapter();
    const snap = await adapter.connect();
    const firstRx = snap.events[0]!.receivedAt;
    expect(firstRx).toBe(new Date(clock.now).toISOString());
    clock.now += 30_000;
    await adapter.refresh();
    expect(adapter.getSnapshot().events[0]!.receivedAt).toBe(firstRx);
  });

  it('duplicate event ids are counted once in the digest', () => {
    const s = buildSeedSnapshot(NOW);
    const cp = createCheckpoint(s, new Date(NOW - 60_000).toISOString());
    const e = { ...s.events.at(-1)!, id: 'dup', at: new Date(NOW).toISOString() };
    expect(computeDigest({ ...s, events: [...s.events, e, e, e] }, cp).counts.events).toBe(1);
  });
});

describe('records that disappear or are renamed', () => {
  it('a renamed mission is not reported as a change (ids, not labels, are compared)', () => {
    const s = buildSeedSnapshot(NOW);
    const cp = createCheckpoint(s, new Date(NOW - 60_000).toISOString());
    const renamed = { ...s, missions: s.missions.map((m) => ({ ...m, title: `${m.title} (v2)` })) };
    const d = computeDigest(renamed, cp);
    expect(d.items).toEqual([]);
  });

  it('a gate whose mission disappeared still links by id; the label falls back to the id', () => {
    const s = buildSeedSnapshot(NOW);
    const gone = { ...s, missions: s.missions.filter((m) => m.id !== 'AN-0144') };
    const gateMission = s.approvals.find((a) => a.id === 'APR-031')!.missionId!;
    const q = selectAttentionQueue(
      { ...gone, missions: gone.missions.filter((m) => m.id !== gateMission) },
      FOUNDER,
      selectFreshness(gone, 'connected', NOW),
    );
    const rel = q.items.find((i) => i.id === 'APR-031')!.related[0]!;
    expect(rel).toMatchObject({ kind: 'mission', id: gateMission, label: gateMission });
  });

  it('the timeline says a record is no longer reported instead of inventing its state', async () => {
    const adapter = testAdapter();
    await renderAt('#/activity?mission=AN-0142', adapter);
    const snap = adapter.getSnapshot();
    act(() => {
      (adapter as unknown as { snapshot: typeof snap }).snapshot = {
        ...snap,
        missions: snap.missions.filter((m) => m.id !== 'AN-0142'),
      };
      adapter.simulation.step();
    });
    const stream = screen.getByRole('list', { name: 'Activity stream' });
    expect(within(stream).getAllByText(/Now: no longer reported/).length).toBeGreaterThan(0);
  });
});

describe('partial data, disconnects and locale changes during updates', () => {
  it('REST partial: digest categories for the failed resource are UNKNOWN; others stay exact', async () => {
    const { adapter, backend, clock } = restTestAdapter();
    const first = await adapter.connect();
    const cp = createCheckpoint(first, new Date(clock.now).toISOString());
    backend.failures.approvals = 'http500';
    clock.now += 10_000;
    await adapter.refresh();
    const d = computeDigest(adapter.getSnapshot(), cp);
    expect(d.counts.approvalsNew).toBeNull();
    expect(d.unknown.approvalsNew).toBe('unavailable-now');
    expect(d.counts.missionsNew).toBe(0);
  });

  it('backend down after "Mark all as seen": the brief turns UNKNOWN / not current, never zero', async () => {
    const user = userEvent.setup();
    const { adapter, backend } = restTestAdapter();
    await renderAt('#/brief', adapter);
    await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    for (const r of ['health', 'workers', 'missions', 'approvals', 'alerts', 'events'] as const)
      backend.failures[r] = 'down';
    await act(async () => {
      await adapter.refresh();
    });
    const needs = document.querySelector('[data-figure="needsFounder"]')!;
    expect(needs.textContent).toContain('UNKNOWN');
    expect(document.querySelector('[data-figure="blocked"]')!.textContent).toContain('UNKNOWN');
    expect(document.querySelector('[data-problem="unavailable"]')).not.toBeNull();
  });

  it('an automatic checkpoint is NOT recorded from incomplete data (keeps the older complete one)', async () => {
    const { adapter, backend } = restTestAdapter();
    await renderAt('#/brief', adapter);
    backend.failures.workers = 'http500';
    await act(async () => {
      await adapter.refresh();
    });
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    vis.mockRestore();
    expect(localStorage.getItem(LAST_VIEW_KEY)).toBeNull();
  });

  it('switching language while the simulation updates keeps the digest consistent', async () => {
    const user = userEvent.setup();
    const adapter = testAdapter();
    await renderAt('#/brief', adapter);
    await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    act(() => {
      for (let i = 0; i < 6; i++) adapter.simulation.step();
    });
    const countsEn = [...document.querySelectorAll('.digest-counts__row dd')].map(
      (d) => d.textContent,
    );
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
    await act(async () => {
      window.location.hash = '#/settings';
    });
    const select = await screen.findByRole('combobox', { name: 'Language' });
    await user.selectOptions(select, 'es');
    await act(async () => {
      window.location.hash = '#/brief';
    });
    await screen.findByRole('heading', { name: 'Desde tu última visita' });
    const countsEs = [...document.querySelectorAll('.digest-counts__row dd')].map(
      (d) => d.textContent,
    );
    expect(countsEs).toEqual(countsEn);
  });
});
