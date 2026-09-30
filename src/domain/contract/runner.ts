import { classifyIssue } from '../dataQuality';
import { resourceUnavailable } from '../selectors';
import type { DashboardSnapshot } from '../snapshot';
import {
  profileAssuresHistory,
  type Capability,
  type ContractProfile,
  type ProfileClause,
} from './profiles';
import { RULE_IDS, RULES, type RuleId } from './rules';

/**
 * Executable contract-conformance runner.
 *
 * It drives an adapter against a data source through a PROBE and records, per
 * rule, what was observed IN THIS RUN. It never turns an observation into a
 * guarantee: the profile's statement and its provenance are reported next to
 * the result, and their agreement is a separate field.
 *
 * Result semantics (per rule, this run only):
 * - PASS            the procedure ran and the expected behaviour was observed
 * - FAIL            the procedure ran and contrary behaviour was observed
 * - UNKNOWN         the procedure ran but could not decide (never counted as PASS)
 * - NOT_APPLICABLE  the rule does not apply to this target (e.g. no stream)
 * - BLOCKED         the procedure could not run (no target, or a missing capability)
 *
 * The runner is explicit and bounded: it is never part of the dashboard's
 * render path, and a probe can only do what its closed interface allows.
 * CONFORMANCE PASS != AUTHORITY != CERTIFICATION != FOUNDER APPROVAL.
 */
export type ConformanceResult = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE' | 'BLOCKED';
export type ProfileConsistency = 'CONSISTENT' | 'CONTRADICTS_PROFILE' | 'NOT_COMPARABLE';
export type RecordTreatment = 'DROP_RECORD' | 'DEGRADE_RESOURCE' | 'FAIL_RESOURCE' | 'UNKNOWN';

export type WireEvent = Record<string, unknown>;
export type Delivery = 'stream' | 'list' | 'both';

export interface ProbeCapabilities {
  /** Can place events into the source (stream, listing or both). */
  inject: boolean;
  /** The adapter under test has a push stream configured. */
  stream: boolean;
  /** Can make one resource or the stream fail. */
  faults: boolean;
  /** Can bound the source's listing window. */
  window: boolean;
  /** Can read the source's raw event listing. */
  observeListing: boolean;
}

/** The closed set of operations a conformance run may perform. */
export interface ConformanceProbe {
  readonly target: { id: string; kind: 'MOCK' | 'REAL' | 'UNKNOWN' };
  readonly capabilities: ProbeCapabilities;
  /** Fresh source data and a freshly connected adapter. */
  reset(): Promise<void>;
  inject(deliver: Delivery, events: WireEvent[]): Promise<void>;
  injectRaw(text: string): Promise<void>;
  setWindow(size: number | null): Promise<void>;
  fault(resource: string, mode: string): Promise<void>;
  patchMission(id: string, fields: { status?: string }): Promise<void>;
  /** One full REST cycle of the adapter. */
  sync(): Promise<void>;
  /** The source's raw events payload, as served. */
  listingPayload(): Promise<unknown>;
  snapshot(): DashboardSnapshot;
  /** Disconnect and later restore the push stream (source side). */
  streamDown(): Promise<void>;
  streamUp(): Promise<boolean>;
  /** Stream URLs the adapter requested, in order (resume hints are visible here). */
  streamRequests(): readonly string[];
  now(): number;
}

export interface RuleOutcome {
  ruleId: RuleId;
  result: ConformanceResult;
  /** Machine-readable observation code. */
  observed: string;
  /** Short factual lines about this run (adapter/test text, not localized). */
  evidence: string[];
  /** Where the result comes from: an executed procedure, or nothing. */
  provenance: 'RUNTIME_OBSERVATION' | 'NOT_EXECUTED';
  profileClause: ProfileClause;
  profileProvenance: ContractProfile['provenance'];
  profileConsistency: ProfileConsistency;
  /** Observed capability, for capability rules. */
  capability?: Capability;
  /** Observed treatment per malformed case (MALFORMED_RECORD_HANDLING). */
  treatments?: Record<string, RecordTreatment>;
}

