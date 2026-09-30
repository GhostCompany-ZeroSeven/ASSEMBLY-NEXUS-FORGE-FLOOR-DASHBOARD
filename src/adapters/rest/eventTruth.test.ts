/**
 * Phase 7: event truth under adversarial delivery (REST + SSE).
 *
 * Late, duplicate, conflicting and skipped events. Each test names the rule it
 * locks in. The browser runtime suite (e2e/phase7.spec.ts) exercises the same
 * rules against a real HTTP + SSE mock server.
 */
import { describe, expect, it } from 'vitest';
import {
  computeMissionDigest,
  createMissionCheckpoint,
  type FreshnessView,
} from '@/domain/missionView';
import { eventCoverage, historyGapSince } from '@/domain/eventCoverage';
import type { DashboardEvent } from '@/domain/events';
import { MAX_EVENTS } from '@/domain/snapshot';
import { restStreamTestAdapter, restTestAdapter } from '@/test/adapters';
import { FakeEventSource } from '@/test/fakeEventSource';
import { classifyIssue } from '@/domain/dataQuality';
import { resourceUnavailable } from '@/domain/selectors';
import { mergeObserved } from './RestAdapter';

type Rec = Record<string, unknown>;
const T0 = Date.parse('2026-09-30T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const LIVE: FreshnessView = { source: 'LIVE', qualifiers: [] };
const listing = (data: Rec) => (data.events as { events: Rec[] }).events;

function wire(id: string, atMs: number, missionId = 'AN-0142'): Rec {
  return { id, kind: 'task.completed', at: iso(atMs), missionId, payload: { taskId: 't' } };
}
function ev(id: string, atMs: number, rx = iso(T0)): DashboardEvent {
  return {
    id,
    kind: 'task.completed',
    at: iso(atMs),
    missionId: 'AN-0142',
    payload: { taskId: 't' },
    via: 'poll',
    receivedAt: rx,
  } as DashboardEvent;
}

async function streamed() {
  FakeEventSource.reset();
  const t = restStreamTestAdapter();
  await t.adapter.connect();
  FakeEventSource.latest().open();
  const emit = (e: Rec) => FakeEventSource.latest().emit('forge', JSON.stringify(e));
  return { ...t, emit };
}

describe('late events are never silently lost (P7-D1)', () => {
  it('a late event (old event time, new arrival) survives trimming at capacity', () => {
    const prev = Array.from({ length: MAX_EVENTS }, (_, i) => ev(`e${i}`, T0 + i * 1000));
    const late = ev('late', T0 - 3_600_000);
    const listed = [...prev, late];
    const { events } = mergeObserved(listed, prev, iso(T0 + 1e6));
    expect(events).toHaveLength(MAX_EVENTS);
    // The EARLIEST OBSERVED event goes, never the newly observed late one.
    expect(events.some((e) => e.id === 'late')).toBe(true);
    expect(events.some((e) => e.id === 'e0')).toBe(false);
  });

  it('every event observed after a retained one is retained (coverage invariant)', () => {
    const prev = Array.from({ length: MAX_EVENTS }, (_, i) => ev(`e${i}`, T0 + i * 1000));
    const newer = [ev('late-1', T0 - 10), ev('n1', T0 + 9e6), ev('late-2', T0 - 20)];
    const { events } = mergeObserved([...prev, ...newer], prev, iso(T0 + 1e6));
    const ids = events.map((e) => e.id);
    for (const id of ['late-1', 'n1', 'late-2']) expect(ids).toContain(id);
    // Newly listed events join in event-time order after everything observed before.
    expect(ids.slice(-3)).toEqual(['late-2', 'late-1', 'n1']);
  });

  it('a late stream event keeps its source time, gets its own arrival time, and does not become the snapshot time', async () => {
    const { adapter, clock, emit } = await streamed();
    clock.now = T0 + 60_000;
    emit(wire('late-stream', T0 - 3_600_000));
    const s = adapter.getSnapshot();
    const e = s.events.find((x) => x.id === 'late-stream')!;
    expect(e.at).toBe(iso(T0 - 3_600_000));
    expect(e.receivedAt).toBe(iso(T0 + 60_000));
    expect(s.generatedAt).toBe(iso(T0 + 60_000));
  });

  it('a future-skewed stream event does not move the snapshot time into the future', async () => {
    const { adapter, clock, emit } = await streamed();
    clock.now = T0 + 1000;
    emit(wire('future', T0 + 86_400_000));
    expect(adapter.getSnapshot().generatedAt).toBe(iso(T0 + 1000));
  });
});

describe('evicted events are not re-admitted (P7-D6)', () => {
  it('an id dropped at capacity stays dropped when a later listing still contains it', () => {
    const prev = Array.from({ length: MAX_EVENTS }, (_, i) => ev(`e${i}`, T0 + i * 1000));
    const first = mergeObserved([...prev, ev('n1', T0 + 1e7)], prev, iso(T0 + 1));
    expect(first.dropped).toEqual(['e0']);
    const evicted = new Set(first.dropped);
    // The source keeps listing e0: it is not a new arrival and does not push others out.
    const again = mergeObserved(
      [ev('e0', T0), ...prev.slice(1), ev('n1', T0 + 1e7)],
      first.events,
      iso(T0 + 2),
      evicted,
    );
    expect(again.events.map((e) => e.id)).toEqual(first.events.map((e) => e.id));
    expect(again.dropped).toEqual([]);
  });

  it('a stream re-delivery of an evicted id is ignored', async () => {
    const { adapter, clock, emit } = await streamed();
    const firstId = adapter.getSnapshot().events[0]!.id;
    for (let i = 0; i < MAX_EVENTS; i++) {
      clock.now = T0 + 1000 + i;
      emit(wire(`s${i}`, T0 + 1000 + i));
    }
    expect(adapter.getSnapshot().events.some((e) => e.id === firstId)).toBe(false);
    const before = adapter.getSnapshot().events.map((e) => e.id);
    emit(wire(firstId, T0 - 1));
    expect(adapter.getSnapshot().events.map((e) => e.id)).toEqual(before);
  });
});

describe('duplicate delivery (by id; the mock contract treats ids as unique)', () => {
  it('SSE → SSE: one event, first arrival facts kept, no conflict issue', async () => {
    const { adapter, clock, emit } = await streamed();
    clock.now = T0 + 1000;
    emit(wire('dup', T0 + 500));
    clock.now = T0 + 2000;
    emit(wire('dup', T0 + 500));
    const s = adapter.getSnapshot();
    expect(s.events.filter((e) => e.id === 'dup')).toHaveLength(1);
    expect(s.events.find((e) => e.id === 'dup')!.receivedAt).toBe(iso(T0 + 1000));
    expect(s.quality.issues.some((i) => /Conflicting/.test(i.message))).toBe(false);
  });

  it('REST → REST: a duplicate id within one listing is dropped and reported', async () => {
    const { adapter, backend } = restTestAdapter();
    listing(backend.data).push(wire('twice', T0), wire('twice', T0));
    await adapter.connect();
    const s = adapter.getSnapshot();
    expect(s.events.filter((e) => e.id === 'twice')).toHaveLength(1);
    const issue = s.quality.issues.find((i) => i.source === 'events twice')!;
    expect(issue.message).toMatch(/duplicate delivery/);
    // P7-D5: one duplicate record never makes the whole events resource UNAVAILABLE.
    expect(resourceUnavailable(s, 'events')).toBe(false);
    expect(classifyIssue(issue)).toBe('duplicate-delivery');
  });

  it('REST → REST across re-syncs: the event is not counted again', async () => {
    const { adapter, backend, clock } = restTestAdapter();
    listing(backend.data).push(wire('again', T0));
    await adapter.connect();
    clock.now += 5000;
    await adapter.refresh();
    const s = adapter.getSnapshot();
    expect(s.events.filter((e) => e.id === 'again')).toHaveLength(1);
    expect(s.events.find((e) => e.id === 'again')!.receivedAt).toBe(iso(T0));
  });

  it('REST → SSE: the stream copy is ignored; ingest path stays POLL', async () => {
    const { adapter, backend, clock, emit } = await (async () => {
      FakeEventSource.reset();
      const t = restStreamTestAdapter();
      listing(t.backend.data).push(wire('both', T0 - 1000));
      await t.adapter.connect();
      FakeEventSource.latest().open();
      return { ...t, emit: (e: Rec) => FakeEventSource.latest().emit('forge', JSON.stringify(e)) };
    })();
    void backend;
    clock.now = T0 + 5000;
    emit(wire('both', T0 - 1000));
    const e = adapter.getSnapshot().events.filter((x) => x.id === 'both');
    expect(e).toHaveLength(1);
    expect(e[0]!.via).toBe('poll');
  });

  it('SSE → REST: the listing copy is ignored; ingest path stays STREAM', async () => {
    const { adapter, backend, clock, emit } = await streamed();
    clock.now = T0 + 1000;
    emit(wire('sse-first', T0 + 500));
    listing(backend.data).push(wire('sse-first', T0 + 500));
    clock.now = T0 + 70_000;
    await adapter.refresh();
    const e = adapter.getSnapshot().events.filter((x) => x.id === 'sse-first');
    expect(e).toHaveLength(1);
    expect(e[0]!.via).toBe('stream');
    expect(e[0]!.receivedAt).toBe(iso(T0 + 1000));
  });
});

describe('same id, conflicting content (P7-D2)', () => {
  it('a listing cannot rewrite an observed event; the conflict is a data-quality issue', async () => {
    const { adapter, backend, clock, emit } = await streamed();
    clock.now = T0 + 1000;
    emit(wire('conflict', T0 + 500, 'AN-0142'));
    listing(backend.data).push(wire('conflict', T0 - 99_000, 'AN-0141'));
    clock.now = T0 + 70_000;
    await adapter.refresh();
    const s = adapter.getSnapshot();
    const e = s.events.filter((x) => x.id === 'conflict');
    expect(e).toHaveLength(1);
    expect(e[0]!.missionId).toBe('AN-0142');
    expect(e[0]!.at).toBe(iso(T0 + 500));
    expect(
      s.quality.issues.some(
        (i) => i.source === 'events' && /Conflicting content.*"conflict"/.test(i.message),
      ),
    ).toBe(true);
  });

  it('a second stream message with the same id and other facts is reported, not applied', async () => {
    const { adapter, clock, emit } = await streamed();
    clock.now = T0 + 1000;
    emit(wire('conflict-s', T0 + 500, 'AN-0142'));
    emit(wire('conflict-s', T0 + 900, 'AN-0141'));
    const s = adapter.getSnapshot();
    expect(s.events.filter((x) => x.id === 'conflict-s')[0]!.missionId).toBe('AN-0142');
    expect(s.quality.issues.some((i) => /Conflicting content.*"conflict-s"/.test(i.message))).toBe(
      true,
    );
  });
});

describe('event-history gaps (P7-D3)', () => {
  it('a listing that shares no event with the previous one records a gap and an issue', async () => {
    const { adapter, backend, clock } = restTestAdapter();
    await adapter.connect();
    expect(adapter.getSnapshot().quality.eventHistoryGapAt).toBeUndefined();
    // The source window moved past everything listed before.
    (backend.data.events as { events: Rec[] }).events = [wire('w1', T0 + 1), wire('w2', T0 + 2)];
    clock.now = T0 + 5000;
    await adapter.refresh();
    const s = adapter.getSnapshot();
    expect(s.quality.eventHistoryGapAt).toBe(iso(T0 + 5000));
    expect(s.quality.issues.some((i) => /Event history gap/.test(i.message))).toBe(true);
  });

  it('an overlapping listing is not a gap', async () => {
    const { adapter, backend, clock } = restTestAdapter();
    await adapter.connect();
    const ev = listing(backend.data);
    (backend.data.events as { events: Rec[] }).events = [...ev.slice(-2), wire('n', T0 + 3)];
    clock.now = T0 + 5000;
    await adapter.refresh();
    expect(adapter.getSnapshot().quality.eventHistoryGapAt).toBeUndefined();
  });

  it('a gap after a mission checkpoint makes its event coverage non-exact even though the checkpoint event is retained', async () => {
    const { adapter, backend, clock } = restTestAdapter();
    await adapter.connect();
    const s0 = adapter.getSnapshot();
    const cp = createMissionCheckpoint(s0, 'AN-0142', LIVE, iso(T0));
    (backend.data.events as { events: Rec[] }).events = [wire('after-gap', T0 + 10)];
    clock.now = T0 + 5000;
    await adapter.refresh();
    const s1 = adapter.getSnapshot();
    // The checkpoint's newest event is still retained locally (observed before)…
    expect(s1.events.some((e) => e.id === cp.events!.newestId)).toBe(true);
    // …but continuity is broken: never EXACT.
    const d = computeMissionDigest(s1, 'AN-0142', cp, LIVE);
    expect(d.events.state).not.toBe('exact');
    expect(d.events.reason).toBe('history-gap');
    expect(d.events.count).toBe(1); // observed: a floor, not an exact count
  });
});

describe('coverage helpers', () => {
  const events = [ev('a', T0), ev('b', T0 + 1)];
  const wm = { ids: ['a'], newestAt: iso(T0), newestId: 'a' };
  it('gap since checkpoint: lower bound when something new was observed', () => {
    const c = eventCoverage(events, wm, true, true, true);
    expect(c.state).toBe('lower-bound');
    expect(c.reason).toBe('history-gap');
  });
  it('gap since checkpoint and nothing new: UNKNOWN, never zero', () => {
    const c = eventCoverage([ev('a', T0)], wm, true, true, true);
    expect(c.state).toBe('unknown');
    expect(c.count).toBeNull();
  });
  it('historyGapSince compares dashboard times only, and an unreadable checkpoint time cannot rule a gap out', () => {
    expect(historyGapSince({ eventHistoryGapAt: iso(T0 + 1) }, iso(T0))).toBe(true);
    expect(historyGapSince({ eventHistoryGapAt: iso(T0 - 1) }, iso(T0))).toBe(false);
    expect(historyGapSince({}, iso(T0))).toBe(false);
    expect(historyGapSince({ eventHistoryGapAt: iso(T0) }, 'garbage')).toBe(true);
  });
});

describe('inspector classification is by adapter code, never by message text', () => {
  it('conflict and gap issues carry codes and classify as their own dimensions', async () => {
    const { adapter, backend, clock, emit } = await streamed();
    clock.now = T0 + 1000;
    emit(wire('c', T0 + 500, 'AN-0142'));
    emit(wire('c', T0 + 600, 'AN-0142'));
    (backend.data.events as { events: Rec[] }).events = [wire('w', T0 + 9)];
    clock.now = T0 + 70_000;
    await adapter.refresh();
    const classes = adapter.getSnapshot().quality.issues.map(classifyIssue);
    expect(classes).toContain('event-conflict');
    expect(classes).toContain('history-gap');
    // Same text without a code is not promoted to either class.
    expect(
      classifyIssue({
        id: 'x',
        severity: 'warning',
        source: 'events',
        message: 'Event history gap: spoofed by a backend message',
        at: iso(T0),
      }),
    ).toBe('record-repaired');
  });
});
