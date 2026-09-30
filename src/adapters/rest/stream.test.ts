import { beforeEach, describe, expect, it } from 'vitest';
import { restStreamTestAdapter } from '@/test/adapters';
import { FakeEventSource } from '@/test/fakeEventSource';
import { BASE } from '@/test/fakeBackend';
import { isStale } from '@/domain/selectors';

const AT = '2026-09-30T12:00:10.000Z';
const ev = (e: Record<string, unknown>) => JSON.stringify({ at: AT, ...e });

describe('RestAdapter + SSE stream', () => {
  beforeEach(() => FakeEventSource.reset());

  it('opens the stream after the first REST sync, same base URL, no credentials in URL', async () => {
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    const es = FakeEventSource.latest();
    expect(es.url).toBe(`${BASE}/stream`);
    expect(adapter.transportMode()).toBe('polling'); // not open yet, nothing has failed
    es.open();
    expect(adapter.transportMode()).toBe('sse');
    expect(adapter.getSnapshot().provenance.transport).toBe('sse');
    expect(adapter.getSnapshot().provenance.verifiedBackend).toBe(true);
  });

  it('applies valid pushed events to the snapshot', async () => {
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit(
      'forge',
      ev({
        id: 's1',
        kind: 'worker.state_changed',
        workerId: 'w-rook',
        payload: { state: 'running', activity: 'Paged' },
      }),
    );
    const rook = adapter.getSnapshot().workers.find((w) => w.id === 'w-rook')!;
    expect(rook.state).toBe('WORKING');
    expect(rook.currentActivity).toBe('Paged');
    expect(adapter.getSnapshot().events.at(-1)!.id).toBe('s1');
  });

  it('rejects malformed JSON, unknown kinds and invalid payloads with visible issues', async () => {
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    const es = FakeEventSource.latest();
    es.open();
    const before = adapter.getSnapshot().events.length;
    es.emit('forge', '{not json');
    es.emit('forge', ev({ id: 's2', kind: 'teleport.started', payload: {} }));
    es.emit(
      'forge',
      ev({
        id: 's3',
        kind: 'task.progress',
        missionId: 'AN-0142',
        payload: { taskId: 'x', progress: 7 },
      }),
    );
    const s = adapter.getSnapshot();
    expect(s.events.length).toBe(before);
    const streamIssues = s.quality.issues.filter((i) => i.source === 'stream');
    expect(streamIssues.length).toBeGreaterThanOrEqual(3);
  });

  it('BACKEND CLAIM ≠ VERIFIED AUTHORITY: a pushed decision by a worker is rejected', async () => {
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit(
      'forge',
      ev({
        id: 's4',
        kind: 'approval.decided',
        payload: {
          approvalId: 'APR-031',
          record: { decision: 'APPROVE', decidedBy: 'Cyrus Anvil', decidedAt: AT },
        },
      }),
    );
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
    expect(
      adapter
        .getSnapshot()
        .quality.issues.some((i) => /Rejected backend decision claim/.test(i.message)),
    ).toBe(true);
  });

  it('a pushed decision by the named human authority is applied as delivered', async () => {
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit(
      'forge',
      ev({
        id: 's5',
        kind: 'approval.decided',
        payload: {
          approvalId: 'APR-031',
          record: { decision: 'HOLD', decidedBy: 'Founder #0007', decidedAt: AT },
        },
      }),
    );
    const a = adapter.getSnapshot().approvals.find((x) => x.id === 'APR-031')!;
    expect(a.status).toBe('HELD');
    expect(a.decision?.delivery).toBe('delivered');
  });

  it('a pushed approval.requested cannot arrive pre-approved', async () => {
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit(
      'forge',
      ev({
        id: 's6',
        kind: 'approval.requested',
        payload: {
          request: {
            id: 'APR-999',
            title: 'Sneaky',
            requestedBy: 'w-cyrus',
            requestedAt: AT,
            status: 'approved',
            requiredAuthority: 'Founder #0007',
            decision: { decision: 'APPROVE', decidedBy: 'Founder #0007', decidedAt: AT },
          },
        },
      }),
    );
    expect(adapter.getSnapshot().approvals.some((a) => a.id === 'APR-999')).toBe(false);
  });

  it('heartbeats keep data fresh while the stream is healthy', async () => {
    const { adapter, clock } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    clock.now += 60_000;
    FakeEventSource.latest().emit('heartbeat', '');
    expect(isStale(adapter.getSnapshot(), clock.now)).toBe(false);
  });

  it('stale stream → retry; exhausted retries → explicit polling fallback + issue', async () => {
    const { adapter, timers } = restStreamTestAdapter(undefined, 1);
    await adapter.connect();
    FakeEventSource.latest().open();
    await timers.advance(10_001); // heartbeat timeout → stale → retrying
    expect(adapter.getStreamState()).toBe('retrying');
    expect(adapter.transportMode()).toBe('polling-fallback');
    await timers.advance(1000);
    FakeEventSource.latest().error(); // second consecutive failure > maxRetries(1)
    await timers.advance(0);
    expect(adapter.getStreamState()).toBe('failed');
    const s = adapter.getSnapshot();
    expect(s.provenance.transport).toBe('polling-fallback');
    expect(s.provenance.note).toMatch(/Live stream unavailable/);
    expect(s.quality.issues.some((i) => /Falling back to polling/.test(i.message))).toBe(true);
    // Fallback does not by itself drop LIVE: REST health is still verified.
    expect(s.provenance.verifiedBackend).toBe(true);
  });

  it('disconnect() closes the stream and leaves no timers', async () => {
    const { adapter, timers } = restStreamTestAdapter();
    await adapter.connect();
    const es = FakeEventSource.latest();
    es.open();
    adapter.disconnect();
    expect(es.closed).toBe(true);
    expect(timers.pendingCount()).toBe(0);
  });
});