export interface ConformanceReport {
  profile: Pick<ContractProfile, 'id' | 'kind' | 'provenance' | 'founderApproved'>;
  target: ConformanceProbe['target'] | null;
  /** Whether the profile lets event coverage be EXACT (see historyAssured). */
  historyAssuredByProfile: boolean;
  outcomes: RuleOutcome[];
}

type Procedure = (
  p: ConformanceProbe,
) => Promise<
  Omit<
    RuleOutcome,
    'ruleId' | 'profileClause' | 'profileProvenance' | 'profileConsistency' | 'provenance'
  >
>;

const run = (
  result: ConformanceResult,
  observed: string,
  evidence: string[],
  extra: Partial<RuleOutcome> = {},
) => ({
  result,
  observed,
  evidence,
  ...extra,
});

/**
 * Event times are pinned once per (id, offset): two deliveries of the same
 * event carry the SAME time, so an identical re-delivery is a true duplicate
 * and only a copy with different facts is a conflict. (Relative times resolved
 * by the source at each call would differ by milliseconds.)
 */
const pinned = new Map<string, string>();
const ev = (id: string, atOffsetMs: number, extra: WireEvent = {}): WireEvent => {
  const key = `${id}|${atOffsetMs}`;
  let at = pinned.get(key);
  if (at === undefined) {
    at = new Date(Date.now() + atOffsetMs).toISOString();
    pinned.set(key, at);
  }
  return {
    id,
    kind: 'task.completed',
    at,
    missionId: 'AN-0142',
    payload: { taskId: 'AN-0142-T9' },
    ...extra,
  };
};

function listedEvents(payload: unknown): Record<string, unknown>[] {
  const list = (payload as { events?: unknown } | null)?.events;
  return Array.isArray(list)
    ? (list.filter((e) => typeof e === 'object' && e !== null) as Record<string, unknown>[])
    : [];
}

const facts = (e: Record<string, unknown>) =>
  JSON.stringify([e.kind, e.at, e.missionId ?? null, e.workerId ?? null]);
const events = (s: DashboardSnapshot, id: string) => s.events.filter((e) => e.id === id);
const issueClasses = (s: DashboardSnapshot, needle: string) =>
  s.quality.issues
    .filter((i) => i.source.includes(needle) || i.message.includes(`"${needle}"`))
    .map(classifyIssue);

/**
 * Whether one listing's ids, in order, are the newest contiguous run of the
 * ids the probe placed into the source (in insertion order).
 */
export function isContiguousSuffix(
  listed: readonly string[],
  inserted: readonly string[],
): boolean {
  if (listed.length === 0) return inserted.length === 0;
  const start = inserted.length - listed.length;
  if (start < 0) return false;
  for (let i = 0; i < listed.length; i++) if (listed[i] !== inserted[start + i]) return false;
  return true;
}

