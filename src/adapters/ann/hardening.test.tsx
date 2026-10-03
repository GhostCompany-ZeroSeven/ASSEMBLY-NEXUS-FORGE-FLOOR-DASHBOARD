import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { DashboardProvider } from '@/store/DashboardProvider';
import { useDashboard } from '@/store/hooks';
import { AnnAdapter } from './AnnAdapter';
import {
  ANN_CLOCK_SKEW_MS,
  ANN_DEFAULT_HEALTH_MAX_AGE_MS,
  ANN_DEFAULT_STALE_AFTER_MS,
  ANN_LIMITS,
} from './contract';
import { annMockFeed, MockAnnFeedSource } from './mockFeed';
import { normalizeAnnFeed, principalKey } from './normalize';

/**
 * DASHBOARD-ANN-ADAPTER-HARDENING-02: adversarial review of the ANN v1 trust
 * boundary. Deterministic tables only (no randomness). Every case asserts the
 * normalized truth and that no unsafe claim is produced.
 */

const NOW = Date.parse('2026-09-30T12:00:00Z');
const AUTH = 'Founder #0007';
const MIN = 60_000;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

type R = Record<string, unknown>;
type Feed = R & {
  missions: R[];
  workers: R[];
  approvals: R[];
  alerts: R[];
  activity: R[];
  health: R & { components: R[] };
};
const feed = (): Feed => structuredClone(annMockFeed('normal', NOW, AUTH)) as unknown as Feed;
const run = (raw: unknown, now = NOW) => normalizeAnnFeed(raw, { now, humanAuthority: AUTH });
function ok(raw: unknown, now = NOW): DashboardSnapshot {
  const r = run(raw, now);
  if (!r.ok) throw new Error(`expected ok: ${r.error.message}`);
  return r.snapshot;
}
const code = (raw: unknown, now = NOW) => {
  const r = run(raw, now);
  return r.ok ? 'OK' : r.error.code;
};
const resourceError = (s: DashboardSnapshot, r: string) =>
  s.quality.issues.some((i) => i.severity === 'error' && i.source === r);

const m0 = (o: R = {}): R => ({
  id: 'm-x',
  title: 'Case',
  lifecycle: 'ACTIVE',
  startedAt: iso(-10 * MIN),
  review: { status: 'NOT_REQUESTED' },
  certification: { status: 'PENDING' },
  ...o,
});
const w0 = (o: R = {}): R => ({
  id: 'w-x',
  name: 'Case worker',
  role: 'Engineer',
  state: 'WORKING',
  ...o,
});
const a0 = (o: R = {}): R => ({
  id: 'apr-x',
  title: 'Case approval',
  action: 'Do it',
  requestedBy: 'ann-w-ada',
  requestedAt: iso(-10 * MIN),
  requiredAuthority: AUTH,
  risk: 'low',
  reversible: true,
  status: 'PENDING',
  ...o,
});
const dec = (o: R = {}): R => ({
  decision: 'APPROVE',
  authority: 'FOUNDER',
  decidedBy: AUTH,
  decidedAt: iso(-5 * MIN),
  ...o,
});
const withM = (...x: R[]) => ({ ...feed(), missions: x });
const withW = (...x: R[]) => ({ ...feed(), workers: x });
const withA = (...x: R[]) => ({ ...feed(), approvals: x });
const approved = (o: R = {}, d: R = {}) =>
  ok(withA(a0({ status: 'APPROVED', decision: dec(d), ...o }))).approvals[0];

/* ----------------------------------------------------------------------- */
/* 5. Founder impersonation                                                 */
/* ----------------------------------------------------------------------- */

const FOUNDER_LOOKALIKES = [
  'Founder #0007',
  'founder #0007',
  'FOUNDER #0007',
  'Founder#0007',
  'Founder 0007',
  'Founder #007',
  'Founder #00007',
  'Founder #7',
  'Founder Zero Seven',
  'founder-zero-seven',
  'FOUNDER',
  'founder',
  'Founder #0007   ',
  '   Founder #0007',
  'Founder\t#0007',
  'Founder\n#0007',
  'Founder #0007', // no-break space
  'Founder #0007', // em space
  'Fo​under #0007', // zero-width space
  'Founder⁠#0007', // word joiner
  'Fоunder #0007', // Cyrillic о
  'Founԁer #0007', // Cyrillic ԁ
  'ＦＯＵＮＤＥＲ ＃０００７', // full-width
  'Co-Founder',
  'Founder #0007 (backup)',
];

