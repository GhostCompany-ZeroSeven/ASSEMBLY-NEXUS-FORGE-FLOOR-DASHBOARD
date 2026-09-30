import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoAdapter } from '@/adapters/demo/DemoAdapter';
import { buildStressSnapshot } from '@/adapters/demo/stress';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { MAX_EVENTS } from '@/domain/snapshot';
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
