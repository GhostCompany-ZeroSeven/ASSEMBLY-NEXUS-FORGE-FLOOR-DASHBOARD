import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { ANN_CONTRACT_VERSION, ANN_LIMITS, type AnnErrorCode } from './contract';
import { annMockFeed } from './mockFeed';
import { normalizeAnnFeed, principalKey } from './normalize';

/**
 * ANN dashboard feed v1: contract, normalization and hostile-data matrix.
 * Every case asserts the NORMALIZED TRUTH (and that no unsafe claim is
 * produced), not merely that nothing crashed.
 */

const NOW = Date.parse('2026-09-30T12:00:00Z');
const AUTH = 'Founder #0007';
const MIN = 60_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

type Feed = Record<string, unknown> & {
  missions: Record<string, unknown>[];
  workers: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  health: Record<string, unknown> & { components: Record<string, unknown>[] };
};

const feed = (): Feed => structuredClone(annMockFeed('normal', NOW, AUTH)) as unknown as Feed;

function ok(raw: unknown): DashboardSnapshot {
  const r = normalizeAnnFeed(raw, { now: NOW, humanAuthority: AUTH });
  if (!r.ok) throw new Error(`expected ok, got ${r.error.message}`);
  return r.snapshot;
}
function rejected(raw: unknown): AnnErrorCode {
  const r = normalizeAnnFeed(raw, { now: NOW, humanAuthority: AUTH });
  if (r.ok) throw new Error('expected the feed to be rejected');
  return r.error.code;
}
const mission = (s: DashboardSnapshot, id: string) => s.missions.find((m) => m.id === id);
const approval = (s: DashboardSnapshot, id: string) => s.approvals.find((a) => a.id === id);
const issues = (s: DashboardSnapshot) => s.quality.issues.map((i) => `${i.source}: ${i.message}`);
const unavailable = (s: DashboardSnapshot, r: string) =>
  s.quality.issues.some((i) => i.severity === 'error' && i.source === r);

/** A minimal valid mission record for focused cases. */
const m0 = (over: Record<string, unknown> = {}) => ({
  id: 'm-x',
  title: 'Case mission',
  lifecycle: 'ACTIVE',
  startedAt: iso(-10 * MIN),
  review: { status: 'NOT_REQUESTED' },
  certification: { status: 'PENDING' },
  ...over,
});
const withMissions = (...ms: Record<string, unknown>[]) => ({ ...feed(), missions: ms });
const a0 = (over: Record<string, unknown> = {}) => ({
  id: 'apr-x',
  title: 'Case approval',
  action: 'Do the thing',
  requestedBy: 'ann-w-ada',
  requestedAt: iso(-10 * MIN),
  requiredAuthority: AUTH,
  risk: 'low',
  reversible: true,
  status: 'PENDING',
  ...over,
});
const withApprovals = (...as: Record<string, unknown>[]) => ({ ...feed(), approvals: as });
const decision = (over: Record<string, unknown> = {}) => ({
  decision: 'APPROVE',
  authority: 'FOUNDER',
  decidedBy: AUTH,
  decidedAt: iso(-5 * MIN),
  ...over,
});

