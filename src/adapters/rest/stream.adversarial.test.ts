import { beforeEach, describe, expect, it } from 'vitest';
import { displayMode } from '@/domain/provenance';
import { restStreamTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { FakeEventSource } from '@/test/fakeEventSource';

/**
 * Adversarial exercise of the optional SSE path against the MOCK contract.
 * No ordering guarantee is assumed beyond what events themselves carry (`at`).
 */

const T0 = '2026-09-30T12:00:30.000Z';
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();

async function openStream(backend = createFakeBackend(), maxRetries = 2) {
  FakeEventSource.reset();
  const ctx = restStreamTestAdapter(backend, maxRetries);
  await ctx.adapter.connect();
  FakeEventSource.latest().open();
  FakeEventSource.latest().emit('heartbeat', '{}');
  return ctx;
}
const push = (ev: Record<string, unknown>) =>
  FakeEventSource.latest().emit('forge', JSON.stringify(ev));
const worker = (
  a: { getSnapshot: () => { workers: { id: string; state: string }[] } },
  id: string,
) => a.getSnapshot().workers.find((w) => w.id === id)!;

describe('SSE adversarial (mock contract)', () => {
  beforeEach(() => FakeEventSource.reset());

  it('duplicate events (same id) are applied once', async () => {
    const { adapter } = await openStream();
    const before = adapter.getSnapshot().events.length;
    const ev = {
      id: 'dup-1',
      kind: 'worker.state_changed',
      at: at(1),
      workerId: 'w-mina',
      payload: { state: 'BLOCKED' },
    };
    push(ev);
    push(ev);
    expect(adapter.getSnapshot().events.length).toBe(before + 1);
  });

  it('an older state event arriving late does not roll a worker back', async () => {
    const { adapter } = await openStream();
    push({
      id: 'n',
      kind: 'worker.state_changed',
      at: at(20),
      workerId: 'w-mina',
      payload: { state: 'BLOCKED' },
    });
    push({
      id: 'o',
      kind: 'worker.state_changed',
      at: at(10),
      workerId: 'w-mina',
      payload: { state: 'WORKING' },
    });
    expect(worker(adapter, 'w-mina').state).toBe('BLOCKED');
    // The late event is still visible in the log (nothing is silently dropped).
    expect(adapter.getSnapshot().events.some((e) => e.id === 'o')).toBe(true);
  });

  it('oversized and unknown-type messages are rejected without closing the stream', async () => {
    const { adapter } = await openStream();
    const before = adapter.getSnapshot();
    FakeEventSource.latest().emit('forge', 'x'.repeat(300 * 1024));
    push({ id: 'u1', kind: 'worker.teleported', at: at(1), payload: {} });
    expect(adapter.getStreamState()).toBe('open');
    expect(adapter.getSnapshot().workers).toEqual(before.workers);
    expect(adapter.diagnostics().rejectedStreamMessages).toBeGreaterThanOrEqual(1);
  });

  it('health failing while the stream is healthy: LIVE only until the next REST verification', async () => {
    const { adapter, backend } = await openStream();
    expect(displayMode(adapter.provenance(), 'connected')).toBe('live');
    backend.failures.health = 'http500';
    // Stream heartbeats alone never re-verify health; the next REST cycle does.
    FakeEventSource.latest().emit('heartbeat', '{}');
    expect(adapter.provenance().verifiedBackend).toBe(true); // documented window
    await adapter.refresh(); // what the resync interval triggers
    expect(adapter.provenance().verifiedBackend).toBe(false);
    expect(displayMode(adapter.provenance(), 'connected')).toBe('disconnected');
  });

  it('REST failing during polling fallback reports disconnected, never LIVE', async () => {
    const { adapter, backend, timers } = await openStream(createFakeBackend(), 0);
    FakeEventSource.latest().error();
    await timers.advance(1);
    expect(adapter.transportMode()).toBe('polling-fallback');
    await adapter.refresh(); // let the resync triggered by the stream failure settle
    for (const k of ['health', 'workers', 'missions', 'approvals'] as const)
      backend.failures[k] = 'down';
    await adapter.refresh();
    expect(adapter.provenance().verifiedBackend).toBe(false);
    expect(displayMode(adapter.provenance(), 'reconnecting')).toBe('disconnected');
  });

  it('after giving up, the stream is retried again only after a cool-down (no reconnect storm)', async () => {
    const { adapter, clock, timers } = await openStream(createFakeBackend(), 0);
    FakeEventSource.latest().error();
    await timers.advance(1);
    expect(adapter.getStreamState()).toBe('failed');
    await adapter.refresh(); // settle the resync triggered by leaving 'open'
    const sources = FakeEventSource.instances.length;
    // Healthy REST cycles inside the cool-down do not reopen the stream.
    await adapter.refresh();
    expect(FakeEventSource.instances.length).toBe(sources);
    // After the cool-down, one successful REST cycle re-arms it once.
    clock.now += 5 * 60_000 + 1;
    await adapter.refresh();
    expect(FakeEventSource.instances.length).toBe(sources + 1);
    await adapter.refresh();
    expect(FakeEventSource.instances.length).toBe(sources + 1);
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit('heartbeat', '{}');
    expect(adapter.transportMode()).toBe('sse');
  });

  it('disconnect() during retries leaves no stream or timers behind', async () => {
    const { adapter, timers } = await openStream();
    FakeEventSource.latest().error();
    adapter.disconnect();
    await timers.advance(120_000);
    expect(timers.pendingCount()).toBe(0);
  });
});

describe('recovery while the stream is open (found in the Phase 4 runtime exercise)', () => {
  it('an open stream never delays re-verification of an unverified backend', async () => {
    const { RestAdapter } = await import('./RestAdapter');
    const { createSseTransport } = await import('@/adapters/transport/sse');
    const { manualTimers } = await import('@/test/manualTimers');
    const { BASE } = await import('@/test/fakeBackend');
    FakeEventSource.reset();
    const backend = createFakeBackend();
    const timers = manualTimers();
    let tick: () => Promise<void> = async () => undefined;
    const adapter = new RestAdapter(
      {
        baseUrl: BASE,
        pollIntervalMs: 5000,
        stream: {
          path: '/stream',
          heartbeatTimeoutMs: 20_000,
          maxRetries: 3,
          resyncIntervalMs: 60_000,
        },
      },
      {
        fetch: backend.fetch,
        now: () => Date.parse('2026-09-30T12:00:00Z'),
        createTransport: (fn) => {
          tick = fn as () => Promise<void>;
          return { start: () => undefined, stop: () => undefined };
        },
        createStream: (opts) =>
          createSseTransport({
            ...opts,
            createEventSource: (url) => new FakeEventSource(url),
            setTimer: timers.setTimer,
            clearTimer: timers.clearTimer,
          }),
      },
    );
    await adapter.connect();
    await tick(); // the transport's immediate first tick is skipped by design
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit('heartbeat', '{}');
    backend.failures.health = 'http500';
    await adapter.refresh();
    expect(adapter.provenance().verifiedBackend).toBe(false);
    // Backend recovers; the stream stays open. The very next poll must re-verify
    // (previously it was skipped for up to resyncIntervalMs = 60s).
    delete backend.failures.health;
    await tick();
    expect(adapter.provenance().verifiedBackend).toBe(true);
  });

  it('the stream reconnecting while unverified triggers an immediate re-verification', async () => {
    const { adapter, backend, timers } = await openStream();
    backend.failures.health = 'http500';
    await adapter.refresh();
    expect(adapter.provenance().verifiedBackend).toBe(false);
    delete backend.failures.health;
    FakeEventSource.latest().error(); // stream drops …
    await timers.advance(1000); // … and reconnects
    FakeEventSource.latest().open();
    await adapter.refresh(); // settle the cycle the reopen started
    expect(adapter.provenance().verifiedBackend).toBe(true);
  });
});
