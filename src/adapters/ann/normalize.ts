import type { DashboardEvent } from '@/domain/events';
import { isOrdinal } from '@/domain/missionNumber';
import type { DashboardSnapshot, DataIssue } from '@/domain/snapshot';
import {
  WORKER_STATES,
  type Alert,
  type AlertSeverity,
  type ApprovalDecision,
  type ApprovalDecisionRecord,
  type ApprovalRequest,
  type ApprovalStatus,
  type CertificationStatus,
  type DataProvenance,
  type HealthComponent,
  type HealthStatus,
  type Mission,
  type MissionStatus,
  type Review,
  type ReviewStatus,
  type RiskLevel,
  type SystemHealth,
  type Worker,
  type WorkerState,
} from '@/domain/types';
import { IssueLog, rejectDuplicateOrdinals } from '../rest/normalize';
import {
  ANN_ACTIVITY_KINDS,
  ANN_APPROVAL_STATUSES,
  ANN_CERTIFICATION,
  ANN_CLOCK_SKEW_MS,
  ANN_CONTRACT_VERSION,
  ANN_DECISION_AUTHORITY,
  ANN_DEFAULT_HEALTH_MAX_AGE_MS,
  ANN_DEFAULT_STALE_AFTER_MS,
  ANN_LIFECYCLES,
  ANN_LIMITS,
  ANN_REVIEW,
  ANN_SOURCE_KINDS,
  ANN_SOURCE_MODES,
  AnnAdapterError,
  type AnnActivityKind,
  type AnnNormalizeOptions,
  type AnnSourceKind,
  type AnnSourceMode,
} from './contract';

/**
 * The ONE normalization boundary for ANN v1 feeds. Pure: no I/O, no clock
 * reads (time is injected), no shared state. Raw values are read field by
 * field into fresh objects; nothing from the source is spread or merged.
 *
 * Posture:
 * - Envelope problems (version, identity, mode, contradictions, bounds) reject
 *   the whole feed with a bounded `AnnAdapterError`: never an empty dashboard.
 * - A missing or wrongly typed collection is UNAVAILABLE (a resource-level
 *   error), never "empty". An empty array is a valid empty collection.
 * - Security-sensitive record problems (identity, impersonation, authority)
 *   drop or downgrade the record; presentation contradictions keep the safe
 *   subset and make the disputed field UNKNOWN.
 */

export type AnnNormalizeResult =
  | { ok: true; snapshot: DashboardSnapshot; issues: DataIssue[] }
  | { ok: false; error: AnnAdapterError };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Non-empty trimmed text, truncated to the text bound. */
const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, ANN_LIMITS.text) : undefined;

/** An identifier: non-empty, bounded, no control characters. Anything else is no identity. */
const ident = (v: unknown): string | undefined =>
  typeof v === 'string' &&
  v.trim() !== '' &&
  v.length <= ANN_LIMITS.id &&
  !CONTROL.test(v) &&
  v.trim() === v
    ? v
    : undefined;

/** Exact enum match. No case folding, no nearest value. */
function exact<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

const percent = (v: unknown): number | null | 'invalid' => {
  if (v === undefined || v === null) return null;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v / 100 : 'invalid';
};

// Zero-width and invisible formatting characters.
const INVISIBLE = /[\u00ad\u061c\u115f\u1160\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
/** Common Cyrillic/Greek lookalikes of Latin letters (not a universal confusables table). */
const LOOKALIKE: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ї: 'i',
  ј: 'j',
  ԁ: 'd',
  ѕ: 's',
  ԛ: 'q',
  ԝ: 'w',
  ӏ: 'l',
  ɑ: 'a',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ı: 'i',
  ℓ: 'l',
};

/**
 * Folds an identity for RESERVATION checks only (never for granting anything):
 * Unicode compatibility form, invisible characters removed, common lookalike
 * letters mapped, "zero"/"seven" spelled out, punctuation and whitespace
 * dropped, leading zeros dropped from digit runs. "Founder #0007",
 * "FOUNDER 7", "Founder Zero Seven", "founder-zero-seven" and "Fоunder #007"
 * (Cyrillic о) all fold to "founder7". Decisions themselves require EXACT
 * equality with the configured authority, so folding can only ever reject.
 */
export function principalKey(s: string): string {
  return (
    s
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      // Combining joiners/variation selectors (outside the class: they combine).
      .replace(/\u034f|\u180b|\u180c|\u180d|\u180e|\u180f|\ufe0e|\ufe0f|\u17b4|\u17b5/g, '')
      .toLowerCase()
      .replace(/./gu, (ch) => LOOKALIKE[ch] ?? ch)
      .replace(/zero/g, '0')
      .replace(/seven/g, '7')
      .replace(/[^a-z0-9]+/g, '')
      .replace(/\d+/g, (d) => String(Number(d)))
  );
}

