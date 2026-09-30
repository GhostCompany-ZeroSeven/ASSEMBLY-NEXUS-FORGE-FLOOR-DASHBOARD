import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { selectAttentionQueue } from './attention';
import { selectBrief } from './brief';
import {
  CHECKPOINT_VERSION,
  MAX_CHECKPOINT_ENTRIES,
  createCheckpoint,
  parseCheckpoint,
  type Checkpoint,
} from './checkpoint';
import { computeDigest, DIGEST_CATEGORIES, MAX_DIGEST_ITEMS } from './digest';
import type { DashboardEvent } from './events';
import { selectFreshness } from './freshness';
import type { DashboardSnapshot } from './snapshot';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const seed = () => buildSeedSnapshot(NOW);
const FOUNDER = 'Founder #0007';

function unavailable(s: DashboardSnapshot, ...resources: string[]): DashboardSnapshot {
  return {
    ...s,
    quality: {
      ...s.quality,
      partial: true,
      issues: resources.map((r, i) => ({
        id: `i${i}`,
        severity: 'error' as const,
        source: r,
        message: `${r} failed`,
        at: iso(0),
      })),
    },
  };
}

/** A checkpoint of the seed taken one hour ago. */
const baseline = (s = seed(), at = iso(-60 * 60_000)) => createCheckpoint(s, at);

describe('checkpoint', () => {
  it('stores ids and enum states only; unavailable resources are ABSENT, not empty', () => {
    const cp = createCheckpoint(unavailable(seed(), 'approvals'), iso(0));
    expect(cp.missions?.['AN-0142']).toBeDefined();
    expect(cp.approvals).toBeUndefined();
    expect(JSON.stringify(cp)).not.toMatch(/Founder|authority/i);
  });

  it('round-trips through JSON', () => {
    const cp = baseline();
    expect(parseCheckpoint(JSON.parse(JSON.stringify(cp)), NOW)).toEqual(
      JSON.parse(JSON.stringify(cp)),
    );
  });

  it.each([
    ['null', null],
    ['array', []],
    ['older version (v1)', { ...baseline(), v: 1 }],
    ['newer version', { ...baseline(), v: 99 }],
    ['bad time', { ...baseline(), at: 'yesterday' }],
    ['future time', { ...baseline(), at: iso(10 * 60_000) }],
    ['unknown mode', { ...baseline(), mode: 'godmode' }],
    ['unknown mission status', { ...baseline(), missions: { 'AN-1': 'APPROVED_BY_FOUNDER' } }],
    ['non-string worker state', { ...baseline(), workers: { 'w-1': 3 } }],
    ['map as array', { ...baseline(), approvals: ['PENDING'] }],
    ['artifacts not strings', { ...baseline(), artifacts: [1, 2] }],
    [
      'oversized map',
      {
        ...baseline(),
        workers: Object.fromEntries(
          Array.from({ length: MAX_CHECKPOINT_ENTRIES + 1 }, (_, i) => [`w${i}`, 'IDLE']),
        ),
      },
    ],
  ])('rejects a malformed checkpoint as a whole (%s)', (_name, raw) => {
    expect(parseCheckpoint(raw, NOW)).toBeNull();
  });

  it('drops unknown fields (a stored "authority" can never be read back)', () => {
    const cp = parseCheckpoint({ ...baseline(), authority: FOUNDER, approvedBy: FOUNDER }, NOW)!;
    expect(cp).not.toBeNull();
    expect(Object.keys(cp)).not.toContain('authority');
    expect(Object.keys(cp)).not.toContain('approvedBy');
  });

  it('parsed maps have no prototype (ids like "__proto__" or "constructor" are plain keys)', () => {
    const cp = parseCheckpoint(
      JSON.parse(
        `{"v":${CHECKPOINT_VERSION},"at":"${iso(0)}","adapterId":"demo","mode":"demo","missions":{"__proto__":"ACTIVE","constructor":"QUEUED"}}`,
      ),
      NOW,
    )!;
    expect(Object.getPrototypeOf(cp.missions)).toBeNull();
    expect(cp.missions!['constructor']).toBe('QUEUED');
  });
});