describe('Founder impersonation: cosmetic variants never become a worker or a requester', () => {
  it.each(FOUNDER_LOOKALIKES)('worker NAME %j is dropped', (name) => {
    expect(ok(withW(w0({ name }))).workers).toEqual([]);
  });
  it.each(FOUNDER_LOOKALIKES.filter((v) => v.trim() === v && !/[\t\n]/.test(v)))(
    'worker ID %j is dropped',
    (id) => {
      expect(ok(withW(w0({ id }))).workers).toEqual([]);
    },
  );
  it.each(FOUNDER_LOOKALIKES)('worker ROLE %j is dropped', (role) => {
    expect(ok(withW(w0({ role }))).workers).toEqual([]);
  });
  it.each(FOUNDER_LOOKALIKES.filter((v) => v.trim() === v && !/[\t\n]/.test(v)))(
    'REQUESTER %j: the request is dropped',
    (requestedBy) => {
      const s = ok(withA(a0({ requestedBy })));
      expect(s.approvals).toEqual([]);
      expect(resourceError(s, 'approvals')).toBe(true);
    },
  );
  it.each(FOUNDER_LOOKALIKES.filter((v) => v !== AUTH))(
    'DECIDER %j is not the configured authority: decision rejected, APPROVED → UNKNOWN',
    (decidedBy) => {
      const a = approved({}, { decidedBy })!;
      expect(a.status).toBe('UNKNOWN');
      expect(a.decision).toBeUndefined();
    },
  );
  it('folding is for rejection only; the exact configured authority is required to decide', () => {
    expect(principalKey('Founder Zero Seven')).toBe(principalKey(AUTH));
    expect(principalKey('Fоunder #0007')).toBe(principalKey(AUTH));
    expect(approved()!.status).toBe('APPROVED');
  });
  it('ordinary names are not caught by the reservation', () => {
    for (const name of ['Ada Sprocket', 'Foundry Bot', 'Seven of Nine', 'Agent 007'])
      expect(ok(withW(w0({ name }))).workers, name).toHaveLength(1);
  });
});

/* ----------------------------------------------------------------------- */
/* 6. Self-approval / cross-identity                                        */
/* ----------------------------------------------------------------------- */

describe('self-approval and cross-identity attacks fail closed', () => {
  it.each<[string, R, R]>([
    ['worker decides own request', { requestedBy: 'ann-w-ada' }, { decidedBy: 'ann-w-ada' }],
    [
      'alias: requester by id, decider by display name',
      { requestedBy: 'ann-w-ada' },
      { decidedBy: 'Ada Sprocket' },
    ],
    ['worker id case-changed', { requestedBy: 'ann-w-ada' }, { decidedBy: 'ANN-W-ADA' }],
    ['decider omitted', {}, { decidedBy: undefined }],
    ['decider empty', {}, { decidedBy: '' }],
    ['decider padded', {}, { decidedBy: ` ${AUTH}` }],
    ['decision before request', {}, { decidedAt: iso(-11 * MIN) }],
    [
      'decision 1 ms before request',
      { requestedAt: iso(-10 * MIN) },
      { decidedAt: new Date(NOW - 10 * MIN - 1).toISOString() },
    ],
    ['decision time invalid', {}, { decidedAt: 'yesterday' }],
    ['decision time in the future', {}, { decidedAt: iso(30 * MIN) }],
    ['decision references another request', {}, { approvalId: 'apr-other' }],
    [
      'decision references another mission',
      { missionId: 'ann-msn-91c0' },
      { missionId: 'ann-msn-7f3a' },
    ],
    ['multiple decision records', {}, {}],
    ['decision kind contradicts status', {}, { decision: 'DENY' }],
  ])('%s', (name, req, d) => {
    const raw =
      name === 'multiple decision records'
        ? withA(a0({ status: 'APPROVED', decision: [dec(), dec({ decision: 'DENY' })] }))
        : withA(a0({ status: 'APPROVED', decision: dec(d), ...req }));
    const a = ok(raw).approvals[0];
    expect(a?.status ?? 'DROPPED').not.toBe('APPROVED');
    expect(a?.decision).toBeUndefined();
  });

  it('a decision at exactly the request instant is accepted (same source clock)', () => {
    expect(approved({ requestedAt: iso(-5 * MIN) }, { decidedAt: iso(-5 * MIN) })!.status).toBe(
      'APPROVED',
    );
  });

  it('requester omitted: the request is not usable', () => {
    expect(ok(withA(a0({ requestedBy: undefined }))).approvals).toEqual([]);
  });

  it('conflicting duplicate requests (APPROVED vs DENIED) keep neither', () => {
    const s = ok(
      withA(
        a0({ status: 'APPROVED', decision: dec() }),
        a0({ status: 'DENIED', decision: dec({ decision: 'DENY' }) }),
      ),
    );
    expect(s.approvals).toEqual([]);
    expect(resourceError(s, 'approvals')).toBe(true);
  });

  it('duplicate worker identities are dropped, so neither can be confused for the other', () => {
    expect(ok(withW(w0({ id: 'dup' }), w0({ id: 'dup', name: 'Other' }))).workers).toEqual([]);
  });

  it('every accepted Founder decision is marked SOURCE-ASSERTED, never authenticated', () => {
    expect(approved()!.decision).toMatchObject({
      assurance: 'source-asserted',
      delivery: 'simulated',
    });
  });
});