/**
 * Deep copy of untrusted input into null-prototype objects: only own
 * enumerable string keys, only JSON-like values. Keys such as `__proto__`,
 * `constructor` or `prototype` become inert data; no prototype is changed and
 * nothing inherited (or polluted) is ever read. Bounded in size and depth.
 */
const MAX_DEPTH = 8;
const MAX_NODES = 1_000_000;
function sanitize(v: unknown): unknown {
  let nodes = 0;
  const walk = (x: unknown, depth: number): unknown => {
    if (++nodes > MAX_NODES) throw new AnnAdapterError('RESOURCE_LIMIT', 'feed is too large');
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return x;
    if (typeof x === 'number') return x;
    if (typeof x !== 'object' || depth > MAX_DEPTH) return undefined;
    if (Array.isArray(x)) {
      if (x.length > ACTIVITY_HARD_CEILING)
        throw new AnnAdapterError('RESOURCE_LIMIT', 'a list exceeds the hard ceiling');
      return x.map((y) => walk(y, depth + 1));
    }
    const proto = Object.getPrototypeOf(x) as unknown;
    if (proto !== Object.prototype && proto !== null) return undefined; // Date, Map, class instances
    const out = Object.create(null) as Obj;
    for (const k of Object.keys(x)) out[k] = walk((x as Obj)[k], depth + 1);
    return out;
  };
  return walk(v, 0);
}

export function normalizeAnnFeed(raw: unknown, opts: AnnNormalizeOptions): AnnNormalizeResult {
  try {
    return { ok: true, ...normalizeOrThrow(sanitize(raw), opts) };
  } catch (e) {
    if (e instanceof AnnAdapterError) return { ok: false, error: e };
    // Anything unexpected is still a bounded, non-healthy outcome.
    return { ok: false, error: new AnnAdapterError('MALFORMED_ENVELOPE', 'unreadable feed') };
  }
}

const RESOURCES = ['missions', 'workers', 'approvals', 'alerts', 'activity'] as const;
type Resource = (typeof RESOURCES)[number];
const BOUND: Record<Resource, number> = {
  missions: ANN_LIMITS.missions,
  workers: ANN_LIMITS.workers,
  approvals: ANN_LIMITS.approvals,
  alerts: ANN_LIMITS.alerts,
  activity: Number.POSITIVE_INFINITY, // history: truncated, not rejected (see below)
};
/** Hard ceiling even for history, so a hostile feed cannot make us iterate millions. */
const ACTIVITY_HARD_CEILING = 50_000;