describe('change digest', () => {
  it('no checkpoint → every category UNKNOWN (not zero)', () => {
    const d = computeDigest(seed(), null);
    expect(d.baseline).toBe('none');
    for (const c of DIGEST_CATEGORIES) {
      expect(d.counts[c]).toBeNull();
      expect(d.unknown[c]).toBe('no-baseline');
    }
    expect(d.items).toEqual([]);
  });

  it('a checkpoint from another data source is not compared', () => {
    const cp: Checkpoint = { ...baseline(), adapterId: 'rest', mode: 'live' };
    const d = computeDigest(seed(), cp);
    expect(d.baseline).toBe('different-source');
    expect(d.sourceThen).toBe('live');
    expect(DIGEST_CATEGORIES.every((c) => d.counts[c] === null)).toBe(true);
  });

  it('identical data → every category is a known zero ("nothing changed" is earned)', () => {
    const s = seed();
    const d = computeDigest(s, createCheckpoint(s, iso(1000)));
    expect(d.baseline).toBe('ok');
    expect(DIGEST_CATEGORIES.every((c) => d.counts[c] === 0)).toBe(true);
  });

  it('reports observed changes, each linked to its record', () => {
    const before = seed();
    const cp = createCheckpoint(before, iso(-60_000));
    const now = seed();
    now.missions = now.missions.map((m) =>
      m.id === 'AN-0142'
        ? { ...m, status: 'COMPLETE' as const }
        : m.id === 'AN-0143'
          ? { ...m, status: 'UNKNOWN' as const }
          : m,
    );
    now.approvals = now.approvals.map((a) =>
      a.id === 'APR-031' ? { ...a, status: 'APPROVED' as const } : a,
    );
    now.workers = now.workers.filter((w) => w.id !== 'w-rook');
    const d = computeDigest(now, cp);
    expect(d.counts.missionsCompleted).toBe(1);
    expect(d.counts.statusBecameUnknown).toBe(1);
    expect(d.counts.approvalsResolved).toBe(1);
    expect(d.counts.noLongerReported).toBe(1);
    const gone = d.items.find((i) => i.category === 'noLongerReported')!;
    expect(gone).toMatchObject({ entity: 'worker', id: 'w-rook', href: '#/workers/w-rook' });
    const resolved = d.items.find((i) => i.category === 'approvalsResolved')!;
    expect(resolved).toMatchObject({ from: 'PENDING', to: 'APPROVED' });
    expect(resolved.href).toBe('#/approvals?focus=APR-031');
    // Founder-relevant categories lead the list.
    expect(d.items[0]!.category).toBe('approvalsResolved');
  });

  it('a resource unavailable NOW makes its categories UNKNOWN, never zero', () => {
    const cp = baseline();
    const d = computeDigest(unavailable(seed(), 'approvals', 'workers'), cp);
    expect(d.counts.approvalsNew).toBeNull();
    expect(d.unknown.approvalsNew).toBe('unavailable-now');
    expect(d.counts.workersChanged).toBeNull();
    // Shared categories cannot be complete either.
    expect(d.counts.noLongerReported).toBeNull();
    expect(d.counts.statusBecameUnknown).toBeNull();
    // Unaffected categories stay known.
    expect(d.counts.missionsNew).toBe(0);
  });

  it('a resource unavailable THEN makes its categories UNKNOWN', () => {
    const cp = createCheckpoint(unavailable(seed(), 'missions'), iso(-60_000));
    const d = computeDigest(seed(), cp);
    expect(d.counts.missionsNew).toBeNull();
    expect(d.unknown.missionsNew).toBe('unavailable-then');
    expect(d.counts.artifactsNew).toBeNull();
  });

  it('a truncated checkpoint cannot prove "no change"', () => {
    const d = computeDigest(seed(), { ...baseline(), truncated: true });
    expect(d.counts.missionsNew).toBeNull();
    expect(d.unknown.missionsNew).toBe('baseline-truncated');
  });

  it('events: newly observed by identity; exact only while the checkpoint newest event is retained', () => {
    const s = seed();
    const ev = (id: string, at: string): DashboardEvent => ({
      id,
      kind: 'task.completed',
      at,
      payload: { taskId: 't' },
    });
    s.events = [ev('a', iso(-2 * 3600_000)), ev('b', iso(-10_000))];
    const cp = createCheckpoint(s, iso(-60_000));
    // Retained history still holds `b` (the newest seen) → exact; duplicates count once.
    const now = { ...s, events: [...s.events, ev('c', iso(-5_000)), ev('c', iso(-5_000))] };
    const d0 = computeDigest(now, cp);
    expect(d0.counts.events).toBe(1);
    expect(d0.eventCoverage).toBe('exact');
    // `b` has been dropped from the retained window → at least 2, never "exactly 2".
    const t = { ...s, events: [ev('c', iso(-30_000)), ev('d', iso(-20_000))] };
    const d = computeDigest(t, cp);
    expect(d.counts.events).toBeNull();
    expect(d.eventCoverage).toBe('lower-bound');
    expect(d.unknown.events).toBe('history-truncated');
    expect(d.eventsObserved).toBe(2);
    // Empty history proves nothing either.
    const e = computeDigest({ ...s, events: [] }, cp);
    expect(e.counts.events).toBeNull();
    expect(e.eventCoverage).toBe('unknown');
  });

  it('event coverage never compares the source clock with the browser clock', () => {
    // Source clock 3 hours BEHIND the browser: every event looks older than the
    // checkpoint's browser time. Phase 5 counted 0 new events (falsely exact).
    const s = seed();
    const ev = (id: string, at: string): DashboardEvent => ({
      id,
      kind: 'task.completed',
      at,
      payload: { taskId: 't' },
    });
    s.events = [ev('a', iso(-4 * 3600_000))];
    const cp = createCheckpoint(s, iso(0));
    const now = { ...s, events: [...s.events, ev('b', iso(-3 * 3600_000))] };
    expect(computeDigest(now, cp).counts.events).toBe(1);
  });

  it('an old event that ARRIVED late is newly observed (counted once, timeline marks it late)', () => {
    const s = seed();
    const cp = createCheckpoint(s, iso(-60_000));
    const late: DashboardEvent = {
      id: 'late',
      kind: 'task.completed',
      at: iso(-3 * 3600_000),
      receivedAt: iso(0),
      payload: { taskId: 't' },
    };
    const d = computeDigest({ ...s, events: [...s.events, late, late] }, cp);
    expect(d.counts.events).toBe(1);
  });

  it('record ids that collide with Object.prototype are compared as data', () => {
    const s = seed();
    s.missions = [{ ...s.missions[0]!, id: 'constructor' }];
    const cp = createCheckpoint({ ...s, missions: [] }, iso(-60_000));
    const d = computeDigest(s, cp);
    expect(d.counts.missionsNew).toBe(1);
  });

  it('large histories: item list is capped, counts stay exact', () => {
    const s = seed();
    const cp = createCheckpoint({ ...s, missions: [] }, iso(-60_000));
    const many = Array.from({ length: 400 }, (_, i) => ({ ...s.missions[0]!, id: `M-${i}` }));
    const d = computeDigest({ ...s, missions: many }, cp);
    expect(d.counts.missionsNew).toBe(400);
    expect(d.items.length).toBe(MAX_DIGEST_ITEMS);
    expect(d.moreItems).toBeGreaterThan(0);
  });
});

