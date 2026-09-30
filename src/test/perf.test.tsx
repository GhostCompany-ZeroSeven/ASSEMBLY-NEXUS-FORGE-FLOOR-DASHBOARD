import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoAdapter } from '@/adapters/demo/DemoAdapter';
import { buildStressSnapshot } from '@/adapters/demo/stress';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { MAX_EVENTS } from '@/domain/snapshot';
import { mergeObserved } from '@/adapters/rest/RestAdapter';
import { observeSession } from '@/domain/contract/observe';
import { historyAssured } from '@/domain/contract/profiles';
import { createFakeBackend } from './fakeBackend';
import { waitForSurface } from './render';

const NOW = Date.parse('2026-09-30T12:00:00Z');

function stressAdapter() {
  const a = new DemoAdapter({ autoRun: false, now: () => NOW, scale: 'stress' });
  return a;
}

/** Track live intervals: created minus cleared. */
function trackIntervals() {
  const live = new Set<unknown>();
  const origSet = window.setInterval.bind(window);
  const origClear = window.clearInterval.bind(window);
  vi.spyOn(window, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
    const h = origSet(fn, ms);
    live.add(h);
    return h;
  }) as typeof window.setInterval);
  vi.spyOn(window, 'clearInterval').mockImplementation(((h?: number) => {
    live.delete(h);
    origClear(h);
  }) as typeof window.clearInterval);
  return live;
}

afterEach(() => vi.restoreAllMocks());

describe('performance and resilience (stress dataset)', () => {
  it('stress dataset is large, deterministic and still demo-labelled', () => {
    const a = buildStressSnapshot(NOW);
    const b = buildStressSnapshot(NOW);
    expect(a.workers).toHaveLength(120);
    expect(a.missions).toHaveLength(400);
    expect(a.events.length).toBe(MAX_EVENTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.provenance.mode).toBe('demo');
    expect(a.workers.every((w) => w.authority.length === 0)).toBe(true);
  });

  for (const hash of [
    '#/',
    '#/floor',
    '#/missions',
    '#/workers',
    '#/approvals',
    '#/activity',
    '#/brief',
    '#/quality',
  ]) {
    it(`${hash} renders the stress dataset within budget with a bounded number of timers`, async () => {
      const live = trackIntervals();
      window.location.hash = hash;
      const t0 = performance.now();
      const { unmount } = render(<App config={assemblyNexusConfig} adapter={stressAdapter()} />);
      await waitForSurface();
      const ms = performance.now() - t0;
      // Generous budget for jsdom under parallel load; catches order-of-magnitude regressions.
      expect(ms).toBeLessThan(8000);
      // One shared clock per interval, never one timer per card.
      expect(live.size).toBeLessThanOrEqual(4);
      unmount();
      expect(live.size).toBe(0); // no runaway timers after unmount
    });
  }
});

import { act } from '@testing-library/react';
import { DashboardProvider } from '@/store/DashboardProvider';
import { activeClockCount } from '@/store/hooks';
import { restTestAdapter } from './adapters';
import { testAdapter } from './fixtures';