/* ----------------------------------------------------------------------- */
/* 12. Required-authority text                                              */
/* ----------------------------------------------------------------------- */

describe('required-authority text cannot alter behaviour', () => {
  it.each([
    'FOUNDER VERIFIED',
    'ROOT',
    'SYSTEM OWNER',
    'CERTIFIED AUTHORITY',
    'NO APPROVAL REQUIRED',
    'founder #0007',
    `${AUTH} `,
    '',
  ])(
    '%j is not shown and cannot be decided; a decision with it is rejected',
    (requiredAuthority) => {
      const s = ok(withA(a0({ requiredAuthority, status: 'APPROVED', decision: dec() })));
      const a = s.approvals[0]!;
      expect(a.requiredAuthority).toBe('');
      expect(a.status).toBe('UNKNOWN');
      expect(a.decision).toBeUndefined();
      expect(JSON.stringify(s)).not.toMatch(/FOUNDER VERIFIED|SYSTEM OWNER|NO APPROVAL REQUIRED/);
    },
  );
  it('only the exact configured authority is kept', () => {
    expect(ok(withA(a0())).approvals[0]!.requiredAuthority).toBe(AUTH);
  });
});

/* ----------------------------------------------------------------------- */
/* 7. Certification                                                         */
/* ----------------------------------------------------------------------- */

describe('certification is its own evidence channel', () => {
  const complete = (o: R = {}) =>
    m0({
      lifecycle: 'COMPLETE',
      completedAt: iso(-MIN),
      result: { outcome: 'SUCCESS', summary: 'ok' },
      ...o,
    });
  it.each<[string, R]>([
    ['COMPLETE + UNKNOWN certification', complete({ certification: { status: 'UNKNOWN' } })],
    ['COMPLETE + no certification record', complete({ certification: undefined })],
    ['100% progress', complete({ certification: undefined, progressPct: 100 })],
    [
      'review PASSED',
      complete({ certification: undefined, review: { status: 'PASSED', completedAt: iso(-MIN) } }),
    ],
    [
      'title says certified',
      complete({ title: 'CERTIFIED: release 1.0', certification: undefined }),
    ],
    [
      'result summary says certified',
      complete({
        certification: undefined,
        result: { outcome: 'SUCCESS', summary: 'Certified by QA' },
      }),
    ],
    [
      'green field elsewhere',
      complete({ certification: undefined, health: 'GREEN', status: 'CERTIFIED' }),
    ],
    [
      'CERTIFIED on a running mission',
      m0({ certification: { status: 'CERTIFIED', decidedBy: 'svc', decidedAt: iso(0) } }),
    ],
    [
      'CERTIFIED with malformed evidence',
      complete({ certification: { status: 'CERTIFIED', decidedBy: '', decidedAt: iso(0) } }),
    ],
    ['certification as a bare string', complete({ certification: 'CERTIFIED' })],
  ])('%s → never CERTIFIED', (_, m) => {
    expect(ok(withM(m)).missions[0]!.certification).not.toBe('CERTIFIED');
  });

  it('activity and worker output claiming certification change nothing', () => {
    const f = withM(complete({ certification: { status: 'PENDING' } }));
    f.activity = [
      { id: 'x', kind: 'work.started', at: iso(0), missionId: 'm-x', summary: 'Mission certified' },
    ];
    f.workers = [w0({ currentActivity: 'Certified mission m-x', currentMissionId: 'm-x' })];
    expect(ok(f).missions[0]!.certification).toBe('PENDING');
  });

  it('old certification evidence is still historical evidence (snapshot freshness governs)', () => {
    const m = ok(
      withM(
        complete({
          certification: {
            status: 'CERTIFIED',
            decidedBy: 'svc',
            decidedAt: iso(-400 * 24 * 60 * MIN),
          },
        }),
      ),
    ).missions[0]!;
    expect(m.certification).toBe('CERTIFIED');
  });
});

/* ----------------------------------------------------------------------- */
/* 8. Ordinals                                                              */
/* ----------------------------------------------------------------------- */