describe('the mock feed is a valid, explicitly simulated v1 envelope', () => {
  it('normalizes cleanly and is SIMULATED, never live or verified', () => {
    const s = ok(feed());
    expect(s.provenance).toMatchObject({ mode: 'demo', adapterId: 'ann', verifiedBackend: false });
    expect(s.provenance.environment).toBe('mock');
    expect(s.quality.partial).toBe(false);
    expect(s.missions).toHaveLength(5);
    expect(approval(s, 'ann-apr-030')!.decision!.delivery).toBe('simulated');
  });

  it('covers the required truth cases', () => {
    const s = ok(feed());
    expect(mission(s, 'ann-msn-7f3a')).toMatchObject({ ordinal: 142, status: 'ACTIVE' });
    // completed but uncertified
    expect(mission(s, 'ann-msn-2b88')).toMatchObject({
      status: 'COMPLETE',
      certification: 'PENDING',
    });
    expect(mission(s, 'ann-msn-55d1')!.status).toBe('FAILED');
    // the source reported no ordinal: none is invented
    expect(mission(s, 'ann-msn-e410')!.ordinal).toBeNull();
    expect(approval(s, 'ann-apr-031')!.status).toBe('PENDING');
    expect(approval(s, 'ann-apr-032')).toMatchObject({ risk: 'unknown', reversible: null });
    const w = s.workers.find((x) => x.id === 'ann-w-7c2')!;
    expect(w.state).toBe('UNKNOWN');
    expect(w.role).toBeUndefined();
    expect(s.health.components.map((c) => c.status)).toEqual(['NOMINAL', 'DEGRADED', 'UNKNOWN']);
    expect(s.alerts).toHaveLength(1);
    expect(s.events.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(ok(feed())).toEqual(ok(feed()));
  });
});

describe('hostile envelope matrix (whole feed rejected, never an empty dashboard)', () => {
  it.each<[string, () => unknown, AnnErrorCode]>([
    [
      '1 missing contract version',
      () => ({ ...feed(), contract: undefined }),
      'UNSUPPORTED_CONTRACT',
    ],
    [
      '2 unsupported contract version',
      () => ({ ...feed(), contract: 'assembly-nexus.dashboard-feed.v2' }),
      'UNSUPPORTED_CONTRACT',
    ],
    [
      '2b near-miss version (no fuzzy match)',
      () => ({ ...feed(), contract: 'ASSEMBLY-NEXUS.DASHBOARD-FEED.V1' }),
      'UNSUPPORTED_CONTRACT',
    ],
    ['3 malformed top-level object', () => [feed()], 'MALFORMED_ENVELOPE'],
    ['4 unexpected primitive', () => 'assembly-nexus.dashboard-feed.v1', 'MALFORMED_ENVELOPE'],
    ['4b null', () => null, 'MALFORMED_ENVELOPE'],
    ['5 missing source identity', () => ({ ...feed(), source: undefined }), 'MALFORMED_ENVELOPE'],
    [
      '5b source kind unknown',
      () => ({ ...feed(), source: { id: 'x', kind: 'mainframe' } }),
      'MALFORMED_ENVELOPE',
    ],
    ['6 malformed source mode', () => ({ ...feed(), sourceMode: 'live' }), 'MALFORMED_ENVELOPE'],
    ['6b missing source mode', () => ({ ...feed(), sourceMode: undefined }), 'MALFORMED_ENVELOPE'],
    ['6c source mode UNKNOWN', () => ({ ...feed(), sourceMode: 'UNKNOWN' }), 'SOURCE_MODE_UNKNOWN'],
    ['6d mock declaring LIVE', () => ({ ...feed(), sourceMode: 'LIVE' }), 'CONTRADICTORY_ENVELOPE'],
    [
      '6e Local Demo Simulation declaring LIVE',
      () => ({
        ...feed(),
        sourceMode: 'LIVE',
        source: { id: 'lds', kind: 'local-demo-simulation' },
      }),
      'CONTRADICTORY_ENVELOPE',
    ],
    [
      'missing snapshot identity',
      () => ({ ...feed(), snapshot: { generatedAt: iso(0) } }),
      'MALFORMED_ENVELOPE',
    ],
    [
      'invalid snapshot time',
      () => ({ ...feed(), snapshot: { id: 's', generatedAt: 'yesterday' } }),
      'MALFORMED_ENVELOPE',
    ],
    [
      '20 snapshot time beyond tolerated skew',
      () => ({ ...feed(), snapshot: { id: 's', generatedAt: iso(10 * MIN) } }),
      'MALFORMED_ENVELOPE',
    ],
    [
      '47 oversized mission collection',
      () => ({
        ...feed(),
        missions: Array.from({ length: ANN_LIMITS.missions + 1 }, (_, i) => m0({ id: `m${i}` })),
      }),
      'RESOURCE_LIMIT',
    ],
    [
      '47b oversized health components',
      () => ({
        ...feed(),
        health: {
          status: 'DEGRADED',
          checkedAt: iso(0),
          components: Array.from({ length: ANN_LIMITS.healthComponents + 1 }, (_, i) => ({
            id: `c${i}`,
            status: 'NOMINAL',
          })),
        },
      }),
      'RESOURCE_LIMIT',
    ],
  ])('%s', (_, make, code) => {
    expect(rejected(make())).toBe(code);
  });

  it('a near-boundary large feed is accepted and bounded (no uncontrolled growth)', () => {
    const big = {
      ...feed(),
      missions: Array.from({ length: ANN_LIMITS.missions }, (_, i) =>
        m0({ id: `m${i}`, ordinal: i }),
      ),
      activity: Array.from({ length: 2_000 }, (_, i) => ({
        id: `a${i}`,
        kind: 'work.started',
        at: iso(-i * 1000),
      })),
    };
    const s = ok(big);
    expect(s.missions).toHaveLength(ANN_LIMITS.missions);
    expect(s.events).toHaveLength(ANN_LIMITS.activity);
    // the NEWEST history is kept
    expect(s.events.at(-1)!.id).toBe('a0');
  });

  it('a version is accepted only exactly', () => {
    expect(ok({ ...feed(), contract: ANN_CONTRACT_VERSION }).missions.length).toBeGreaterThan(0);
  });
});

describe('collections: unavailable is not empty', () => {
  it('50 wrong collection types / missing collections are UNAVAILABLE', () => {
    const s = ok({ ...feed(), missions: { not: 'a list' }, alerts: undefined, workers: 'x' });
    expect(unavailable(s, 'missions')).toBe(true);
    expect(unavailable(s, 'alerts')).toBe(true);
    expect(unavailable(s, 'workers')).toBe(true);
    expect(s.quality.partial).toBe(true);
  });

  it('46 empty arrays are a valid, complete empty state', () => {
    const s = ok({ ...feed(), missions: [], workers: [], approvals: [], alerts: [], activity: [] });
    expect(s.quality.partial).toBe(false);
    for (const r of ['missions', 'workers', 'approvals', 'alerts'])
      expect(unavailable(s, r)).toBe(false);
  });

  it('unreadable records make the resource count incomplete (resource-level error)', () => {
    const s = ok(withMissions(m0(), { title: 'no id' }));
    expect(s.missions).toHaveLength(1);
    expect(unavailable(s, 'missions')).toBe(true);
  });
});

describe('mission identity and ordinal', () => {
  it('7 a mission without an id is dropped (never given one)', () => {
    const s = ok(withMissions(m0({ id: undefined })));
    expect(s.missions).toEqual([]);
  });

  it('8 duplicate mission ids: every copy dropped', () => {
    const s = ok(
      withMissions(m0({ id: 'dup', ordinal: 1 }), m0({ id: 'dup', ordinal: 2 }), m0({ id: 'ok' })),
    );
    expect(s.missions.map((m) => m.id)).toEqual(['ok']);
  });

  it('9 duplicate ordinals: both become UNKNOWN, ids kept', () => {
    const s = ok(
      withMissions(
        m0({ id: 'a', ordinal: 7 }),
        m0({ id: 'b', ordinal: 7 }),
        m0({ id: 'c', ordinal: 8 }),
      ),
    );
    expect(s.missions.map((m) => m.ordinal)).toEqual([null, null, 8]);
  });

  it.each([
    ['10 negative', -1],
    ['11 fractional', 1.5],
    ['12 numeric string', '0144'],
    ['13 beyond safe integer', Number.MAX_SAFE_INTEGER + 2],
    ['NaN-like', Number.NaN],
    ['boolean', true],
  ])('%s ordinal is UNKNOWN, never coerced', (_, ordinal) => {
    expect(ok(withMissions(m0({ ordinal }))).missions[0]!.ordinal).toBeNull();
  });

  it('valid ordinals of any width survive exactly (no rollover, no padding in the model)', () => {
    const ords = [0, 1, 139, 9999, 10000, 123456];
    const s = ok(withMissions(...ords.map((o) => m0({ id: `m${o}`, ordinal: o }))));
    expect(s.missions.map((m) => m.ordinal)).toEqual(ords);
  });

  it('array order never changes numbering', () => {
    const ms = [m0({ id: 'a', ordinal: 5 }), m0({ id: 'b' }), m0({ id: 'c', ordinal: 2 })];
    const fwd = ok(withMissions(...ms)).missions;
    const rev = ok(withMissions(...[...ms].reverse())).missions;
    const byId = (xs: typeof fwd) => Object.fromEntries(xs.map((m) => [m.id, m.ordinal]));
    expect(byId(fwd)).toEqual(byId(rev));
    expect(byId(fwd)).toEqual({ a: 5, b: null, c: 2 });
  });
});

describe('mission lifecycle, progress and timing', () => {
  it('14 missing lifecycle is UNKNOWN', () => {
    expect(ok(withMissions(m0({ lifecycle: undefined }))).missions[0]!.status).toBe('UNKNOWN');
  });

  it.each(['DONE', 'complete', 'Active', 'SUCCEEDED'])(
    '15 unknown lifecycle "%s" is UNKNOWN (no nearest match)',
    (lifecycle) => {
      expect(ok(withMissions(m0({ lifecycle }))).missions[0]!.status).toBe('UNKNOWN');
    },
  );

  it.each([
    ['16 progress < 0', -5],
    ['17 progress > 100', 140],
    ['18 NaN-equivalent', 'NaN'],
    ['18b infinite', Number.POSITIVE_INFINITY],
  ])('%s is not reported (null), never 0%%', (_, progressPct) => {
    expect(ok(withMissions(m0({ progressPct }))).missions[0]!.progress).toBeNull();
  });

  it('progress = 100 never implies completion', () => {
    const m = ok(withMissions(m0({ progressPct: 100 }))).missions[0]!;
    expect(m.status).toBe('ACTIVE');
    expect(m.progress).toBe(1);
    expect(m.certification).toBe('PENDING');
  });

  it('19 invalid timestamps are dropped, never a plausible timer', () => {
    const m = ok(withMissions(m0({ startedAt: '2026-13-45T99:00:00Z', createdAt: 'soon' })))
      .missions[0]!;
    expect(m.startedAt).toBeUndefined();
    expect(m.createdAt).toBe('');
  });

  it('20 a start beyond tolerated skew is dropped', () => {
    expect(
      ok(withMissions(m0({ startedAt: iso(30 * MIN) }))).missions[0]!.startedAt,
    ).toBeUndefined();
  });

  it('COMPLETE without a completion time is UNKNOWN', () => {
    const m = ok(
      withMissions(
        m0({
          lifecycle: 'COMPLETE',
          certification: { status: 'CERTIFIED', decidedBy: 'cert-svc', decidedAt: iso(0) },
        }),
      ),
    ).missions[0]!;
    expect(m.status).toBe('UNKNOWN');
    expect(m.certification).toBe('UNKNOWN'); // and therefore not certifiable
  });

  it('ACTIVE with a completion time is disputed: lifecycle UNKNOWN', () => {
    expect(ok(withMissions(m0({ completedAt: iso(-MIN) }))).missions[0]!.status).toBe('UNKNOWN');
  });

  it('42 negative duration (end before start) drops the end time', () => {
    const m = ok(
      withMissions(
        m0({ lifecycle: 'COMPLETE', startedAt: iso(-MIN), completedAt: iso(-60 * MIN) }),
      ),
    ).missions[0]!;
    expect(m.completedAt).toBeUndefined();
    expect(m.status).toBe('UNKNOWN');
  });

  it('41 a zero-duration mission is valid', () => {
    const t = iso(-MIN);
    const m = ok(
      withMissions(
        m0({
          lifecycle: 'COMPLETE',
          startedAt: t,
          completedAt: t,
          result: { outcome: 'SUCCESS', summary: 'ok' },
        }),
      ),
    ).missions[0]!;
    expect(m).toMatchObject({ status: 'COMPLETE', startedAt: t, completedAt: t });
  });

  it.each([
    ['40 missing', undefined],
    ['zero', { durationMs: 0 }],
    ['negative', { durationMs: -1 }],
    ['43 extremely large', { durationMs: ANN_LIMITS.estimateMs + 1 }],
    ['string', { durationMs: '2h' }],
  ])('estimate %s → NO estimate (never generated)', (_, estimate) => {
    expect(ok(withMissions(m0({ estimate }))).missions[0]!.estimate).toBeUndefined();
  });

  it('a result inconsistent with the lifecycle is dropped', () => {
    const s = ok(withMissions(m0({ result: { outcome: 'SUCCESS', summary: 'claimed' } })));
    expect(s.missions[0]!.result).toBeUndefined();
  });
});

describe('certification is explicit and independent of execution', () => {
  const done = (certification: unknown, over: Record<string, unknown> = {}) =>
    m0({
      lifecycle: 'COMPLETE',
      completedAt: iso(-MIN),
      result: { outcome: 'SUCCESS', summary: 'done' },
      certification,
      ...over,
    });

  it('27 complete but uncertified stays uncertified', () => {
    const m = ok(withMissions(done({ status: 'PENDING' }))).missions[0]!;
    expect(m.status).toBe('COMPLETE');
    expect(m.certification).toBe('PENDING');
  });

  it('missing certification evidence is UNKNOWN (not NOT_REQUIRED, not CERTIFIED)', () => {
    expect(ok(withMissions(done(undefined))).missions[0]!.certification).toBe('UNKNOWN');
  });

  it('26 CERTIFIED without valid evidence is UNKNOWN', () => {
    for (const c of [
      { status: 'CERTIFIED' },
      { status: 'CERTIFIED', decidedBy: 'svc' },
      { status: 'CERTIFIED', decidedBy: 'svc', decidedAt: 'later' },
      { status: 'certified', decidedBy: 'svc', decidedAt: iso(0) },
    ])
      expect(ok(withMissions(done(c))).missions[0]!.certification).toBe('UNKNOWN');
  });

  it('CERTIFIED with evidence on a completed mission is accepted', () => {
    expect(
      ok(withMissions(done({ status: 'CERTIFIED', decidedBy: 'cert-svc', decidedAt: iso(0) })))
        .missions[0]!.certification,
    ).toBe('CERTIFIED');
  });

  it('28 FAILED but certification says CERTIFIED: certification UNKNOWN', () => {
    const m = ok(
      withMissions(
        m0({
          lifecycle: 'FAILED',
          completedAt: iso(-MIN),
          certification: { status: 'CERTIFIED', decidedBy: 'svc', decidedAt: iso(0) },
        }),
      ),
    ).missions[0]!;
    expect(m.status).toBe('FAILED');
    expect(m.certification).toBe('UNKNOWN');
  });

  it('a passed review, a SUCCESS result or 100% never certify', () => {
    const m = ok(
      withMissions(
        done(undefined, { progressPct: 100, review: { status: 'PASSED', completedAt: iso(-MIN) } }),
      ),
    ).missions[0]!;
    expect(m.certification).toBe('UNKNOWN');
  });

  it('review without evidence is UNKNOWN, never "not requested"', () => {
    expect(ok(withMissions(m0({ review: undefined }))).missions[0]!.review.status).toBe('UNKNOWN');
    expect(ok(withMissions(m0({ review: { status: 'PASSED' } }))).missions[0]!.review.status).toBe(
      'UNKNOWN',
    );
  });
});

describe('workers: identity separate from role, capability and authority', () => {
  const w0 = (over: Record<string, unknown> = {}) => ({
    id: 'w-x',
    name: 'Case',
    role: 'Engineer',
    state: 'WORKING',
    ...over,
  });
  const withWorkers = (...ws: Record<string, unknown>[]) => ({ ...feed(), workers: ws });

  it.each([
    ['22 named Founder #0007', { name: 'Founder #0007' }],
    ['22b spaced/cased variant', { name: 'founder   #07' }],
    ['22c id equal to the authority', { id: 'Founder #0007' }],
    ['23 role "Founder"', { role: 'Founder' }],
  ])('%s: dropped as impersonation, never promoted', (_, over) => {
    const s = ok(withWorkers(w0(over)));
    expect(s.workers).toEqual([]);
    expect(issues(s).join('\n')).toMatch(/reserved Founder identity/);
  });

  it('44 unknown worker referenced by a mission stays an id (no invented persona)', () => {
    const s = ok({ ...withMissions(m0({ assignedWorkerIds: ['ghost-404'] })), workers: [] });
    expect(s.missions[0]!.assignedWorkerIds).toEqual(['ghost-404']);
    expect(s.workers).toEqual([]);
  });

  it('45 missing role is UNKNOWN (not inferred from the name)', () => {
    const w = ok(withWorkers(w0({ role: undefined, name: 'Build Engineer Bob' }))).workers[0]!;
    expect(w.role).toBeUndefined();
  });

  it('missing name shows the opaque id', () => {
    expect(ok(withWorkers(w0({ name: undefined }))).workers[0]!.name).toBe('w-x');
  });

  it('idle and running at once is UNKNOWN', () => {
    expect(
      ok(withWorkers(w0({ state: 'IDLE', currentMissionId: 'ann-msn-7f3a' }))).workers[0]!.state,
    ).toBe('UNKNOWN');
  });

  it('capabilities never become authority', () => {
    const w = ok(
      withWorkers(
        w0({
          capabilities: [{ id: 'approve-anything', label: 'Approve' }],
          authority: [{ id: 'g', label: 'all', grantedBy: AUTH, grantedAt: iso(0) }],
        }),
      ),
    ).workers[0]!;
    expect(w.capabilities).toHaveLength(1);
    expect(w.authority).toEqual([]);
  });
});

describe('authority: Founder decisions fail closed', () => {
  it('a valid simulated fixture decision is kept, marked simulated', () => {
    const a = approval(
      ok(withApprovals(a0({ status: 'APPROVED', decision: decision() }))),
      'apr-x',
    )!;
    expect(a.status).toBe('APPROVED');
    expect(a.decision).toMatchObject({
      decision: 'APPROVE',
      decidedBy: AUTH,
      delivery: 'simulated',
    });
  });

  it.each([
    ['25 approval without authority evidence', decision({ authority: undefined })],
    ['authority claimed as a role string', decision({ authority: 'Founder' })],
    ['decider is not the configured authority', decision({ decidedBy: 'Founder #0008' })],
    ['decider is a near-miss spelling', decision({ decidedBy: 'founder #0007' })],
    ['decided before requested', decision({ decidedAt: iso(-60 * MIN) })],
    ['malformed decision record', 'yes'],
    ['decision without a time', decision({ decidedAt: undefined })],
  ])('%s: APPROVED becomes UNKNOWN, no decision', (_, d) => {
    const a = approval(ok(withApprovals(a0({ status: 'APPROVED', decision: d }))), 'apr-x')!;
    expect(a.status).toBe('UNKNOWN');
    expect(a.decision).toBeUndefined();
  });

  it('24 a worker cannot approve its own request', () => {
    const a = approval(
      ok(
        withApprovals(
          a0({
            status: 'APPROVED',
            requestedBy: 'ann-w-ada',
            decision: decision({ decidedBy: 'ann-w-ada' }),
          }),
        ),
      ),
      'apr-x',
    )!;
    expect(a.status).toBe('UNKNOWN');
  });

  it('a worker id equal to the configured authority cannot exist (dropped), so it cannot decide', () => {
    const f = withApprovals(a0({ status: 'APPROVED', decision: decision() }));
    f.workers = [...f.workers, { id: AUTH, name: 'x', state: 'IDLE' }];
    const s = ok(f);
    expect(s.workers.some((w) => w.id === AUTH)).toBe(false);
  });

  it('a request filed in the Founder name is dropped', () => {
    expect(
      approval(ok(withApprovals(a0({ requestedBy: 'Founder #0007' }))), 'apr-x'),
    ).toBeUndefined();
  });

  it('a decision contradicting the status is ignored; PENDING stays PENDING', () => {
    const a = approval(
      ok(withApprovals(a0({ status: 'PENDING', decision: decision() }))),
      'apr-x',
    )!;
    expect(a.status).toBe('PENDING');
    expect(a.decision).toBeUndefined();
  });

  it('unknown approval status is UNKNOWN', () => {
    expect(approval(ok(withApprovals(a0({ status: 'MAYBE' }))), 'apr-x')!.status).toBe('UNKNOWN');
  });

  it('36 duplicate approval ids: every copy dropped', () => {
    const s = ok(withApprovals(a0(), a0({ title: 'other' })));
    expect(s.approvals).toEqual([]);
    expect(unavailable(s, 'approvals')).toBe(true);
  });

  it('37 approval pointing to a nonexistent mission keeps its source reference only', () => {
    const a = approval(ok(withApprovals(a0({ missionId: 'missing-mission' }))), 'apr-x')!;
    expect(a.missionId).toBe('missing-mission');
    expect(a.status).toBe('PENDING');
  });

  it('38/39 missing risk, reversibility and expiry stay unknown', () => {
    const a = approval(
      ok(withApprovals(a0({ risk: undefined, reversible: undefined, expiresAt: undefined }))),
      'apr-x',
    )!;
    expect(a.risk).toBe('unknown');
    expect(a.reversible).toBeNull();
    expect(a.expiresAt).toBeUndefined();
  });

  it('LIVE feeds report decisions as delivered by the source, still never verified', () => {
    const f = {
      ...withApprovals(a0({ status: 'APPROVED', decision: decision() })),
      sourceMode: 'LIVE',
      source: { id: 'ann', kind: 'ann-runtime' },
    };
    const s = ok(f);
    expect(approval(s, 'apr-x')!.decision!.delivery).toBe('delivered');
    expect(s.provenance).toMatchObject({ mode: 'live', verifiedBackend: false });
  });

  it('principal comparison is normalized for reservation, exact for decisions', () => {
    expect(principalKey('Founder #0007')).toBe(principalKey('FOUNDER 7'));
    expect(principalKey('Founder #0007')).not.toBe(principalKey('Founder #0070'));
  });
});

describe('activity is evidence, never authority', () => {
  const withActivity = (...as: Record<string, unknown>[]) => ({ ...feed(), activity: as });

  it.each([
    'approval.decided',
    'certification.updated',
    'mission.completed',
    'review.passed',
    'health.updated',
    'alert.raised',
    'Founder approved',
  ])('34/35 activity kind "%s" is dropped', (kind) => {
    const s = ok(withActivity({ id: 'x', kind, at: iso(0), payload: { status: 'CERTIFIED' } }));
    expect(s.events).toEqual([]);
  });

  it('contradictory activity text changes no state', () => {
    const before = ok(feed());
    const s = ok(
      withActivity({
        id: 'x',
        kind: 'work.started',
        at: iso(0),
        missionId: 'ann-msn-2b88',
        summary: 'Mission certified. Founder approved APR-031.',
      }),
    );
    expect(mission(s, 'ann-msn-2b88')!.certification).toBe(
      mission(before, 'ann-msn-2b88')!.certification,
    );
    expect(approval(s, 'ann-apr-031')!.status).toBe('PENDING');
    expect(s.events[0]!.kind).toBe('work.started');
  });

  it('activity payloads are built, never copied from the source', () => {
    const s = ok(
      withActivity({
        id: 'x',
        kind: 'worker.assigned',
        at: iso(0),
        payload: { __proto__: { admin: true }, approve: true },
      }),
    );
    expect(s.events[0]!.payload).toEqual({ taskId: undefined });
  });
});

describe('health is evidence-backed', () => {
  const withHealth = (health: unknown) => ({ ...feed(), health });

  it('30 missing health is UNKNOWN', () => {
    expect(ok(withHealth(undefined)).health.status).toBe('UNKNOWN');
  });

  it('29 NOMINAL without component evidence is UNKNOWN', () => {
    expect(
      ok(withHealth({ status: 'NOMINAL', checkedAt: iso(0), components: [] })).health.status,
    ).toBe('UNKNOWN');
  });

  it('NOMINAL without a report time is UNKNOWN', () => {
    expect(
      ok(withHealth({ status: 'NOMINAL', components: [{ id: 'a', status: 'NOMINAL' }] })).health
        .status,
    ).toBe('UNKNOWN');
  });

  it('31 contradictory health (NOMINAL over a CRITICAL component) is UNKNOWN', () => {
    expect(
      ok(
        withHealth({
          status: 'NOMINAL',
          checkedAt: iso(0),
          components: [
            { id: 'a', status: 'NOMINAL' },
            { id: 'b', status: 'CRITICAL' },
          ],
        }),
      ).health.status,
    ).toBe('UNKNOWN');
  });

  it('stale health is UNKNOWN, components too', () => {
    const h = ok(
      withHealth({
        status: 'NOMINAL',
        checkedAt: iso(-60 * MIN),
        components: [{ id: 'a', status: 'NOMINAL' }],
      }),
    ).health;
    expect(h.status).toBe('UNKNOWN');
    expect(h.components.map((c) => c.status)).toEqual(['UNKNOWN']);
  });

  it('a fresh, consistent NOMINAL report is accepted', () => {
    expect(
      ok(
        withHealth({
          status: 'NOMINAL',
          checkedAt: iso(0),
          components: [{ id: 'a', status: 'NOMINAL' }],
        }),
      ).health.status,
    ).toBe('NOMINAL');
  });

  it('unknown status strings are UNKNOWN', () => {
    expect(
      ok(
        withHealth({
          status: 'GREAT',
          checkedAt: iso(0),
          components: [{ id: 'a', status: 'SPARKLING' }],
        }),
      ).health,
    ).toMatchObject({
      status: 'UNKNOWN',
      components: [{ status: 'UNKNOWN' }],
    });
  });
});

describe('freshness', () => {
  it('21 a stale snapshot is marked and evaluated against the source time', () => {
    const s = ok(annMockFeed('stale', NOW, AUTH));
    expect(s.generatedAt < iso(-5 * MIN)).toBe(true);
    expect(s.quality.lastSuccessfulSyncAt).toBe(s.generatedAt);
    expect(issues(s).join('\n')).toMatch(/STALE/);
    expect(s.health.status).toBe('UNKNOWN');
  });
});

describe('alerts', () => {
  const withAlerts = (...as: Record<string, unknown>[]) => ({ ...feed(), alerts: as });
  const al = (over: Record<string, unknown> = {}) => ({
    id: 'al-x',
    severity: 'INFO',
    title: 'Case',
    raisedAt: iso(-MIN),
    ...over,
  });

  // Hardening-02: unknown severity is no longer converted to WARNING (that
  // turned uncertainty into a stated severity). It stays UNKNOWN: neutral,
  // ranked with WARNING, never INFO, never dropped.
  it('32 unknown severity stays UNKNOWN (never informational, never silently WARNING)', () => {
    for (const severity of ['MEH', 'info', undefined, 3, null]) {
      const s = ok(withAlerts(al({ severity })));
      expect(s.alerts).toHaveLength(1);
      expect(s.alerts[0]!.severity).toBe('UNKNOWN');
    }
  });

  it('33 script-looking text is kept as inert text (React escapes it), never interpreted', () => {
    const a = ok(
      withAlerts(al({ title: '<img src=x onerror=alert(1)>', whatHappened: '<script>x</script>' })),
    ).alerts[0]!;
    expect(a.title).toBe('<img src=x onerror=alert(1)>');
  });

  it('unknown human-action requirement is treated as required', () => {
    expect(ok(withAlerts(al())).alerts[0]!.humanActionRequired).toBe(true);
  });

  it('extremely long labels are bounded', () => {
    expect(
      ok(withAlerts(al({ title: 'x'.repeat(100_000) }))).alerts[0]!.title.length,
    ).toBeLessThanOrEqual(300);
  });
});

describe('input hygiene', () => {
  it('48 extra unknown properties are ignored and never reach the model', () => {
    const f = feed();
    (f as Record<string, unknown>).isFounder = true;
    f.missions[0]!.certifiedByFounder = true;
    const s = ok(f);
    expect(JSON.stringify(s)).not.toMatch(/certifiedByFounder|isFounder/);
    expect(mission(s, 'ann-msn-7f3a')!.status).toBe('ACTIVE');
  });

  // Hardening-02: a record whose prototype was replaced is not a plain data
  // object. It is no longer read through (inherited fields could have been
  // read): it is unreadable, dropped, and the collection is marked incomplete.
  it('48b a record with a tampered prototype is unreadable, never read through', () => {
    const f = feed();
    Object.setPrototypeOf(f.missions[0]!, { lifecycle: 'COMPLETE', status: 'COMPLETE' });
    const s = ok(f);
    expect(mission(s, 'ann-msn-7f3a')).toBeUndefined();
    expect(unavailable(s, 'missions')).toBe(true);
    expect(({} as Record<string, unknown>).status).toBeUndefined();
  });

  it('49 null fields are missing, never zero or false', () => {
    const s = ok(
      withMissions(m0({ ordinal: null, progressPct: null, estimate: null, startedAt: null })),
    );
    expect(s.missions[0]).toMatchObject({
      ordinal: null,
      progress: null,
      estimate: undefined,
      startedAt: undefined,
    });
  });

  it('identifiers with control characters or padding are not identities', () => {
    const s = ok(
      withMissions(m0({ id: 'a\u0000b' }), m0({ id: ' padded ' }), m0({ id: 'x'.repeat(500) })),
    );
    expect(s.missions).toEqual([]);
  });

  it('normalization reads no clock: the same input and time give the same output', () => {
    const r1 = normalizeAnnFeed(feed(), { now: NOW, humanAuthority: AUTH });
    const r2 = normalizeAnnFeed(feed(), { now: NOW, humanAuthority: AUTH });
    expect(r1).toEqual(r2);
  });

  it('a deployment without an authority cannot normalize decisions at all', () => {
    expect(normalizeAnnFeed(feed(), { now: NOW, humanAuthority: '  ' }).ok).toBe(false);
  });
});