/** Ids reused for events with different facts (a uniqueness counterexample). */
export function reusedIds(listed: readonly Record<string, unknown>[]): string[] {
  const seen = new Map<string, string>();
  const out = new Set<string>();
  for (const e of listed) {
    const id = String(e.id ?? '');
    if (!id) continue;
    const f = facts(e);
    const prior = seen.get(id);
    if (prior !== undefined && prior !== f) out.add(id);
    else seen.set(id, f);
  }
  return [...out];
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const PROCEDURES: Record<RuleId, { needs: (keyof ProbeCapabilities)[]; run: Procedure }> = {
  EVENT_ID_UNIQUENESS: {
    needs: ['inject', 'observeListing'],
    run: async (p) => {
      await p.inject('list', [ev('u-1', -3000), ev('u-2', -2000), ev('u-3', -1000)]);
      const listed = listedEvents(await p.listingPayload());
      const reused = reusedIds(listed);
      return reused.length
        ? run('FAIL', 'id-reused', [
            `The source listed ${reused.length} id(s) for different events: ${reused.slice(0, 5).join(', ')}`,
          ])
        : run('PASS', 'no-reused-id', [
            `No id was reused for a different event among ${listed.length} listed events (this run only).`,
          ]);
    },
  },
  EVENT_ID_STABILITY: {
    needs: ['inject', 'stream', 'observeListing'],
    run: async (p) => {
      await p.inject('both', [ev('s-1', -1000)]);
      await p.sync();
      const listed = listedEvents(await p.listingPayload()).some((e) => e.id === 's-1');
      const kept = events(p.snapshot(), 's-1');
      if (!listed || kept.length === 0)
        return run('UNKNOWN', 'not-seen-on-both-paths', [
          'The event was not observed on both paths.',
        ]);
      return kept.length === 1
        ? run('PASS', 'same-id-both-paths', [
            'The same event carried the same id on the stream and in the listing, and was kept once.',
          ])
        : run('FAIL', 'split-identity', [`One delivery produced ${kept.length} events.`]);
    },
  },
  LISTING_WINDOW_CONTIGUITY: {
    needs: ['inject', 'window', 'observeListing'],
    run: async (p) => {
      await p.setWindow(5);
      const inserted = Array.from({ length: 12 }, (_, i) => `w-${i + 1}`);
      await p.inject(
        'list',
        inserted.map((id, i) => ev(id, -60_000 + i * 1000)),
      );
      const listed = listedEvents(await p.listingPayload()).map((e) => String(e.id));
      await p.setWindow(null);
      return isContiguousSuffix(listed, inserted)
        ? run('PASS', 'contiguous-suffix', [
            `The listing (${listed.length}) was the newest contiguous run of inserted events (this run only).`,
          ])
        : run('FAIL', 'non-contiguous', [
            `The listing skipped or reordered events: ${listed.join(', ')}`,
          ]);
    },
  },
  LISTING_ORDERING: {
    needs: ['inject', 'observeListing'],
    run: async (p) => {
      // A late event is inserted last: event-time order and insertion order differ.
      await p.inject('list', [ev('o-1', -2000), ev('o-2', -1000), ev('o-late', -3_600_000)]);
      const a = listedEvents(await p.listingPayload()).map((e) => String(e.id));
      const b = listedEvents(await p.listingPayload()).map((e) => String(e.id));
      const tail = a.slice(-3).join(',');
      if (a.join() !== b.join())
        return run('FAIL', 'unstable-order', [
          'Two consecutive listings ordered the same events differently.',
        ]);
      const order = tail === 'o-1,o-2,o-late' ? 'insertion-order' : 'other-order';
      return run('PASS', order, [
        `Listing order was stable; observed ${order === 'insertion-order' ? 'insertion order (not event-time order)' : 'an order other than insertion order'}.`,
        'The dashboard orders timelines by event time itself and does not rely on listing order.',
      ]);
    },
  },
  DUPLICATE_DELIVERY: {
    needs: ['inject', 'stream'],
    run: async (p) => {
      await p.inject('stream', [ev('d-ss', -4000)]);
      await p.inject('stream', [ev('d-ss', -4000)]);
      await p.inject('list', [ev('d-rr', -3000), ev('d-rr', -3000)]);
      await p.inject('stream', [ev('d-sr', -2000)]);
      await p.inject('list', [ev('d-sr', -2000)]);
      await p.inject('list', [ev('d-rs', -1000)]);
      await p.sync();
      await p.inject('stream', [ev('d-rs', -1000)]);
      await p.sync();
      const s = p.snapshot();
      const expect: [string, string][] = [
        ['d-ss', 'stream'],
        ['d-rr', 'poll'],
        ['d-sr', 'stream'],
        ['d-rs', 'poll'],
      ];
      const bad = expect.filter(
        ([id, via]) => events(s, id).length !== 1 || events(s, id)[0]!.via !== via,
      );
      const conflicts = s.quality.issues.filter((i) => classifyIssue(i) === 'event-conflict');
      if (bad.length || conflicts.length)
        return run('FAIL', 'duplicate-miscounted', [
          ...bad.map(
            ([id]) =>
              `${id}: kept ${events(s, id).length} time(s) via ${events(s, id)[0]?.via ?? 'none'}`,
          ),
          ...(conflicts.length
            ? [`${conflicts.length} identical re-deliveries were classified as conflicts`]
            : []),
        ]);
      return run('PASS', 'counted-once-first-ingest-kept', [
        'SSE→SSE, REST→REST, SSE→REST and REST→SSE were each kept once with the first ingest path.',
        'Transport duplicates were not reported as conflicts.',
      ]);
    },
  },
  AT_LEAST_ONCE_DELIVERY: {
    needs: ['inject', 'stream', 'faults'],
    run: async (p) => {
      await p.streamDown();
      await p.inject('stream', [ev('a-stream-only', -1000)]);
      await p.inject('both', [ev('a-both', -900)]);
      const up = await p.streamUp();
      await p.sync();
      const s = p.snapshot();
      if (!up)
        return run('UNKNOWN', 'stream-not-restored', [
          'The stream did not come back within the run.',
        ]);
      const lost = events(s, 'a-stream-only').length === 0;
      const recovered = events(s, 'a-both').length === 1;
      return lost
        ? run('FAIL', 'stream-event-lost', [
            'A stream-only event emitted while the stream was down was never delivered.',
            recovered
              ? 'An event also in the listing was recovered by REST re-sync.'
              : 'A listed event was not recovered either.',
          ])
        : run('PASS', 'delivered', [
            'Every event emitted during the outage was delivered at least once.',
          ]);
    },
  },
  SAME_ID_CONFLICT_SEMANTICS: {
    needs: ['inject', 'stream'],
    run: async (p) => {
      await p.inject('stream', [ev('c-1', -1000, { missionId: 'AN-0142' })]);
      await p.inject('list', [ev('c-1', -9_000_000, { missionId: 'AN-0141' })]);
      await p.sync();
      const s = p.snapshot();
      const kept = events(s, 'c-1');
      const classes = issueClasses(s, 'c-1');
      const ok =
        kept.length === 1 &&
        kept[0]!.missionId === 'AN-0142' &&
        classes.includes('event-conflict') &&
        !classes.includes('duplicate-delivery');
      return ok
        ? run('PASS', 'first-kept-conflict-reported', [
            'The first observation was kept unchanged.',
            'The disagreement was reported as event-conflict, not as a duplicate delivery.',
          ])
        : run('FAIL', 'conflict-mishandled', [
            `Kept ${kept.length} (mission ${kept[0]?.missionId ?? 'none'}); issue classes: ${classes.join(', ') || 'none'}`,
          ]);
    },
  },
  RECONNECT_RESUME_SEMANTICS: {
    needs: ['inject', 'stream', 'faults'],
    run: async (p) => {
      await p.inject('stream', [ev('r-before', -2000)]);
      await p.streamDown();
      await p.inject('both', [ev('r-during', -1000)]);
      const up = await p.streamUp();
      await settle(50);
      if (!up)
        return run('UNKNOWN', 'stream-not-restored', [
          'The stream did not come back within the run.',
        ]);
      const asked = p.streamRequests().some((u) => u.includes('lastEventId='));
      const replayed = events(p.snapshot(), 'r-during').some((e) => e.via === 'stream');
      await p.sync();
      const recovered = events(p.snapshot(), 'r-during').length === 1;
      const capability: Capability = replayed ? 'SUPPORTED' : 'NOT_SUPPORTED';
      return run(
        recovered ? 'PASS' : 'FAIL',
        replayed ? 'resumed' : 'no-replay-recovered-by-rest',
        [
          asked
            ? 'On reconnect the adapter sent its last event id as a resume hint (lastEventId).'
            : 'The adapter sent no resume hint.',
          replayed
            ? 'The source replayed the missed event on the stream.'
            : 'The source did not replay the missed event on the stream.',
          recovered
            ? 'The missed event was recovered from the listing; the dashboard does not depend on resume.'
            : 'The missed event was not recovered.',
        ],
        { capability },
      );
    },
  },
  REST_SSE_RECONCILIATION: {
    needs: ['inject', 'stream'],
    run: async (p) => {
      await p.inject('stream', [ev('x-stream', -3000)]);
      await p.inject('list', [ev('x-list', -2000)]);
      await p.inject('both', [ev('x-both', -1000)]);
      await p.sync();
      await p.sync();
      const s = p.snapshot();
      const ok =
        events(s, 'x-stream').length === 1 &&
        events(s, 'x-list')[0]?.via === 'poll' &&
        events(s, 'x-both').length === 1;
      return ok
        ? run('PASS', 'reconciled', [
            'Stream-only survived re-sync; listing-only was added; both-path kept once.',
          ])
        : run('FAIL', 'not-reconciled', [
            'An event was lost, doubled or relabelled across REST and SSE.',
          ]);
    },
  },
  EVENT_TIME_SEMANTICS: {
    needs: ['inject', 'stream'],
    run: async (p) => {
      const now = p.now();
      const future = new Date(now + 86_400_000).toISOString();
      const past = new Date(now - 30 * 86_400_000).toISOString();
      await p.inject('stream', [{ ...ev('t-future', 0), at: future }]);
      await p.inject('stream', [{ ...ev('t-past', 0), at: past }]);
      const s = p.snapshot();
      const ok = events(s, 't-future')[0]?.at === future && events(s, 't-past')[0]?.at === past;
      return ok
        ? run('PASS', 'source-time-kept', [
            'Skewed source times were kept exactly as reported (never corrected or trusted as current).',
          ])
        : run('FAIL', 'source-time-altered', ['A source event time was changed on ingest.']);
    },
  },
  RECEIVED_TIME_SEMANTICS: {
    needs: ['inject', 'stream'],
    run: async (p) => {
      const before = p.now();
      await p.inject('stream', [ev('rt-1', 86_400_000)]); // future-skewed source time
      const after = p.now();
      const first = events(p.snapshot(), 'rt-1')[0];
      await p.inject('list', [ev('rt-1', 86_400_000)]);
      await p.sync();
      const again = events(p.snapshot(), 'rt-1')[0];
      const rx = first?.receivedAt ? Date.parse(first.receivedAt) : NaN;
      const snap = Date.parse(p.snapshot().generatedAt);
      const ok =
        rx >= before - 5 &&
        rx <= after + 5 &&
        again?.receivedAt === first?.receivedAt &&
        snap <= p.now() + 5;
      return ok
        ? run('PASS', 'arrival-time-kept', [
            'Received time is the dashboard clock at first arrival and is never rewritten by later copies.',
            'The snapshot time did not move to the future-skewed source time.',
          ])
        : run('FAIL', 'arrival-time-wrong', [
            `received ${first?.receivedAt ?? 'none'} → ${again?.receivedAt ?? 'none'}; snapshot ${p.snapshot().generatedAt}`,
          ]);
    },
  },
  HISTORY_TRUNCATION_SIGNAL: {
    needs: ['inject', 'window', 'observeListing'],
    run: async (p) => {
      const payload = await p.listingPayload();
      const keys = payload && typeof payload === 'object' ? Object.keys(payload) : [];
      const explicit = keys.some((k) => k !== 'events');
      await p.setWindow(5);
      await p.inject(
        'list',
        Array.from({ length: 20 }, (_, i) => ev(`h-${i}`, -30_000 + i * 1000)),
      );
      await p.sync();
      await p.setWindow(null);
      const s = p.snapshot();
      const detected =
        s.quality.eventHistoryGapAt !== undefined &&
        s.quality.issues.some((i) => classifyIssue(i) === 'history-gap');
      return run(
        detected ? 'PASS' : 'FAIL',
        detected ? 'gap-inferred' : 'gap-missed',
        [
          explicit
            ? `The listing carried fields besides events (${keys.join(', ')}); none is read as a truncation signal.`
            : 'The source sends no truncation signal; the adapter infers gaps from non-overlapping listings.',
          detected
            ? 'A window that moved past unseen events was detected as a history gap.'
            : 'A window that moved past unseen events was NOT detected.',
        ],
        { capability: explicit ? 'UNKNOWN' : 'NOT_SUPPORTED' },
      );
    },
  },
  RESOURCE_PARTIAL_FAILURE: {
    needs: ['faults'],
    run: async (p) => {
      const resources = ['missions', 'workers', 'approvals', 'alerts', 'events'];
      const wrong: string[] = [];
      for (const r of resources) {
        await p.fault(r, 'http500');
        await p.sync();
        const s = p.snapshot();
        for (const other of resources)
          if (resourceUnavailable(s, other) !== (other === r))
            wrong.push(
              `${r} failing → ${other} ${resourceUnavailable(s, other) ? 'unavailable' : 'available'}`,
            );
        await p.fault(r, 'off');
      }
      await p.sync();
      return wrong.length
        ? run('FAIL', 'failure-spread-or-hidden', wrong)
        : run('PASS', 'isolated-unavailable', [
            'Each resource failing alone was reported unavailable (not empty); the others stayed available.',
            'Crew, tasks, dependencies and artifacts are fields of missions and fail with it (no separate endpoints).',
          ]);
    },
  },
  MALFORMED_RECORD_HANDLING: {
    needs: ['inject', 'stream', 'faults'],
    run: async (p) => {
      const t: Record<string, RecordTreatment> = {};
      const before = p.snapshot().events.length;
      await p.inject('list', [
        { kind: 'task.completed', at: new Date(p.now()).toISOString(), payload: {} },
      ]);
      await p.inject('list', [{ ...ev('m-badtime', 0), at: 'not a time' }]);
      await p.sync();
      let s = p.snapshot();
      t['missing-id'] =
        s.events.length === before && !resourceUnavailable(s, 'events') ? 'DROP_RECORD' : 'UNKNOWN';
      t['invalid-timestamp'] =
        events(s, 'm-badtime').length === 0 && !resourceUnavailable(s, 'events')
          ? 'DROP_RECORD'
          : 'UNKNOWN';
      await p.patchMission('AN-0142', { status: 'NOT_A_REAL_STATUS' });
      await p.sync();
      s = p.snapshot();
      const m = s.missions.find((x) => x.id === 'AN-0142');
      t['unknown-enum'] =
        m?.status === 'UNKNOWN' && !resourceUnavailable(s, 'missions')
          ? 'DEGRADE_RESOURCE'
          : 'UNKNOWN';
      const n = s.events.length;
      await p.injectRaw('{"kind": "broken');
      s = p.snapshot();
      t['invalid-stream-text'] = s.events.length === n ? 'DROP_RECORD' : 'UNKNOWN';
      await p.inject('list', [ev('m-dup', -500), ev('m-dup', -500)]);
      await p.sync();
      s = p.snapshot();
      t['duplicate-record'] =
        events(s, 'm-dup').length === 1 && !resourceUnavailable(s, 'events')
          ? 'DROP_RECORD'
          : 'UNKNOWN';
      await p.inject('list', [
        ev('m-clash', -400),
        ev('m-clash', -9_999_000, { missionId: 'AN-0141' }),
      ]);
      await p.sync();
      s = p.snapshot();
      const clash = issueClasses(s, 'm-clash');
      t['conflicting-record'] =
        events(s, 'm-clash').length === 1 &&
        events(s, 'm-clash')[0]!.missionId === 'AN-0142' &&
        clash.includes('event-conflict') &&
        !clash.includes('duplicate-delivery')
          ? 'DROP_RECORD'
          : 'UNKNOWN';
      await p.fault('events', 'malformed');
      await p.sync();
      t['malformed-payload'] = resourceUnavailable(p.snapshot(), 'events')
        ? 'FAIL_RESOURCE'
        : 'UNKNOWN';
      await p.fault('events', 'off');
      await p.sync();
      const expected: Record<string, RecordTreatment> = {
        'missing-id': 'DROP_RECORD',
        'invalid-timestamp': 'DROP_RECORD',
        'unknown-enum': 'DEGRADE_RESOURCE',
        'invalid-stream-text': 'DROP_RECORD',
        'duplicate-record': 'DROP_RECORD',
        'conflicting-record': 'DROP_RECORD',
        'malformed-payload': 'FAIL_RESOURCE',
      };
      const wrong = Object.keys(expected).filter((k) => t[k] !== expected[k]);
      return run(
        wrong.length ? 'FAIL' : 'PASS',
        wrong.length ? 'unexpected-treatment' : 'bounded-treatment',
        wrong.length
          ? wrong.map((k) => `${k}: expected ${expected[k]}, observed ${t[k]}`)
          : [
              'Every malformed case was dropped, degraded or failed as documented; nothing crashed.',
            ],
        { treatments: t },
      );
    },
  },
};

function consistency(
  clause: ProfileClause,
  result: ConformanceResult,
  capability?: Capability,
): ProfileConsistency {
  if (result === 'BLOCKED' || result === 'UNKNOWN' || result === 'NOT_APPLICABLE')
    return 'NOT_COMPARABLE';
  if (clause.capability && capability) {
    if (clause.capability === 'UNKNOWN') return 'NOT_COMPARABLE';
    if (clause.capability !== capability) return 'CONTRADICTS_PROFILE';
  }
  switch (clause.guarantee) {
    case 'GUARANTEED':
      return result === 'FAIL' ? 'CONTRADICTS_PROFILE' : 'CONSISTENT';
    case 'NOT_GUARANTEED':
    case 'NOT_APPLICABLE':
      return 'CONSISTENT';
    default:
      return 'NOT_COMPARABLE'; // UNKNOWN / UNSPECIFIED: nothing to agree with
  }
}

/**
 * Run every rule (bounded, sequential, each from a fresh reset). With no probe
 * (e.g. the unapproved Assembly Nexus placeholder: no adapter exists), every
 * rule is BLOCKED; nothing is assumed.
 */
export async function runConformance(
  profile: ContractProfile,
  probe: ConformanceProbe | null,
  only: readonly RuleId[] = RULE_IDS,
): Promise<ConformanceReport> {
  const outcomes: RuleOutcome[] = [];
  pinned.clear();
  for (const ruleId of only) {
    const clause = profile.clauses[ruleId];
    const base = { ruleId, profileClause: clause, profileProvenance: profile.provenance };
    const proc = PROCEDURES[ruleId];
    if (!probe) {
      outcomes.push({
        ...base,
        result: 'BLOCKED',
        observed: 'no-target',
        evidence: ['No adapter or source is available to test.'],
        provenance: 'NOT_EXECUTED',
        profileConsistency: 'NOT_COMPARABLE',
      });
      continue;
    }
    const missing = proc.needs.filter((c) => !probe.capabilities[c]);
    if (missing.length) {
      const na =
        missing.includes('stream') &&
        RULES[ruleId].kind === 'adapter-handling' &&
        missing.length === 1;
      outcomes.push({
        ...base,
        result: na ? 'NOT_APPLICABLE' : 'BLOCKED',
        observed: na ? 'no-stream' : `missing-capability:${missing.join('+')}`,
        evidence: [
          na
            ? 'The adapter under test has no push stream.'
            : `The probe cannot: ${missing.join(', ')}.`,
        ],
        provenance: 'NOT_EXECUTED',
        profileConsistency: 'NOT_COMPARABLE',
      });
      continue;
    }
    await probe.reset();
    let r: Awaited<ReturnType<Procedure>>;
    try {
      r = await proc.run(probe);
    } catch (e) {
      r = run('UNKNOWN', 'procedure-error', [
        e instanceof Error ? e.message.slice(0, 200) : 'Procedure failed',
      ]);
    }
    outcomes.push({
      ...base,
      ...r,
      provenance: 'RUNTIME_OBSERVATION',
      profileConsistency: consistency(clause, r.result, r.capability),
    });
  }
  return {
    profile: {
      id: profile.id,
      kind: profile.kind,
      provenance: profile.provenance,
      founderApproved: profile.founderApproved,
    },
    target: probe?.target ?? null,
    historyAssuredByProfile: profileAssuresHistory(profile),
    outcomes,
  };
}