describe('ordinals are never fabricated', () => {
  it.each<[string, unknown, number | null]>([
    ['0', 0, 0],
    ['1', 1, 1],
    ['7', 7, 7],
    ['9999', 9999, 9999],
    ['10000', 10000, 10000],
    ['MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ['> MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 1, null],
    ['negative', -7, null],
    ['fraction', 7.5, null],
    ['Infinity', Number.POSITIVE_INFINITY, null],
    ['NaN', Number.NaN, null],
    ['string "0007"', '0007', null],
    ['string "7"', '7', null],
    ['empty string', '', null],
    ['null', null, null],
    ['missing', undefined, null],
    ['object', { value: 7 }, null],
    ['array', [7], null],
    ['boolean', true, null],
  ])('%s', (_, ordinal, expected) => {
    expect(ok(withM(m0({ ordinal }))).missions[0]!.ordinal).toBe(expected);
  });

  it('three-way duplicate: all UNKNOWN', () => {
    const s = ok(
      withM(m0({ id: 'a', ordinal: 3 }), m0({ id: 'b', ordinal: 3 }), m0({ id: 'c', ordinal: 3 })),
    );
    expect(s.missions.map((m) => m.ordinal)).toEqual([null, null, null]);
  });

  it('mission id reused with a different ordinal: every copy dropped', () => {
    expect(ok(withM(m0({ id: 'a', ordinal: 1 }), m0({ id: 'a', ordinal: 2 }))).missions).toEqual(
      [],
    );
  });

  it('reorder, reverse, removal, insertion and sparse sequences never renumber', () => {
    const base = [
      m0({ id: 'a', ordinal: 10 }),
      m0({ id: 'b', ordinal: 12 }),
      m0({ id: 'c' }),
      m0({ id: 'd', ordinal: 100 }),
    ];
    const map = (ms: R[]) =>
      Object.fromEntries(ok(withM(...ms)).missions.map((m) => [m.id, m.ordinal]));
    const expected = { a: 10, b: 12, c: null, d: 100 };
    expect(map(base)).toEqual(expected);
    expect(map([...base].reverse())).toEqual(expected);
    expect(map([base[2]!, base[0]!, base[3]!, base[1]!])).toEqual(expected);
    const withoutB = Object.fromEntries(Object.entries(expected).filter(([k]) => k !== 'b'));
    expect(map(base.filter((m) => m.id !== 'b'))).toEqual(withoutB);
    expect(map([m0({ id: 'new' }), ...base])).toEqual({ new: null, ...expected });
  });
});

/* ----------------------------------------------------------------------- */
/* 9. Health / false green                                                  */
/* ----------------------------------------------------------------------- */

describe('health: nothing becomes healthy without evidence', () => {
  const H = (health: unknown, extra: R = {}) => ok({ ...feed(), health, ...extra }).health;
  it.each<[string, unknown]>([
    ['absent', undefined],
    ['null', null],
    ['empty object', {}],
    ['components empty', { status: 'NOMINAL', checkedAt: iso(0), components: [] }],
    ['component state absent', { status: 'NOMINAL', checkedAt: iso(0), components: [{ id: 'a' }] }],
    [
      'unknown component state',
      { status: 'NOMINAL', checkedAt: iso(0), components: [{ id: 'a', status: 'OK' }] },
    ],
    [
      'stale report',
      {
        status: 'NOMINAL',
        checkedAt: iso(-ANN_DEFAULT_HEALTH_MAX_AGE_MS - 1),
        components: [{ id: 'a', status: 'NOMINAL' }],
      },
    ],
    [
      'future report time',
      { status: 'NOMINAL', checkedAt: iso(30 * MIN), components: [{ id: 'a', status: 'NOMINAL' }] },
    ],
    [
      'healthy top + failed component',
      { status: 'NOMINAL', checkedAt: iso(0), components: [{ id: 'a', status: 'CRITICAL' }] },
    ],
    [
      'malformed timestamp',
      { status: 'NOMINAL', checkedAt: '12:00', components: [{ id: 'a', status: 'NOMINAL' }] },
    ],
    [
      'status lower-case',
      { status: 'nominal', checkedAt: iso(0), components: [{ id: 'a', status: 'NOMINAL' }] },
    ],
  ])('%s → not NOMINAL', (_, health) => {
    expect(H(health).status).not.toBe('NOMINAL');
  });

  it('failed top-level with healthy components stays CRITICAL (conservative)', () => {
    expect(
      H({ status: 'CRITICAL', checkedAt: iso(0), components: [{ id: 'a', status: 'NOMINAL' }] })
        .status,
    ).toBe('CRITICAL');
  });

  it('zero alerts and missing health is not healthy', () => {
    const s = ok({ ...feed(), alerts: [], health: undefined });
    expect(s.alerts).toEqual([]);
    expect(s.health.status).toBe('UNKNOWN');
  });

  it('a valid empty snapshot is distinguishable from a failed source', async () => {
    const empty = ok({
      ...feed(),
      missions: [],
      workers: [],
      approvals: [],
      alerts: [],
      activity: [],
      health: undefined,
    });
    expect(empty.quality.partial).toBe(false);
    expect(empty.health.status).toBe('UNKNOWN');
    const failed = new AnnAdapter(
      { load: () => Promise.reject(new Error('timeout after 30s')) },
      { humanAuthority: AUTH, now: () => NOW },
    );
    await expect(failed.connect()).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    expect(failed.provenance()).toMatchObject({ mode: 'disconnected', verifiedBackend: false });
  });

  it('an adapter exception thrown synchronously by the source is a bounded source error', async () => {
    const a = new AnnAdapter(
      {
        load: () => {
          throw new Error('boom at /home/secret/path');
        },
      },
      { humanAuthority: AUTH, now: () => NOW },
    );
    const e = (await a.connect().catch((x: unknown) => x)) as Error & { code: string };
    expect(e.code).toBe('SOURCE_UNAVAILABLE');
    expect(e.message).not.toMatch(/secret|boom/);
  });
});