describe('resilience: bounded state, no leaks, no duplicate polling', () => {
  it('a long-running demo keeps retained state bounded', async () => {
    const a = testAdapter();
    await a.connect();
    for (let i = 0; i < 3000; i++) a.step();
    const s = a.getSnapshot();
    expect(s.events.length).toBeLessThanOrEqual(MAX_EVENTS);
    expect(
      s.missions.filter((m) => m.status === 'COMPLETE' || m.status === 'FAILED').length,
    ).toBeLessThanOrEqual(60);
    expect(s.missions.length).toBeLessThan(120);
  });

  it('messages are bounded', async () => {
    const a = testAdapter();
    await a.connect();
    for (let i = 0; i < 400; i++) await a.sendWorkerMessage('w-ada', `m${i}`, 'Founder #0007');
    expect(a.getSnapshot().messages.length).toBeLessThanOrEqual(300);
  });

  it('unmounting the provider unsubscribes and disconnects the adapter', async () => {
    const a = testAdapter();
    const disconnect = vi.spyOn(a, 'disconnect');
    const { unmount } = render(<DashboardProvider adapter={a}>x</DashboardProvider>);
    await act(async () => {});
    unmount();
    expect(disconnect).toHaveBeenCalled();
    // After disconnect, stepping notifies nobody (no leaked listeners).
    const seen: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a as any).listeners.forEach((l: unknown) => seen.push(l));
    expect(seen).toHaveLength(0);
  });

  it('shared clocks stop when nothing displays time', async () => {
    window.location.hash = '#/missions';
    const { unmount } = render(<App config={assemblyNexusConfig} adapter={stressAdapter()} />);
    await waitForSurface();
    expect(activeClockCount()).toBeGreaterThan(0);
    unmount();
    expect(activeClockCount()).toBe(0);
  });

  it('REST: repeated connect() never starts a second poller or stream', async () => {
    let starts = 0;
    const { adapter } = restTestAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).createTransport = () => ({ start: () => starts++, stop: () => {} });
    await adapter.connect();
    await adapter.connect();
    await adapter.connect();
    expect(starts).toBe(1);
    adapter.disconnect();
  });
});

import { selectAttentionQueue } from '@/domain/attention';
import { createCheckpoint } from '@/domain/checkpoint';
import { computeDigest } from '@/domain/digest';
import { selectFreshness } from '@/domain/freshness';
import { arrivedOutOfOrder, filterEvents, timelineOrder } from '@/features/activity/filter';

describe('Phase 5 computations stay bounded on the stress dataset', () => {
  const timeIt = (fn: () => void, runs = 20) => {
    fn(); // warm-up
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return (performance.now() - t0) / runs;
  };
  const s = buildStressSnapshot(NOW);
  // Baseline where every record differs, so the digest does maximal work.
  const changed = {
    ...s,
    missions: s.missions.map((m, i) => ({
      ...m,
      status: i % 2 ? ('COMPLETE' as const) : m.status,
    })),
    workers: s.workers.map((w) => ({ ...w, state: 'IDLE' as const })),
  };
  const cp = createCheckpoint(changed, new Date(NOW - 3_600_000).toISOString());

  it('change digest (400 missions, 120 workers, 500 events) < 25ms', () => {
    const ms = timeIt(() => computeDigest(s, cp));
    expect(ms).toBeLessThan(25);
    const d = computeDigest(s, cp);
    expect(d.items.length).toBeLessThanOrEqual(150); // display list stays bounded
  });

  it('attention queue < 10ms', () => {
    const f = selectFreshness(s, 'connected', NOW);
    expect(timeIt(() => selectAttentionQueue(s, 'Founder #0007', f))).toBeLessThan(10);
  });

  it('timeline filter + order + out-of-order detection over the full log < 10ms', () => {
    const ms = timeIt(() => {
      timelineOrder(filterEvents(s.events, { includeLowSignal: true, via: 'simulated' }));
      arrivedOutOfOrder(s.events);
    });
    expect(ms).toBeLessThan(10);
  });

  it('checkpoint size stays bounded (stored in localStorage)', () => {
    expect(JSON.stringify(cp).length).toBeLessThan(64 * 1024);
  });
});

import { selectAttentionQueue as queueOf } from '@/domain/attention';
import { explainAttention } from '@/domain/attentionExplain';
import { selectDataQuality } from '@/domain/dataQuality';
import { lastActivityByMission, selectMissionMarkers } from '@/domain/missionMarkers';
import { computeMissionDigest, createMissionCheckpoint } from '@/domain/missionView';