function normalizeOrThrow(
  raw: unknown,
  opts: AnnNormalizeOptions,
): { snapshot: DashboardSnapshot; issues: DataIssue[] } {
  const fail = (code: ConstructorParameters<typeof AnnAdapterError>[0], why: string): never => {
    throw new AnnAdapterError(code, why);
  };
  const { now } = opts;
  const authority = opts.humanAuthority.trim();
  if (!Number.isFinite(now)) fail('MALFORMED_ENVELOPE', 'no evaluation time');
  if (!authority) fail('MALFORMED_ENVELOPE', 'no deployment authority configured');

  /* ------------------------------ envelope ------------------------------ */
  if (!isObj(raw)) fail('MALFORMED_ENVELOPE', 'feed is not an object');
  const env = raw as Obj;
  if (env.contract === undefined) fail('UNSUPPORTED_CONTRACT', 'missing contract version');
  if (env.contract !== ANN_CONTRACT_VERSION)
    fail(
      'UNSUPPORTED_CONTRACT',
      typeof env.contract === 'string'
        ? `version "${env.contract.slice(0, 60)}" is not supported`
        : `version of type ${env.contract === null ? 'null' : typeof env.contract} is not supported`,
    );

  const source = isObj(env.source) ? env.source : undefined;
  const sourceId = ident(source?.id);
  const sourceKind = exact<AnnSourceKind>(source?.kind, ANN_SOURCE_KINDS);
  if (!sourceId || !sourceKind) fail('MALFORMED_ENVELOPE', 'missing or invalid source identity');
  const sourceName = text(source?.name)?.slice(0, 80) ?? sourceId!;

  const snap = isObj(env.snapshot) ? env.snapshot : undefined;
  const snapshotId = ident(snap?.id);
  const generatedMs = typeof snap?.generatedAt === 'string' ? Date.parse(snap.generatedAt) : NaN;
  if (!snapshotId || Number.isNaN(generatedMs))
    fail('MALFORMED_ENVELOPE', 'missing or invalid snapshot identity or time');
  if (generatedMs > now + ANN_CLOCK_SKEW_MS)
    fail('MALFORMED_ENVELOPE', 'snapshot time is in the future');
  const generatedAt = new Date(generatedMs).toISOString();

  if (env.sourceMode === undefined) fail('MALFORMED_ENVELOPE', 'missing source mode');
  const mode = exact<AnnSourceMode>(env.sourceMode, ANN_SOURCE_MODES);
  if (!mode) fail('MALFORMED_ENVELOPE', 'unrecognised source mode');
  if (mode === 'UNKNOWN')
    fail('SOURCE_MODE_UNKNOWN', 'the source cannot say whether its data is live or simulated');
  if (mode === 'LIVE' && sourceKind !== 'ann-runtime')
    fail('CONTRADICTORY_ENVELOPE', `a ${sourceKind} source cannot declare LIVE`);
  const simulated = mode === 'SIMULATED';

  const log = new IssueLog(new Date(now).toISOString());
  const unavailable = new Set<Resource>();
  const lists = {} as Record<Resource, unknown[]>;
  for (const r of RESOURCES) {
    const v = env[r];
    if (!Array.isArray(v)) {
      unavailable.add(r);
      lists[r] = [];
      log.add(
        'error',
        r,
        v === undefined ? `${r} not reported: shown as unavailable` : `${r} is not a list`,
      );
      continue;
    }
    if (v.length > BOUND[r] || v.length > ACTIVITY_HARD_CEILING)
      fail('RESOURCE_LIMIT', `${r}: ${v.length} records exceeds the contract bound`);
    lists[r] = v;
  }

  /* ------------------------------- records ------------------------------ */
  // A record cannot describe a moment after the snapshot that contains it.
  const ceiling = generatedMs + ANN_CLOCK_SKEW_MS;
  const time = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const ms = Date.parse(v);
    if (Number.isNaN(ms) || ms > ceiling) return undefined;
    return new Date(ms).toISOString();
  };
  const authorityKey = principalKey(authority);
  // Reservation is deliberately broad (fail closed): any identity text that
  // folds to contain the configured authority, or the word "founder", is not
  // a worker or requester the dashboard will show.
  const isReserved = (s: string | undefined) => {
    if (!s) return false;
    const k = principalKey(s);
    return k.includes(authorityKey) || k.includes('founder');
  };

  const workers = dedupe(
    lists.workers.map((w, i) => annWorker(w, i, log, isReserved, time)),
    'worker',
    log,
  );
  const workerKeys = new Set(
    workers.flatMap((w) => [principalKey(w.id), principalKey(w.name)]).filter(Boolean),
  );

  const missions = rejectDuplicateOrdinals(
    dedupe(
      lists.missions.map((m, i) => annMission(m, i, log, time)),
      'mission',
      log,
    ),
    log,
  );

  const approvals = dedupe(
    lists.approvals.map((a, i) =>
      annApproval(a, i, log, time, { authority, isReserved, workerKeys, simulated }),
    ),
    'approval',
    log,
  );

  const alerts = dedupe(
    lists.alerts.map((a, i) => annAlert(a, i, log, time)),
    'alert',
    log,
  );

  const events = annActivity(lists.activity, log, time, simulated);

  // A collection with unreadable records is partially UNKNOWN: say so at the
  // resource level, so counts derived from it are never shown as complete.
  for (const r of ['missions', 'workers', 'approvals', 'alerts'] as const) {
    const kept = { missions, workers, approvals, alerts }[r].length;
    if (!unavailable.has(r) && kept < lists[r].length)
      log.add('error', r, `${lists[r].length - kept} ${r} record(s) unreadable: counts incomplete`);
  }

  const health = annHealth(env.health, log, now, opts.healthMaxAgeMs);

  const staleAfterMs = opts.staleAfterMs ?? ANN_DEFAULT_STALE_AFTER_MS;
  if (now - generatedMs > staleAfterMs)
    log.add('warning', 'snapshot', 'Snapshot is older than the freshness bound: shown as STALE');

  const provenance: DataProvenance = {
    mode: simulated ? 'demo' : 'live',
    adapterId: 'ann',
    adapterLabel: `ANN feed v1 · ${sourceName}`,
    // This adapter verifies no connection: LIVE can never display as verified live.
    verifiedBackend: false,
    note: simulated
      ? 'Simulated ANN v1 feed: no Assembly Nexus system is connected.'
      : 'Source-declared LIVE; not verified by this adapter.',
    environment: sourceKind === 'ann-mock' ? 'mock' : undefined,
  };

  const snapshot: DashboardSnapshot = {
    provenance,
    generatedAt,
    workers,
    missions,
    approvals,
    alerts,
    events,
    messages: [],
    health,
    quality: {
      lastSuccessfulSyncAt: generatedAt,
      staleAfterMs,
      partial: unavailable.size > 0 || log.dropped,
      issues: log.issues,
    },
  };
  return { snapshot, issues: log.issues };
}