/* ----------------------------------------------------------------------- */
/* 13 + 17. Source mode and deterministic malformed-value tables            */
/* ----------------------------------------------------------------------- */

const MUTATIONS = (valid: string): [string, unknown][] => [
  ['number', 1],
  ['boolean', true],
  ['null', null],
  ['array', [valid]],
  ['object', { value: valid }],
  ['empty string', ''],
  // Case mutations only when they actually differ from the valid value.
  ...(valid.toLowerCase() !== valid
    ? [['lower case', valid.toLowerCase()] as [string, unknown]]
    : []),
  ...(valid.toUpperCase() !== valid
    ? [['upper case', valid.toUpperCase()] as [string, unknown]]
    : []),
  ['trailing space', `${valid} `],
  ['leading space', ` ${valid}`],
  ['tab', `${valid}\t`],
  ['unknown string', `${valid}_X`],
];

describe('source mode: no coercion into LIVE', () => {
  it.each([
    ['missing', undefined],
    ['null', null],
    ['"live"', 'live'],
    ['"LIVE "', 'LIVE '],
    ['"SIMULATED "', 'SIMULATED '],
    ['"PRODUCTION"', 'PRODUCTION'],
    ['"REAL"', 'REAL'],
    ['"CONNECTED"', 'CONNECTED'],
    ['numeric', 1],
    ['array', ['LIVE']],
    ['object', { mode: 'LIVE' }],
  ])('%s is rejected', (_, sourceMode) => {
    expect(code({ ...feed(), sourceMode })).toBe('MALFORMED_ENVELOPE');
  });
  it('"UNKNOWN" is rejected as unknown', () => {
    expect(code({ ...feed(), sourceMode: 'UNKNOWN' })).toBe('SOURCE_MODE_UNKNOWN');
  });
  it('LIVE from a runtime source is accepted only as an UNVERIFIED claim', async () => {
    const live = { ...feed(), sourceMode: 'LIVE', source: { id: 'r', kind: 'ann-runtime' } };
    expect(ok(live).provenance).toMatchObject({ mode: 'live', verifiedBackend: false });
    const a = new AnnAdapter(
      { load: () => Promise.resolve(live) },
      { humanAuthority: AUTH, now: () => NOW },
    );
    await a.connect();
    expect(a.trust()).toEqual({
      sourceMode: 'LIVE',
      transport: 'UNVERIFIED',
      snapshotAuthenticity: 'NOT_ESTABLISHED',
      decisionAuthenticity: 'NOT_ESTABLISHED',
    });
  });
  it('the mock is SIMULATED over an in-memory transport; nothing is authenticated', async () => {
    const a = new AnnAdapter(new MockAnnFeedSource('normal', AUTH, () => NOW), {
      humanAuthority: AUTH,
      now: () => NOW,
    });
    await a.connect();
    expect(a.trust()).toEqual({
      sourceMode: 'SIMULATED',
      transport: 'IN_MEMORY_MOCK',
      snapshotAuthenticity: 'NOT_ESTABLISHED',
      decisionAuthenticity: 'NOT_ESTABLISHED',
    });
  });
});

