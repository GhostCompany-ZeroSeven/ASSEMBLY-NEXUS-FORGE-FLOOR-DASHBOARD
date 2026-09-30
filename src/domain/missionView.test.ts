import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { selectAttentionQueue } from './attention';
import { explainAttention } from './attentionExplain';
import { classifyIssue, selectDataQuality } from './dataQuality';
import type { DashboardEvent } from './events';
import { createWatermark, eventCoverage, MAX_WATERMARK_IDS, parseWatermark } from './eventCoverage';
import { selectFreshness, type Freshness } from './freshness';
import {
  MISSION_VIEW_VERSION,
  computeMissionDigest,
  createMissionCheckpoint,
  parseMissionCheckpoint,
} from './missionView';
import type { DashboardSnapshot } from './snapshot';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const iso = (off = 0) => new Date(NOW + off).toISOString();
const FOUNDER = 'Founder #0007';
const M = 'AN-0142';
const SIM: Freshness = {
  source: 'SIMULATED',
  qualifiers: [],
  unknownResources: [],
  complete: false,
};
const seed = () => buildSeedSnapshot(NOW);
const ev = (id: string, at: string, missionId = M): DashboardEvent => ({
  id,
  kind: 'task.completed',
  at,
  missionId,
  payload: { taskId: 't' },
});
function down(s: DashboardSnapshot, ...resources: string[]): DashboardSnapshot {
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
        at: iso(),
      })),
    },
  };
}
const cpOf = (s: DashboardSnapshot, at = iso(-60_000), f: Freshness = SIM) =>
  createMissionCheckpoint(s, M, f, at);
const roundTrip = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe('event coverage', () => {
  it('exact while the checkpoint newest event is still retained', () => {
    const then = [ev('a', iso(-100)), ev('b', iso(-50))];
    const wm = createWatermark(then);
    const c = eventCoverage([...then, ev('c', iso(-10))], wm, true);
    expect(c).toMatchObject({ state: 'exact', count: 1, observedNew: 1 });
    expect([...c.newIds]).toEqual(['c']);
  });

  it('lower bound when the retained window moved past the checkpoint; unknown when nothing new', () => {
    const wm = createWatermark([ev('a', iso(-100)), ev('b', iso(-50))]);
    expect(eventCoverage([ev('c', iso(-10))], wm, true)).toMatchObject({
      state: 'lower-bound',
      count: 1,
    });
    expect(eventCoverage([], wm, true)).toMatchObject({ state: 'unknown', count: null });
  });

  it('opaque ids: lexical order is never read as chronology', () => {
    // "z-1" sorts after "a-9" but happened first; only identity matters.
    const wm = createWatermark([ev('z-1', iso(-100))]);
    const c = eventCoverage([ev('z-1', iso(-100)), ev('a-9', iso(-10))], wm, true);
    expect(c).toMatchObject({ state: 'exact', count: 1 });
  });

  it('unavailable now or then is UNKNOWN; no baseline is NOT APPLICABLE', () => {
    const wm = createWatermark([ev('a', iso(-100))]);
    expect(eventCoverage([], wm, false)).toMatchObject({
      state: 'unknown',
      reason: 'events-unavailable-now',
    });
    expect(eventCoverage([ev('a', iso())], undefined, true)).toMatchObject({
      state: 'unknown',
      reason: 'events-unavailable-then',
    });
    expect(eventCoverage([], undefined, true, false).state).toBe('not-applicable');
  });

  it('a truncated watermark can never prove exact coverage', () => {
    const many = Array.from({ length: MAX_WATERMARK_IDS + 5 }, (_, i) => ev(`e${i}`, iso(i)));
    const wm = createWatermark(many);
    expect(wm.truncated).toBe(true);
    expect(eventCoverage([...many, ev('new', iso(99_999))], wm, true).state).toBe('lower-bound');
  });

  it.each([
    ['not an object', 'x'],
    ['ids not array', { ids: 'a' }],
    ['empty id', { ids: [''] }],
    ['bad time', { ids: ['a'], newestAt: 'later' }],
    ['too many ids', { ids: Array.from({ length: MAX_WATERMARK_IDS + 1 }, (_, i) => `e${i}`) }],
  ])('rejects a malformed stored watermark (%s)', (_n, raw) => {
    expect(() => parseWatermark(raw)).toThrow();
  });
});