/** Records sharing an id cannot be told apart: every copy is dropped. */
function dedupe<T extends { id: string }>(xs: (T | null)[], what: string, log: IssueLog): T[] {
  const kept = xs.filter((x): x is T => x !== null);
  const count = new Map<string, number>();
  for (const x of kept) count.set(x.id, (count.get(x.id) ?? 0) + 1);
  return kept.filter((x) => {
    if (count.get(x.id)! < 2) return true;
    log.add('error', `${what} ${x.id}`, `Duplicate ${what} id: every copy dropped`);
    return false;
  });
}

/* --------------------------------- workers -------------------------------- */

const KNOWN_WORKER_STATES = WORKER_STATES.filter((s) => s !== 'UNKNOWN');

function annWorker(
  raw: unknown,
  i: number,
  log: IssueLog,
  isReserved: (s: string | undefined) => boolean,
  time: (v: unknown) => string | undefined,
): Worker | null {
  const src = `workers[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = ident(raw.id);
  if (!id) return (log.add('error', src, 'Dropped: missing or invalid id'), null);
  const name = text(raw.name)?.slice(0, 120);
  const role = text(raw.role)?.slice(0, 120);
  // Founder #0007 is reserved: a worker record claiming it is impersonation.
  if (isReserved(id) || isReserved(name) || isReserved(role))
    return (
      log.add('error', `worker ${id}`, 'Dropped: claims the reserved Founder identity'),
      null
    );

  const s = `worker ${id}`;
  let state: WorkerState = exact(raw.state, KNOWN_WORKER_STATES) ?? 'UNKNOWN';
  if (state === 'UNKNOWN') log.add('warning', s, 'Missing or unrecognised state shown as UNKNOWN');
  const currentMissionId = ident(raw.currentMissionId);
  const currentActivity = text(raw.currentActivity)?.slice(0, 300);
  if (state === 'IDLE' && (currentMissionId || currentActivity)) {
    log.add('warning', s, 'IDLE while assigned work: state shown as UNKNOWN');
    state = 'UNKNOWN';
  }
  const progress = percent(raw.progressPct);
  if (progress === 'invalid') log.add('warning', s, 'Invalid progress ignored');

  return {
    id,
    // No name reported: the opaque id is shown, never an invented persona.
    name: name ?? id,
    role,
    crewId: ident(raw.crewId) ?? 'unassigned',
    characterId: ident(raw.characterId) ?? id,
    homeRoomId: '',
    state,
    stateSince: time(raw.stateSince) ?? '',
    currentMissionId,
    currentActivity,
    progress: progress === 'invalid' ? null : progress,
    blockers: [],
    capabilities: (Array.isArray(raw.capabilities) ? raw.capabilities : [])
      .slice(0, 50)
      .filter(isObj)
      .filter((c) => ident(c.id))
      .map((c) => ({ id: ident(c.id)!, label: text(c.label)?.slice(0, 120) ?? ident(c.id)! })),
    // v1 carries no authority grants. Capabilities never become authority.
    authority: [],
  };
}

/* -------------------------------- missions -------------------------------- */

function annMission(
  raw: unknown,
  i: number,
  log: IssueLog,
  time: (v: unknown) => string | undefined,
): Mission | null {
  const src = `missions[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = ident(raw.id);
  const title = text(raw.title)?.slice(0, 300);
  if (!id || !title) return (log.add('error', src, 'Dropped: missing id or title'), null);
  const s = `mission ${id}`;

  let status: MissionStatus = exact(raw.lifecycle, ANN_LIFECYCLES) ?? 'UNKNOWN';
  if (status === 'UNKNOWN') log.add('warning', s, 'Missing or unrecognised lifecycle: UNKNOWN');

  // Ordinal: only the source's own field, only a non-negative safe integer.
  let ordinal: number | null = null;
  if (isOrdinal(raw.ordinal)) ordinal = raw.ordinal;
  else if (raw.ordinal !== undefined && raw.ordinal !== null)
    log.add('warning', s, 'Invalid ordinal ignored: mission number UNKNOWN');

  const startedAt = time(raw.startedAt);
  let completedAt = time(raw.completedAt);
  if (raw.startedAt !== undefined && !startedAt)
    log.add('warning', s, 'Invalid start time ignored');
  if (raw.completedAt !== undefined && !completedAt)
    log.add('warning', s, 'Invalid completion time ignored');
  if (
    startedAt &&
    completedAt &&
    // Both are the source's own clock: no skew tolerance between them.
    Date.parse(completedAt) < Date.parse(startedAt)
  ) {
    log.add('warning', s, 'Completion before start: completion time ignored');
    completedAt = undefined;
  }
  const terminal = status === 'COMPLETE' || status === 'FAILED';
  if (terminal && !completedAt) {
    log.add('warning', s, `${status} without a valid completion time: lifecycle UNKNOWN`);
    status = 'UNKNOWN';
  } else if (completedAt && !terminal && status !== 'CANCELLED' && status !== 'UNKNOWN') {
    log.add('warning', s, `${status} with a completion time: lifecycle UNKNOWN`);
    status = 'UNKNOWN';
  }

  const progress = percent(raw.progressPct);
  if (progress === 'invalid') log.add('warning', s, 'Invalid progress ignored');

  const est = isObj(raw.estimate) ? raw.estimate : undefined;
  const estimate =
    est &&
    typeof est.durationMs === 'number' &&
    Number.isFinite(est.durationMs) &&
    est.durationMs > 0 &&
    est.durationMs <= ANN_LIMITS.estimateMs
      ? {
          durationMs: est.durationMs,
          source: text(est.source)?.slice(0, 120) ?? 'ANN estimate',
          confidence: exact(est.confidence, ['low', 'medium', 'high'] as const),
        }
      : undefined;
  if (raw.estimate !== undefined && !estimate) log.add('warning', s, 'Invalid estimate ignored');

  const review = annReview(raw.review, id, log, s, time);
  const certification = annCertification(raw.certification, status, log, s, time);

  const res = isObj(raw.result) ? raw.result : undefined;
  const outcome = exact(res?.outcome, ['SUCCESS', 'PARTIAL', 'FAILURE'] as const);
  const consistent =
    (status === 'COMPLETE' && (outcome === 'SUCCESS' || outcome === 'PARTIAL')) ||
    (status === 'FAILED' && outcome === 'FAILURE');
  const result =
    res && outcome && text(res.summary) && consistent
      ? { outcome, summary: text(res.summary)! }
      : undefined;
  if (raw.result !== undefined && !result)
    log.add('warning', s, 'Result ignored: malformed or inconsistent with the lifecycle');

  return {
    id,
    ordinal,
    title,
    objective: text(raw.objective) ?? '',
    status,
    // Unstated priority is never shown as "normal".
    priority: exact(raw.priority, ['low', 'normal', 'high', 'critical'] as const) ?? 'unknown',
    assignedWorkerIds: idList(raw.assignedWorkerIds),
    createdAt: time(raw.createdAt) ?? '',
    startedAt,
    completedAt,
    estimate,
    progress: progress === 'invalid' ? null : progress,
    dependsOn: [],
    tasks: [],
    artifacts: [],
    review,
    certification,
    approvalIds: idList(raw.approvalIds),
    result,
  };
}

const idList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .slice(0, 100)
        .map(ident)
        .filter((x): x is string => !!x)
    : [];

function annReview(
  raw: unknown,
  missionId: string,
  log: IssueLog,
  s: string,
  time: (v: unknown) => string | undefined,
): Review {
  const rv = isObj(raw) ? raw : undefined;
  let status: ReviewStatus = exact(rv?.status, ANN_REVIEW) ?? 'UNKNOWN';
  if (status === 'UNKNOWN') log.add('warning', s, 'No valid review evidence: review UNKNOWN');
  const completedAt = time(rv?.completedAt);
  if ((status === 'PASSED' || status === 'FAILED') && !completedAt) {
    log.add('warning', s, `Review ${status} without a completion time: review UNKNOWN`);
    status = 'UNKNOWN';
  }
  return {
    id: `review:${missionId}`,
    missionId,
    reviewerId: ident(rv?.reviewerId),
    status,
    requestedAt: time(rv?.requestedAt),
    completedAt,
    summary: text(rv?.summary)?.slice(0, 500),
  };
}

function annCertification(
  raw: unknown,
  lifecycle: MissionStatus,
  log: IssueLog,
  s: string,
  time: (v: unknown) => string | undefined,
): CertificationStatus {
  const c = isObj(raw) ? raw : undefined;
  const status = exact(c?.status, ANN_CERTIFICATION);
  if (!status) {
    log.add('warning', s, 'No valid certification evidence: certification UNKNOWN');
    return 'UNKNOWN';
  }
  if (
    (status === 'CERTIFIED' || status === 'REJECTED') &&
    (!ident(c?.decidedBy) || !time(c?.decidedAt))
  ) {
    log.add('warning', s, `${status} without decision evidence: certification UNKNOWN`);
    return 'UNKNOWN';
  }
  // Certification only ever follows a completed mission; never infer it, never accept it early.
  if (status === 'CERTIFIED' && lifecycle !== 'COMPLETE') {
    log.add('warning', s, `CERTIFIED while ${lifecycle}: certification UNKNOWN`);
    return 'UNKNOWN';
  }
  return status;
}

/* -------------------------------- approvals ------------------------------- */

const DECISION_FOR: Partial<Record<ApprovalStatus, ApprovalDecision>> = {
  APPROVED: 'APPROVE',
  DENIED: 'DENY',
  HELD: 'HOLD',
};

function annApproval(
  raw: unknown,
  i: number,
  log: IssueLog,
  time: (v: unknown) => string | undefined,
  ctx: {
    authority: string;
    isReserved: (s: string | undefined) => boolean;
    workerKeys: Set<string>;
    simulated: boolean;
  },
): ApprovalRequest | null {
  const src = `approvals[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = ident(raw.id);
  const title = text(raw.title)?.slice(0, 300);
  const requestedBy = ident(raw.requestedBy);
  const requestedAt = time(raw.requestedAt);
  if (!id || !title || !requestedBy || !requestedAt)
    return (log.add('error', src, 'Dropped: missing id, title, requester or request time'), null);
  const s = `approval ${id}`;
  // The Founder does not file requests through a worker feed.
  if (ctx.isReserved(requestedBy))
    return (log.add('error', s, 'Dropped: requester claims the reserved Founder identity'), null);

  // Who may decide comes from this deployment's governance, never from feed
  // text: a requirement is kept only when it names exactly the configured
  // authority. Anything else ("ROOT", "FOUNDER VERIFIED", "NO APPROVAL
  // REQUIRED", a near-miss spelling) is not displayed and cannot be decided.
  const statedAuthority = raw.requiredAuthority;
  const requiredAuthority = ident(statedAuthority) === ctx.authority ? ctx.authority : '';
  if (!requiredAuthority)
    log.add(
      'error',
      s,
      statedAuthority === undefined
        ? 'Required authority not stated: cannot be decided'
        : 'Required authority not recognised: not shown, cannot be decided',
    );

  let status: ApprovalStatus = exact(raw.status, ANN_APPROVAL_STATUSES) ?? 'UNKNOWN';
  if (status === 'UNKNOWN') log.add('warning', s, 'Missing or unrecognised status: UNKNOWN');

  const decision = requiredAuthority
    ? annDecision(raw.decision, {
        ...ctx,
        id,
        missionId: ident(raw.missionId),
        requestedBy,
        requestedAt,
        log,
        s,
        time,
      })
    : raw.decision !== undefined && raw.decision !== null
      ? (log.add('error', s, 'Decision rejected: no recognised required authority'), undefined)
      : undefined;
  const expected = DECISION_FOR[status];
  let kept: ApprovalDecisionRecord | undefined;
  if (decision && expected && decision.decision === expected) kept = decision;
  else if (decision) log.add('warning', s, `Decision record contradicts status ${status}: ignored`);
  if ((status === 'APPROVED' || status === 'DENIED') && !kept) {
    log.add('error', s, `${status} without a valid Founder decision: status UNKNOWN`);
    status = 'UNKNOWN';
  }

  const risk: RiskLevel =
    exact(raw.risk, ['low', 'medium', 'high', 'critical'] as const) ?? 'unknown';
  const reversible = typeof raw.reversible === 'boolean' ? raw.reversible : null;
  return {
    id,
    title,
    action: text(raw.action) ?? '',
    rationale: text(raw.rationale) ?? '',
    risk,
    reversible,
    missionId: ident(raw.missionId),
    requestedBy,
    requestedAt,
    status,
    requiredAuthority,
    expiresAt: time(raw.expiresAt),
    decision: kept,
  };
}

/**
 * A Founder decision is accepted only when every condition holds. Names,
 * roles and display strings never qualify on their own; the decider must be
 * exactly the deployment's configured authority (not a value from the feed),
 * must not be the requester or any worker, must decide at or after the
 * request, and must not reference another request or mission.
 *
 * STRUCTURAL VALIDITY IS NOT AUTHENTICITY. v1 has no trusted transport and no
 * signatures: an accepted decision is a structurally valid, SOURCE-ASSERTED
 * Founder decision (`assurance: 'source-asserted'`), marked `simulated` for a
 * simulated feed. Nothing here authenticates the Founder.
 */
function annDecision(
  raw: unknown,
  c: {
    authority: string;
    workerKeys: Set<string>;
    simulated: boolean;
    id: string;
    missionId: string | undefined;
    requestedBy: string;
    requestedAt: string;
    log: IssueLog;
    s: string;
    time: (v: unknown) => string | undefined;
  },
): ApprovalDecisionRecord | undefined {
  if (raw === undefined || raw === null) return undefined;
  const reject = (why: string) => (c.log.add('error', c.s, `Decision rejected: ${why}`), undefined);
  if (!isObj(raw)) return reject('not an object');
  const decision = exact(raw.decision, ['APPROVE', 'DENY', 'HOLD'] as const);
  // Exact identity: no trimming, no case folding, no Unicode tolerance.
  const decidedBy = ident(raw.decidedBy);
  const decidedAt = c.time(raw.decidedAt);
  if (!decision || !decidedBy || !decidedAt) return reject('missing decision, decider or time');
  if (raw.authority !== ANN_DECISION_AUTHORITY) return reject('no Founder authority evidence');
  if (decidedBy !== c.authority) return reject('decider is not the configured authority');
  if (principalKey(decidedBy) === principalKey(c.requestedBy))
    return reject('a requester cannot decide its own request');
  if (c.workerKeys.has(principalKey(decidedBy)))
    return reject('a worker cannot hold Founder authority');
  // Same source clock for both: no skew tolerance; the same instant is allowed.
  if (Date.parse(decidedAt) < Date.parse(c.requestedAt))
    return reject('decided before it was requested');
  if (raw.approvalId !== undefined && raw.approvalId !== c.id)
    return reject('it references another request');
  if (raw.missionId !== undefined && raw.missionId !== c.missionId)
    return reject('it references another mission');
  return {
    decision,
    decidedBy,
    decidedAt,
    note: text(raw.note)?.slice(0, 500),
    delivery: c.simulated ? 'simulated' : 'delivered',
    assurance: 'source-asserted',
  };
}

/* --------------------------------- alerts --------------------------------- */

const SEVERITIES: readonly AlertSeverity[] = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'];

function annAlert(
  raw: unknown,
  i: number,
  log: IssueLog,
  time: (v: unknown) => string | undefined,
): Alert | null {
  const src = `alerts[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = ident(raw.id);
  const title = text(raw.title)?.slice(0, 300);
  const raisedAt = time(raw.raisedAt);
  if (!id || !title || !raisedAt)
    return (log.add('error', src, 'Dropped: missing id, title or time'), null);
  const s = `alert ${id}`;
  // Unknown severity stays UNKNOWN: neutral, ranked with WARNING, never INFO,
  // and never silently turned into a stated severity.
  const severity: AlertSeverity = exact(raw.severity, SEVERITIES) ?? 'UNKNOWN';
  if (severity === 'UNKNOWN') log.add('warning', s, 'Missing or unrecognised severity: UNKNOWN');
  const human = typeof raw.humanActionRequired === 'boolean' ? raw.humanActionRequired : undefined;
  if (human === undefined) log.add('warning', s, 'Human action unknown: treated as required');
  return {
    id,
    severity,
    title,
    whatHappened: text(raw.whatHappened) ?? '',
    affected: (Array.isArray(raw.affected) ? raw.affected : [])
      .slice(0, 50)
      .filter(isObj)
      .flatMap((a): Alert['affected'] => {
        const kind = exact(a.kind, ['mission', 'worker', 'system', 'approval'] as const);
        const ref = ident(a.id);
        return kind && ref ? [{ kind, id: ref, label: text(a.label)?.slice(0, 120) ?? ref }] : [];
      }),
    attention: text(raw.attention) ?? '',
    humanActionRequired: human ?? true,
    raisedAt,
    acknowledgedAt: time(raw.acknowledgedAt),
    resolvedAt: time(raw.resolvedAt),
  };
}

/* -------------------------------- activity -------------------------------- */

function annActivity(
  list: unknown[],
  log: IssueLog,
  time: (v: unknown) => string | undefined,
  simulated: boolean,
): DashboardEvent[] {
  const out: DashboardEvent[] = [];
  const seen = new Map<string, number>();
  list.forEach((raw, i) => {
    const src = `activity[${i}]`;
    if (!isObj(raw)) return log.add('warning', src, 'Dropped: not an object');
    const id = ident(raw.id);
    const at = time(raw.at);
    if (!id || !at) return log.add('warning', src, 'Dropped: missing id or time');
    const kind = exact<AnnActivityKind>(raw.kind, ANN_ACTIVITY_KINDS);
    if (!kind)
      return log.add(
        'warning',
        `activity ${id}`,
        'Dropped: activity kind not allowed (activity never carries approval, certification, outcome or health)',
      );
    const base = {
      id,
      at,
      missionId: ident(raw.missionId),
      workerId: ident(raw.workerId),
      via: simulated ? ('simulated' as const) : ('poll' as const),
    };
    const taskId = ident(raw.taskId);
    let event: DashboardEvent | null = null;
    if (kind === 'worker.assigned') event = { ...base, kind, payload: { taskId } };
    else if (kind === 'work.started')
      event = { ...base, kind, payload: { taskId, activity: text(raw.summary)?.slice(0, 300) } };
    else if (kind === 'task.completed')
      event = taskId ? { ...base, kind, payload: { taskId } } : null;
    else if (kind === 'review.requested') event = { ...base, kind, payload: {} };
    if (!event) return log.add('warning', `activity ${id}`, 'Dropped: incomplete payload');
    seen.set(id, (seen.get(id) ?? 0) + 1);
    out.push(event);
  });
  const unique = out.filter((e) => {
    if (seen.get(e.id)! < 2) return true;
    log.add('warning', `activity ${e.id}`, 'Duplicate activity id: every copy dropped');
    return false;
  });
  unique.sort((a, b) => a.at.localeCompare(b.at));
  if (unique.length > ANN_LIMITS.activity) {
    log.add(
      'warning',
      'activity',
      `History truncated to the newest ${ANN_LIMITS.activity} entries`,
    );
    return unique.slice(-ANN_LIMITS.activity);
  }
  return unique;
}

/* --------------------------------- health --------------------------------- */

const HEALTH: readonly HealthStatus[] = ['NOMINAL', 'DEGRADED', 'CRITICAL', 'UNKNOWN'];
const RANK: Record<HealthStatus, number> = { NOMINAL: 0, DEGRADED: 1, CRITICAL: 2, UNKNOWN: -1 };

function annHealth(
  raw: unknown,
  log: IssueLog,
  now: number,
  maxAgeMs = ANN_DEFAULT_HEALTH_MAX_AGE_MS,
): SystemHealth {
  const unknown: SystemHealth = { status: 'UNKNOWN', checkedAt: '', components: [] };
  if (raw === undefined)
    return (log.add('warning', 'health', 'No health report: health UNKNOWN'), unknown);
  if (!isObj(raw)) return (log.add('warning', 'health', 'Malformed health: UNKNOWN'), unknown);
  const list = Array.isArray(raw.components) ? raw.components : [];
  if (list.length > ANN_LIMITS.healthComponents)
    throw new AnnAdapterError('RESOURCE_LIMIT', 'health components exceed the contract bound');
  const checkedMs = typeof raw.checkedAt === 'string' ? Date.parse(raw.checkedAt) : NaN;
  const checkedOk = !Number.isNaN(checkedMs) && checkedMs <= now + ANN_CLOCK_SKEW_MS;
  const stale = checkedOk && now - checkedMs > maxAgeMs;
  // Without a usable report time, or with a stale one, no status is current.
  const trusted = checkedOk && !stale;
  if (!checkedOk) log.add('warning', 'health', 'Health report time missing or invalid: UNKNOWN');
  if (stale) log.add('warning', 'health', 'Health report is stale: UNKNOWN');

  const components: HealthComponent[] = list
    .filter(isObj)
    .filter((c) => ident(c.id))
    .map((c) => {
      const reported = exact(c.status, HEALTH) ?? 'UNKNOWN';
      return {
        id: ident(c.id)!,
        label: text(c.label)?.slice(0, 120) ?? ident(c.id)!,
        status: trusted ? reported : 'UNKNOWN',
        detail: text(c.detail)?.slice(0, 300),
        latencyMs:
          typeof c.latencyMs === 'number' && Number.isFinite(c.latencyMs) && c.latencyMs >= 0
            ? c.latencyMs
            : null,
      };
    });

  let status: HealthStatus = trusted ? (exact(raw.status, HEALTH) ?? 'UNKNOWN') : 'UNKNOWN';
  if (trusted && raw.status !== undefined && !exact(raw.status, HEALTH))
    log.add('warning', 'health', 'Unrecognised health status: UNKNOWN');
  // NOMINAL needs evidence: at least one component, and every component
  // itself NOMINAL (a component of unknown state cannot support "all healthy").
  if (
    status === 'NOMINAL' &&
    (components.length === 0 || components.some((c) => c.status !== 'NOMINAL'))
  ) {
    log.add('warning', 'health', 'NOMINAL without complete component evidence: UNKNOWN');
    status = 'UNKNOWN';
  }
  // An overall status better than its own worst component is a contradiction.
  const worst = Math.max(-1, ...components.map((c) => RANK[c.status]));
  if (status !== 'UNKNOWN' && worst > RANK[status]) {
    log.add('warning', 'health', `${status} contradicts a worse component: UNKNOWN`);
    status = 'UNKNOWN';
  }
  return {
    status,
    checkedAt: checkedOk ? new Date(checkedMs).toISOString() : '',
    components,
  };
}