describe('deterministic malformed-value tables for security-sensitive fields', () => {
  it.each(MUTATIONS('assembly-nexus.dashboard-feed.v1'))(
    'contract version: %s → rejected',
    (_, v) => {
      expect(code({ ...feed(), contract: v })).toBe('UNSUPPORTED_CONTRACT');
    },
  );
  it.each(MUTATIONS('FOUNDER'))('decision authority: %s → not APPROVED', (_, authority) => {
    expect(approved({}, { authority })!.status).toBe('UNKNOWN');
  });
  it.each(MUTATIONS('APPROVE'))('decision kind: %s → not APPROVED', (_, decision) => {
    expect(approved({}, { decision })!.status).toBe('UNKNOWN');
  });
  it.each(MUTATIONS('APPROVED'))('approval status: %s → UNKNOWN', (_, status) => {
    expect(ok(withA(a0({ status }))).approvals[0]!.status).toBe('UNKNOWN');
  });
  it.each(MUTATIONS('CERTIFIED'))('certification: %s → UNKNOWN', (_, status) => {
    const m = m0({
      lifecycle: 'COMPLETE',
      completedAt: iso(-MIN),
      certification: { status, decidedBy: 'svc', decidedAt: iso(0) },
    });
    expect(ok(withM(m)).missions[0]!.certification).toBe('UNKNOWN');
  });
  it.each(MUTATIONS('PASSED'))('review: %s → UNKNOWN', (_, status) => {
    expect(
      ok(withM(m0({ review: { status, completedAt: iso(-MIN) } }))).missions[0]!.review.status,
    ).toBe('UNKNOWN');
  });
  it.each(MUTATIONS('COMPLETE'))('lifecycle: %s → UNKNOWN', (_, lifecycle) => {
    expect(ok(withM(m0({ lifecycle, completedAt: iso(-MIN) }))).missions[0]!.status).toBe(
      'UNKNOWN',
    );
  });
  it.each(MUTATIONS('NOMINAL'))('health: %s → never NOMINAL', (_, status) => {
    const h = ok({
      ...feed(),
      health: { status, checkedAt: iso(0), components: [{ id: 'a', status }] },
    }).health;
    expect(h.status).toBe('UNKNOWN');
    expect(h.components[0]!.status).toBe('UNKNOWN');
  });
  it.each(MUTATIONS('low'))('risk: %s → unknown (never low)', (_, risk) => {
    expect(ok(withA(a0({ risk }))).approvals[0]!.risk).toBe('unknown');
  });
  it.each(MUTATIONS('INFO'))('severity: %s → UNKNOWN (never INFO)', (_, severity) => {
    const s = ok({ ...feed(), alerts: [{ id: 'al', title: 't', raisedAt: iso(-MIN), severity }] });
    expect(s.alerts[0]!.severity).toBe('UNKNOWN');
  });
  it.each(MUTATIONS('normal'))('priority: %s → unknown (never normal)', (_, priority) => {
    expect(ok(withM(m0({ priority }))).missions[0]!.priority).toBe('unknown');
  });
  it.each(MUTATIONS('2026-09-30T11:00:00.000Z'))(
    'timestamp: %s → never a plausible start',
    (name, startedAt) => {
      const got = ok(withM(m0({ startedAt }))).missions[0]!.startedAt;
      // Date.parse tolerates surrounding whitespace and case; such values must
      // still denote the same instant, never a different one.
      if (got !== undefined) expect(got, name).toBe('2026-09-30T11:00:00.000Z');
    },
  );
  it.each([
    ['boolean', true],
    ['number', 1],
    ['string', 'true'],
    ['null', null],
  ])('reversible: %s is unknown (never true) unless boolean', (_, reversible) => {
    const r = ok(withA(a0({ reversible }))).approvals[0]!.reversible;
    expect(r).toBe(typeof reversible === 'boolean' ? reversible : null);
  });
});

/* ----------------------------------------------------------------------- */
/* 18. Object shape / prototype                                             */
/* ----------------------------------------------------------------------- */

describe('object shape: attacker keys are inert data', () => {
  it('__proto__, constructor and prototype keys change no prototype and reach no model', () => {
    const json = JSON.stringify(feed()).replace(
      '"id":"ann-msn-7f3a"',
      '"__proto__":{"lifecycle":"COMPLETE","polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"x":1},"id":"ann-msn-7f3a"',
    );
    const s = ok(JSON.parse(json));
    const m = s.missions.find((x) => x.id === 'ann-msn-7f3a')!;
    expect(m.status).toBe('ACTIVE');
    expect(Object.getPrototypeOf(m)).toBe(Object.prototype);
    expect(({} as R).polluted).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/polluted/);
  });
  it('an envelope-level __proto__ cannot supply a missing source mode', () => {
    const f = feed();
    delete (f as R).sourceMode;
    const json = JSON.stringify(f).replace('{', '{"__proto__":{"sourceMode":"LIVE"},');
    expect(code(JSON.parse(json))).toBe('MALFORMED_ENVELOPE');
  });
  it('non-plain values (class instances, functions) are not data', () => {
    class Evil {
      lifecycle = 'COMPLETE';
    }
    const s = ok(withM(new Evil() as unknown as R, m0()));
    expect(s.missions.map((m) => m.id)).toEqual(['m-x']);
    expect(code({ ...feed(), source: { id: () => 'x', kind: 'ann-mock' } })).toBe(
      'MALFORMED_ENVELOPE',
    );
  });
  it('a throwing getter makes the feed malformed, never partially trusted', () => {
    const f = feed() as R;
    Object.defineProperty(f, 'missions', {
      enumerable: true,
      get: () => {
        throw new Error('x');
      },
    });
    expect(code(f)).toBe('MALFORMED_ENVELOPE');
  });
});

/* ----------------------------------------------------------------------- */
/* 19. String bounds                                                        */
/* ----------------------------------------------------------------------- */