describe('Founder attention queue', () => {
  const fresh = (s: DashboardSnapshot) => selectFreshness(s, 'connected', NOW);

  it('lists open gates for the human authority and human-action alerts, with sources and targets', () => {
    const s = seed();
    const q = selectAttentionQueue(s, FOUNDER, fresh(s));
    expect(q.complete).toBe(true);
    const keys = q.items.map((i) => i.key);
    expect(keys).toContain('approval:APR-031');
    expect(keys).toContain('alert:ALR-008');
    const gate = q.items.find((i) => i.key === 'approval:APR-031')!;
    expect(gate).toMatchObject({ source: 'approval', reason: 'gate-open', state: 'PENDING' });
    expect(gate.href).toBe('#/approvals?focus=APR-031');
    // Only relationships present in the data.
    expect(gate.related.map((r) => r.id)).toContain('w-cyrus');
    expect(q.count).toBe(q.items.filter((i) => i.source !== 'data').length);
  });

  it('does not infer attention from severity alone', () => {
    const s = seed();
    s.alerts = s.alerts.map((a) => ({
      ...a,
      severity: 'CRITICAL' as const,
      humanActionRequired: false,
    }));
    const q = selectAttentionQueue(s, FOUNDER, fresh(s));
    expect(q.items.some((i) => i.source === 'alert')).toBe(false);
  });

  it('a gate for another human authority is not Founder attention; a worker-authority gate is flagged undecidable', () => {
    const s = seed();
    s.approvals = s.approvals.map((a) =>
      a.id === 'APR-031' ? { ...a, requiredAuthority: 'Security Officer' } : a,
    );
    expect(selectAttentionQueue(s, FOUNDER, fresh(s)).items.some((i) => i.id === 'APR-031')).toBe(
      false,
    );
    s.approvals = s.approvals.map((a) =>
      a.id === 'APR-031' ? { ...a, requiredAuthority: 'w-cyrus' } : a,
    );
    const item = selectAttentionQueue(s, FOUNDER, fresh(s)).items.find((i) => i.id === 'APR-031');
    expect(item?.reason).toBe('gate-undecidable');
  });

  it('UNKNOWN gate status is surfaced, not hidden', () => {
    const s = seed();
    s.approvals = s.approvals.map((a) =>
      a.id === 'APR-030' ? { ...a, status: 'UNKNOWN' as const } : a,
    );
    const item = selectAttentionQueue(s, FOUNDER, fresh(s)).items.find((i) => i.id === 'APR-030');
    expect(item?.reason).toBe('gate-status-unknown');
  });

  it('unavailable approvals → queue INCOMPLETE and count UNKNOWN (null), never zero', () => {
    const s = unavailable({ ...seed(), approvals: [], alerts: [] }, 'approvals');
    const q = selectAttentionQueue(s, FOUNDER, fresh(s));
    expect(q.complete).toBe(false);
    expect(q.count).toBeNull();
    expect(q.items[0]).toMatchObject({ reason: 'data-unavailable', id: 'approvals' });
  });

  it('items shown from stale or disconnected data carry a freshness warning', () => {
    const s = seed();
    const q = selectAttentionQueue(s, FOUNDER, {
      source: 'DISCONNECTED',
      qualifiers: ['LAST_KNOWN'],
      unknownResources: [],
      complete: false,
    });
    expect(q.items[0]).toMatchObject({ reason: 'data-not-current', state: 'DISCONNECTED' });
  });
});

