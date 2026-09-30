import { describe, expect, it } from 'vitest';
import { restStreamTestAdapter, restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { FakeEventSource } from '@/test/fakeEventSource';
import { testAdapter } from '@/test/fixtures';
import { selectFreshness } from './freshness';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');

describe('freshness model', () => {
  it('SIMULATED: demo data is never LIVE, never "complete"', async () => {
    const a = testAdapter();
    const s = await a.connect();
    const f = selectFreshness(s, 'connected', NOW);
    expect(f).toEqual({
      source: 'SIMULATED',
      qualifiers: [],
      unknownResources: [],
      complete: false,
    });
  });

  it('LIVE with nothing missing is the only "complete" state', async () => {
    const { adapter } = restTestAdapter();
    const s = await adapter.connect();
    const f = selectFreshness(s, 'connected', NOW);
    expect(f.source).toBe('LIVE');
    expect(f.qualifiers).toEqual([]);
    expect(f.complete).toBe(true);
  });

  it('LIVE + PARTIAL + UNKNOWN when a resource fails (TRANSPORT LIVE ≠ COMPLETE DATA)', async () => {
    const backend = createFakeBackend();
    backend.failures.missions = 'http500';
    const { adapter } = restTestAdapter(backend);
    const s = await adapter.connect();
    const f = selectFreshness(s, 'connected', NOW);
    expect(f.source).toBe('LIVE');
    expect(f.qualifiers).toEqual(expect.arrayContaining(['PARTIAL', 'UNKNOWN']));
    expect(f.unknownResources).toEqual(['missions']);
    expect(f.complete).toBe(false);
  });

  it('LIVE + STALE once the last complete sync is older than the threshold', async () => {
    const { adapter } = restTestAdapter();
    const s = await adapter.connect();
    const later = NOW + (s.quality.staleAfterMs ?? 0) + 1;
    const f = selectFreshness(s, 'connected', later);
    expect(f.source).toBe('LIVE');
    expect(f.qualifiers).toContain('STALE');
    expect(f.complete).toBe(false);
  });

  it('DISCONNECTED + LAST KNOWN DATA after a good sync, when the backend goes away', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    for (const k of ['health', 'workers', 'missions', 'approvals'] as const)
      backend.failures[k] = 'down';
    await adapter.refresh();
    const f = selectFreshness(adapter.getSnapshot(), 'reconnecting', NOW);
    expect(f.source).toBe('DISCONNECTED');
    expect(f.qualifiers).toContain('LAST_KNOWN');
    expect(f.complete).toBe(false);
  });

  it('an open stream alone never makes data complete', async () => {
    const backend = createFakeBackend();
    backend.failures.workers = { payload: { nope: 1 } };
    FakeEventSource.reset();
    const { adapter } = restStreamTestAdapter(backend);
    await adapter.connect();
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit('heartbeat', '{}');
    expect(adapter.transportMode()).toBe('sse');
    const f = selectFreshness(adapter.getSnapshot(), 'connected', NOW);
    expect(f.complete).toBe(false);
    expect(f.qualifiers).toContain('PARTIAL');
  });
});