describe('string bounds: identities are rejected, never truncated; text is bounded', () => {
  const maxId = 'i'.repeat(ANN_LIMITS.id);
  it.each<[string, R, boolean]>([
    ['mission id at max', m0({ id: maxId }), true],
    ['mission id max + 1', m0({ id: `${maxId}x` }), false],
    ['mission id 1 char', m0({ id: 'm' }), true],
    ['mission id empty', m0({ id: '' }), false],
    ['mission id with newline', m0({ id: 'a\nb' }), false],
  ])('%s', (_, m, kept) => {
    expect(ok(withM(m)).missions.length).toBe(kept ? 1 : 0);
  });
  it('two ids differing only past the bound do not collide into one', () => {
    const s = ok(withM(m0({ id: `${maxId}a` }), m0({ id: `${maxId}b` })));
    expect(s.missions).toEqual([]); // both rejected, not truncated into a duplicate
  });
  it('request ids and source ids are bounded the same way', () => {
    expect(ok(withA(a0({ id: `${maxId}x` }))).approvals).toEqual([]);
    expect(code({ ...feed(), source: { id: `${maxId}x`, kind: 'ann-mock' } })).toBe(
      'MALFORMED_ENVELOPE',
    );
  });
  it('presentation text is bounded, inert and Unicode-safe', () => {
    const huge = 'x'.repeat(1_000_000);
    const s = ok({
      ...withM(m0({ title: huge })),
      workers: [w0({ name: huge, role: huge })],
      alerts: [
        {
          id: 'al',
          severity: 'INFO',
          title: '<script>alert(1)</script>',
          whatHappened: '\n'.repeat(5000) + 'x',
          raisedAt: iso(-MIN),
        },
      ],
      activity: [{ id: 'ac', kind: 'work.started', at: iso(-MIN), summary: huge }],
    });
    expect(s.missions[0]!.title.length).toBe(300);
    expect(s.workers[0]!.name.length).toBe(120);
    expect(s.workers[0]!.role!.length).toBe(120);
    expect(s.alerts[0]!.title).toBe('<script>alert(1)</script>');
    expect(s.alerts[0]!.whatHappened.length).toBeLessThanOrEqual(ANN_LIMITS.text);
    expect(JSON.stringify(s.events).length).toBeLessThan(2_000);
    const uni = ok(withM(m0({ title: '星 ✦ Ünïcödé 🚀' }))).missions[0]!.title;
    expect(uni).toBe('星 ✦ Ünïcödé 🚀');
  });
});

/* ----------------------------------------------------------------------- */
/* 20. Collection bounds                                                    */
/* ----------------------------------------------------------------------- */

describe('collection bounds: exactly max accepted, max + 1 rejects the whole feed', () => {
  const many = (n: number, make: (i: number) => R) => Array.from({ length: n }, (_, i) => make(i));
  it.each<[string, number, (i: number) => R]>([
    ['missions', ANN_LIMITS.missions, (i) => m0({ id: `m${i}` })],
    ['workers', ANN_LIMITS.workers, (i) => w0({ id: `w${i}`, name: `W ${i}` })],
    ['approvals', ANN_LIMITS.approvals, (i) => a0({ id: `a${i}` })],
    [
      'alerts',
      ANN_LIMITS.alerts,
      (i) => ({ id: `al${i}`, severity: 'INFO', title: 't', raisedAt: iso(-MIN) }),
    ],
  ])('%s', (key, max, make) => {
    expect(code({ ...feed(), [key]: many(max, make) })).toBe('OK');
    expect(code({ ...feed(), [key]: many(max + 1, make) })).toBe('RESOURCE_LIMIT');
  });
  it('health components: max accepted, max + 1 rejected', () => {
    const h = (n: number) => ({
      status: 'DEGRADED',
      checkedAt: iso(0),
      components: many(n, (i) => ({ id: `c${i}`, status: 'DEGRADED' })),
    });
    expect(code({ ...feed(), health: h(ANN_LIMITS.healthComponents) })).toBe('OK');
    expect(code({ ...feed(), health: h(ANN_LIMITS.healthComponents + 1) })).toBe('RESOURCE_LIMIT');
  });
  it('activity (history only) keeps the newest entries and says so', () => {
    const s = ok({
      ...feed(),
      activity: many(ANN_LIMITS.activity + 1, (i) => ({
        id: `e${i}`,
        kind: 'work.started',
        at: iso(-i * 1000),
      })),
    });
    expect(s.events).toHaveLength(ANN_LIMITS.activity);
    expect(
      s.quality.issues.some((i) => i.source === 'activity' && /truncated/.test(i.message)),
    ).toBe(true);
  });
  it('a rejected feed shows the source error state, never an empty dashboard', async () => {
    const big = {
      ...feed(),
      approvals: many(ANN_LIMITS.approvals + 1, (i) => a0({ id: `a${i}` })),
    };
    const a = new AnnAdapter(
      { load: () => Promise.resolve(big) },
      { humanAuthority: AUTH, now: () => NOW },
    );
    await expect(a.connect()).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });
});