describe('Founder brief', () => {
  it('missing information is UNKNOWN, never zero ("Blocked: UNKNOWN")', () => {
    const s = unavailable(seed(), 'workers');
    const f = selectFreshness(s, 'connected', NOW);
    const d = computeDigest(s, null);
    const b = selectBrief(s, f, d, selectAttentionQueue(s, FOUNDER, f));
    expect(b.figures.blocked.value).toBeNull();
    expect(b.figures.blocked.missing).toEqual(['workers']);
    expect(b.figures.failed.value).toBeNull();
    expect(b.figures.running.value).not.toBeNull();
    expect(b.figures.newSinceLastView.value).toBeNull();
    expect(b.problems).toContainEqual({ kind: 'unavailable', resource: 'workers' });
  });

  it('known values are counts from the data', () => {
    const s = seed();
    const f = selectFreshness(s, 'connected', NOW);
    const d = computeDigest(s, createCheckpoint(s, iso(0)));
    const b = selectBrief(s, f, d, selectAttentionQueue(s, FOUNDER, f));
    expect(b.figures.failed.value).toBe(
      s.missions.filter((m) => m.status === 'FAILED').length +
        s.workers.filter((w) => w.state === 'FAILED').length,
    );
    expect(b.figures.newSinceLastView.value).toBe(0);
    expect(b.problems).toEqual([]);
  });
});