describe('mission checkpoint', () => {
  it('records ids and enum states for ONE mission only; no labels, no authority', () => {
    const cp = cpOf(seed());
    expect(cp.missionId).toBe(M);
    expect(cp.status).toBeDefined();
    const json = JSON.stringify(cp);
    expect(json).not.toMatch(/Founder|authority|title/i);
  });

  it('round-trips through storage', () => {
    const cp = cpOf(seed());
    expect(parseMissionCheckpoint(roundTrip(cp), M, NOW)).toEqual(roundTrip(cp));
  });

  it.each([
    ['other mission', (c: Record<string, unknown>) => ({ ...c, missionId: 'AN-9999' })],
    [
      'older/newer version',
      (c: Record<string, unknown>) => ({ ...c, v: MISSION_VIEW_VERSION + 1 }),
    ],
    ['future-dated', (c: Record<string, unknown>) => ({ ...c, at: iso(10 * 60_000) })],
    ['bad status', (c: Record<string, unknown>) => ({ ...c, status: 'APPROVED_BY_FOUNDER' })],
    ['bad worker state', (c: Record<string, unknown>) => ({ ...c, workers: { 'w-ada': 'GOD' } })],
    [
      'oversized related list',
      (c: Record<string, unknown>) => ({
        ...c,
        artifacts: Array.from({ length: 201 }, (_, i) => `a${i}`),
      }),
    ],
    ['bad quality', (c: Record<string, unknown>) => ({ ...c, quality: { unavailable: ['disk'] } })],
    ['not an object', () => 42],
  ])('rejects a malformed stored mission checkpoint (%s)', (_n, mutate) => {
    const raw = mutate(roundTrip(cpOf(seed())) as Record<string, unknown>);
    expect(parseMissionCheckpoint(raw, M, NOW)).toBeNull();
  });
});