describe('Phase 6 computations stay bounded on the stress dataset', () => {
  const timeIt = (fn: () => void, runs = 20) => {
    fn();
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return (performance.now() - t0) / runs;
  };
  const s = buildStressSnapshot(NOW);
  const f = selectFreshness(s, 'connected', NOW);
  const at = new Date(NOW - 60_000).toISOString();
  // 50 viewed missions (the storage cap), all with checkpoints.
  const views = new Map(
    s.missions.slice(0, 50).map((m) => [m.id, createMissionCheckpoint(s, m.id, f, at)]),
  );
  const q = queueOf(s, 'Founder #0007', f);

  it('mission digest < 5ms', () => {
    const id = s.missions[0]!.id;
    expect(timeIt(() => computeMissionDigest(s, id, views.get(id)!, f))).toBeLessThan(5);
  });

  it('markers for 400 missions with 50 viewed + last activity < 60ms', () => {
    const ms = timeIt(() => {
      selectMissionMarkers(s, null, (id) => views.get(id) ?? null, q, f);
      lastActivityByMission(s);
    }, 10);
    expect(ms).toBeLessThan(60);
  });

  it('data quality report and all attention explanations < 10ms', () => {
    expect(
      timeIt(() => {
        selectDataQuality(s, f, 'connected', NOW);
        for (const i of q.items) explainAttention(i, s, f);
      }),
    ).toBeLessThan(10);
  });

  it('all 50 mission checkpoints serialize under 1MB (the storage cap)', () => {
    const json = JSON.stringify({ v: 1, missions: Object.fromEntries(views) });
    expect(json.length).toBeLessThan(1_000_000);
  });
});

describe('Phase 7 event reconciliation stays bounded', () => {
  const timeIt = (fn: () => void, runs = 20) => {
    fn();
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return (performance.now() - t0) / runs;
  };
  const s = buildStressSnapshot(NOW);
  const at = new Date(NOW).toISOString();

  it('REST merge of a full log with a 600-event listing (500 known, 100 new) < 10ms', () => {
    const fresh = Array.from({ length: 100 }, (_, i) => ({
      ...s.events[0]!,
      id: `new-${i}`,
      at: new Date(NOW - i * 1000).toISOString(),
    }));
    const listed = [...s.events, ...fresh];
    const evicted = new Set(Array.from({ length: 5000 }, (_, i) => `gone-${i}`));
    const ms = timeIt(() => mergeObserved(listed, s.events, at, evicted));
    expect(ms).toBeLessThan(10);
    expect(mergeObserved(listed, s.events, at, evicted).events).toHaveLength(MAX_EVENTS);
  });

  it('REST sync with 1000 listed events incl. 500 duplicates stays < 40ms', async () => {
    const backend = createFakeBackend();
    const wire = (backend.data.events as { events: unknown[] }).events;
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: `dup-${i}`,
      kind: 'task.completed',
      at: new Date(NOW - i * 1000).toISOString(),
      missionId: 'AN-0142',
      payload: { taskId: 't' },
    }));
    wire.push(...many, ...many);
    const { adapter } = restTestAdapter(backend);
    await adapter.connect();
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) await adapter.refresh();
    expect((performance.now() - t0) / 10).toBeLessThan(40);
    expect(adapter.getSnapshot().events.length).toBeLessThanOrEqual(MAX_EVENTS);
  });
});

describe('Phase 8 contract evaluation stays bounded (and outside the render path)', () => {
  const timeIt = (fn: () => void, runs = 50) => {
    fn();
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return (performance.now() - t0) / runs;
  };
  const s = buildStressSnapshot(NOW);
  const live = {
    ...s,
    provenance: { ...s.provenance, mode: 'live' as const, contractProfile: 'mock' },
  };

  it('profile resolution + history assurance < 0.1ms', () => {
    expect(timeIt(() => historyAssured(live.provenance), 500)).toBeLessThan(0.1);
  });

  it('session observation of all 14 rules over 500 events < 5ms', () => {
    const late = arrivedOutOfOrder(live.events).size;
    expect(timeIt(() => observeSession(live, NOW, late))).toBeLessThan(5);
  });

  it('the inspector with the contract panel renders the stress dataset < 8s (jsdom)', async () => {
    window.location.hash = '#/quality';
    const t0 = performance.now();
    const { unmount } = render(<App config={assemblyNexusConfig} adapter={stressAdapter()} />);
    await waitForSurface();
    expect(document.querySelectorAll('[data-rule]')).toHaveLength(14);
    expect(performance.now() - t0).toBeLessThan(8000);
    unmount();
  });
});