/* ----------------------------------------------------------------------- */
/* 21. Time boundaries                                                      */
/* ----------------------------------------------------------------------- */

describe('time boundaries (injected evaluation time; documented semantics)', () => {
  const at = (genOffset: number) => ({
    ...feed(),
    snapshot: { id: 's', generatedAt: new Date(NOW + genOffset).toISOString() },
  });
  const stale = (s: DashboardSnapshot) => s.quality.issues.some((i) => i.source === 'snapshot');
  it('freshness: exactly at the bound is fresh, 1 ms past it is STALE', () => {
    expect(stale(ok(at(-ANN_DEFAULT_STALE_AFTER_MS)))).toBe(false);
    expect(stale(ok(at(-ANN_DEFAULT_STALE_AFTER_MS - 1)))).toBe(true);
  });
  it('future snapshot: exactly the tolerated skew is accepted, 1 ms more is rejected', () => {
    expect(code(at(ANN_CLOCK_SKEW_MS))).toBe('OK');
    expect(code(at(ANN_CLOCK_SKEW_MS + 1))).toBe('MALFORMED_ENVELOPE');
  });
  it('health age: exactly at the bound is current, 1 ms past it is UNKNOWN', () => {
    const h = (age: number) =>
      ok({
        ...feed(),
        health: {
          status: 'DEGRADED',
          checkedAt: new Date(NOW - age).toISOString(),
          components: [{ id: 'a', status: 'DEGRADED' }],
        },
      }).health.status;
    expect(h(ANN_DEFAULT_HEALTH_MAX_AGE_MS)).toBe('DEGRADED');
    expect(h(ANN_DEFAULT_HEALTH_MAX_AGE_MS + 1)).toBe('UNKNOWN');
  });
  it('a record cannot be later than the snapshot that contains it (+ skew)', () => {
    const f = {
      ...withM(m0({ startedAt: iso(-ANN_CLOCK_SKEW_MS + 1) })),
      snapshot: { id: 's', generatedAt: iso(-2 * ANN_CLOCK_SKEW_MS) },
    };
    expect(ok(f).missions[0]!.startedAt).toBeUndefined();
  });
  it('timezone offsets normalize to the same UTC instant', () => {
    expect(ok(withM(m0({ startedAt: '2026-09-30T13:50:00+02:00' }))).missions[0]!.startedAt).toBe(
      '2026-09-30T11:50:00.000Z',
    );
  });
  it('completion before start is invalid even by 1 ms (same source clock)', () => {
    const m = ok(
      withM(
        m0({
          lifecycle: 'COMPLETE',
          startedAt: iso(-MIN),
          completedAt: new Date(NOW - MIN - 1).toISOString(),
        }),
      ),
    ).missions[0]!;
    expect(m.completedAt).toBeUndefined();
    expect(m.status).toBe('UNKNOWN');
  });
  it('normalization never reads a clock', () => {
    expect(run(feed(), NOW)).toEqual(run(feed(), NOW));
    expect(ok(feed(), NOW + 10 * MIN).quality.issues.some((i) => i.source === 'snapshot')).toBe(
      true,
    );
  });
});

/* ----------------------------------------------------------------------- */
/* 15 + 24. Read-only, through the store                                    */
/* ----------------------------------------------------------------------- */

describe('read-only through the store: programmatic actions are refused', () => {
  it('decide, acknowledge and message are unavailable even when invoked directly', async () => {
    const adapter = new AnnAdapter(new MockAnnFeedSource('normal', AUTH, () => NOW), {
      humanAuthority: AUTH,
      now: () => NOW,
    });
    let ctx: ReturnType<typeof useDashboard> | null = null;
    function Probe() {
      const d = useDashboard();
      useEffect(() => {
        ctx = d;
      });
      return null;
    }
    render(
      <DashboardProvider adapter={adapter}>
        <Probe />
      </DashboardProvider>,
    );
    await act(async () => {});
    expect(ctx).not.toBeNull();
    const c = ctx!;
    for (const decision of ['APPROVE', 'DENY', 'HOLD'] as const)
      await expect(c.decideApproval('ann-apr-031', decision, AUTH)).rejects.toMatchObject({
        code: 'READ_ONLY',
      });
    await expect(c.acknowledgeAlert('ann-alr-007', AUTH)).rejects.toMatchObject({
      code: 'READ_ONLY',
    });
    expect(c.sendWorkerMessage).toBeNull();
    // Nothing changed: the snapshot still shows the request pending.
    expect(c.snapshot!.approvals.find((a) => a.id === 'ann-apr-031')!.status).toBe('PENDING');
  });

  it('the source interface exposes reading only', () => {
    const src = new MockAnnFeedSource('normal', AUTH);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(src)).filter(
      (k) => k !== 'constructor',
    );
    expect(methods).toEqual(['load']);
  });
});