describe('mission digest', () => {
  it('no mission checkpoint: every area UNKNOWN and "changed" cannot be said (A01)', () => {
    const d = computeMissionDigest(seed(), M, null, SIM);
    expect(d.baseline).toBe('none');
    expect(d.changed).toBeNull();
    expect(d.events.state).toBe('not-applicable');
    expect(Object.keys(d.unknown).sort()).toEqual(
      ['alerts', 'approvals', 'artifacts', 'events', 'status', 'workers'].sort(),
    );
  });

  it('a checkpoint from a different source is not compared (A03)', () => {
    const cp = { ...cpOf(seed()), adapterId: 'replay-feed', mode: 'replay' as const };
    const d = computeMissionDigest(seed(), M, cp, SIM);
    expect(d.baseline).toBe('different-source');
    expect(d.changes).toEqual([]);
    expect(d.changed).toBeNull();
  });

  it('nothing changed is said only when every area was comparable with exact event coverage', () => {
    const s = seed();
    const d = computeMissionDigest(s, M, cpOf(s), SIM);
    expect(d.changes).toEqual([]);
    // Seed precondition: this mission has retained events, so coverage can be exact.
    expect(s.events.some((e) => e.missionId === M)).toBe(true);
    expect(d.events.state).toBe('exact');
    expect(d.changed).toBe(false);
  });

  it('proves status, assignment, worker, gate, alert, artifact, result and event changes', () => {
    const before = seed();
    const cp = cpOf(before);
    const s = seed();
    const mission = s.missions.find((m) => m.id === M)!;
    const [kept, dropped] = mission.assignedWorkerIds;
    s.missions = s.missions.map((m) =>
      m.id === M
        ? {
            ...m,
            status: 'COMPLETE' as const,
            result: { outcome: 'SUCCESS' as const, summary: 'done' },
            assignedWorkerIds: [kept!, 'w-rook'].filter(Boolean),
            artifacts: [...m.artifacts, { ...m.artifacts[0]!, id: 'art-new' }],
            approvalIds: [...m.approvalIds, 'APR-030'],
          }
        : m,
    );
    s.workers = s.workers.map((w) => (w.id === kept ? { ...w, state: 'IDLE' as const } : w));
    s.alerts = [
      ...s.alerts,
      {
        ...s.alerts[0]!,
        id: 'ALR-NEW',
        resolvedAt: undefined,
        acknowledgedAt: undefined,
        affected: [{ kind: 'mission' as const, id: M, label: M }],
      },
    ];
    s.events = [...s.events, ev('evt-new', iso())];
    const d = computeMissionDigest(s, M, cp, SIM);
    const kinds = d.changes.map((c) => c.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'status',
        'resultAppeared',
        'assigned',
        'artifactNew',
        'approvalLinked',
        'alertOpened',
      ]),
    );
    expect(dropped).toBeDefined(); // seed precondition: two assigned workers
    expect(kinds).toContain('unassigned');
    expect(d.changes.find((c) => c.kind === 'status')).toMatchObject({ to: 'COMPLETE' });
    expect(d.events.observedNew).toBe(1);
    expect(d.changed).toBe(true);
  });

  it('a mission no longer reported is said so, never "deleted" or "completed" (A06)', () => {
    const s = seed();
    const cp = cpOf(s);
    const gone = { ...s, missions: s.missions.filter((m) => m.id !== M) };
    const d = computeMissionDigest(gone, M, cp, SIM);
    expect(d.changes.map((c) => c.kind)).toContain('missionNoLongerReported');
    expect(d.unknown.status).toBe('mission-not-reported');
    expect(JSON.stringify(d)).not.toMatch(/deleted|COMPLETE"/);
  });

  it('a mission that reappears is "reported again", not recovered execution (A07)', () => {
    const s = seed();
    const cp = cpOf({ ...s, missions: s.missions.filter((m) => m.id !== M) });
    const d = computeMissionDigest(s, M, cp, SIM);
    expect(d.changes.map((c) => c.kind)).toContain('missionReappeared');
    expect(d.unknown.status).toBe('mission-not-reported');
  });

  it('complete then, partial now: dependent areas UNKNOWN, independent ones exact (A08)', () => {
    const s = seed();
    const cp = cpOf(s);
    const d = computeMissionDigest(down(s, 'workers'), M, cp, SIM);
    expect(d.unknown.workers).toBe('unavailable-now');
    expect(d.unknown.status).toBeUndefined();
    expect(d.changes.map((c) => c.kind)).toContain('dataBecameUnavailable');
    expect(d.changed).toBe(true); // the data change itself is a proven change
  });

  it('partial then, complete now: missing values are not fabricated (A09)', () => {
    const s = seed();
    const cp = cpOf(down(s, 'approvals', 'events'));
    const d = computeMissionDigest(s, M, cp, SIM);
    expect(d.unknown.approvals).toBe('unavailable-then');
    expect(d.unknown.events).toBe('unavailable-then');
    expect(d.changes.filter((c) => c.kind.startsWith('approval'))).toEqual([]);
    expect(d.changes.map((c) => c.kind)).toContain('dataRecovered');
  });

  it('a worker that disappears is "no longer reported", and reappears as "reported again"', () => {
    const s = seed();
    const w = s.missions.find((m) => m.id === M)!.assignedWorkerIds[0]!;
    const cp = cpOf(s);
    const gone = { ...s, workers: s.workers.filter((x) => x.id !== w) };
    expect(computeMissionDigest(gone, M, cp, SIM).changes).toContainEqual(
      expect.objectContaining({ kind: 'workerNoLongerReported', id: w }),
    );
    const cp2 = cpOf(gone);
    expect(computeMissionDigest(s, M, cp2, SIM).changes).toContainEqual(
      expect.objectContaining({ kind: 'workerReappeared', id: w }),
    );
  });

  it('renamed labels are not changes; freshness changes are', () => {
    const s = seed();
    const cp = cpOf(s);
    const renamed = { ...s, missions: s.missions.map((m) => ({ ...m, title: `${m.title} v2` })) };
    expect(computeMissionDigest(renamed, M, cp, SIM).changes).toEqual([]);
    const stale: Freshness = {
      source: 'LIVE',
      qualifiers: ['STALE'],
      unknownResources: [],
      complete: false,
    };
    expect(computeMissionDigest(s, M, cp, stale).changes).toContainEqual(
      expect.objectContaining({ kind: 'freshnessChanged', from: 'SIMULATED', to: 'LIVE+STALE' }),
    );
  });

  it('snapshot equality with uncovered history says "cannot say", not "no change" (reversion)', () => {
    const s = seed();
    s.events = [ev('a', iso(-100))];
    const cp = cpOf(s);
    // Mission status changed and changed back in between; only a new retained
    // window without the checkpoint's newest event is visible.
    const now = { ...s, events: [] };
    const d = computeMissionDigest(now, M, cp, SIM);
    expect(d.changes).toEqual([]);
    expect(d.events.state).toBe('unknown');
    expect(d.changed).toBeNull();
  });
});

describe('attention explanations', () => {
  it('every item states its code, trigger, known/unknown facts, times, freshness and action surface', () => {
    const s = down(seed(), 'workers');
    const f = selectFreshness(s, 'connected', NOW);
    const q = selectAttentionQueue(s, FOUNDER, f);
    const gate = q.items.find((i) => i.id === 'APR-031')!;
    const x = explainAttention(gate, s, f);
    expect(x.code).toBe('PENDING_FOUNDER_GATE');
    expect(x.trigger).toContainEqual({ key: 'requiredAuthority', value: FOUNDER });
    expect(x.unknown).toContain('blocked-workers');
    expect(x.sourceTime).toBe(gate.since);
    expect(x.receivedAt).toBeDefined();
    expect(x.actionSurface).toBe('gate-card');
    const alert = q.items.find((i) => i.source === 'alert')!;
    const ax = explainAttention(alert, s, f);
    expect(ax.code).toBe('ALERT_EXPLICIT_HUMAN_ACTION');
    // Severity is context, never the trigger.
    expect(ax.trigger.map((t) => t.key)).not.toContain('severity');
  });

  it('data items have no action surface', () => {
    const s = down(seed(), 'approvals');
    const f = selectFreshness(s, 'connected', NOW);
    const q = selectAttentionQueue(s, FOUNDER, f);
    const data = q.items.find((i) => i.source === 'data')!;
    expect(explainAttention(data, s, f)).toMatchObject({
      code: 'DATA_UNAVAILABLE_AFFECTS_QUEUE',
      actionSurface: 'none',
      unknown: ['queue-completeness'],
    });
  });
});

describe('data quality dimensions', () => {
  it('reports explicit dimensions (no single score) and classifies issues', () => {
    const s = down(seed(), 'workers');
    s.quality.issues.push(
      {
        id: 'x',
        severity: 'error',
        source: 'missions[3]',
        message: 'Dropped: missing id',
        at: iso(),
      },
      {
        id: 'y',
        severity: 'warning',
        source: 'approvals[0].status',
        message: 'Unrecognised',
        at: iso(),
      },
      { id: 'z', severity: 'warning', source: 'stream', message: 'quiet', at: iso() },
    );
    const f = selectFreshness(s, 'connected', NOW);
    const r = selectDataQuality(s, f, 'connected', NOW);
    expect(r.resources.find((x) => x.name === 'workers')!.available).toBe(false);
    expect(r.resources.find((x) => x.name === 'missions')!.available).toBe(true);
    expect(r.issues.map((i) => i.class)).toEqual([
      'resource-unavailable',
      'record-dropped',
      'record-repaired',
      'transport',
    ]);
    expect(r.history.retained).toBe(s.events.length);
    expect(Object.keys(r)).not.toContain('score');
    expect(
      classifyIssue({ id: 'q', severity: 'error', source: 'weird', message: '', at: iso() }),
    ).toBe('other');
    expect(
      classifyIssue({
        id: 'r',
        severity: 'warning',
        source: 'mission AN-0139.artifact',
        message: '',
        at: iso(),
      }),
    ).toBe('record-repaired');
  });
});
