import type { DashboardEvent } from '@/domain/events';
import { EVENT_CATEGORY } from '@/domain/events';
import type { DataIssue } from '@/domain/snapshot';
import { isKnownWorkerState, mapWorkerState, type WorkerStateMapping } from '@/domain/status';
import type {
  Alert,
  AlertSeverity,
  ApprovalDecision,
  ApprovalDecisionRecord,
  ApprovalRequest,
  ApprovalStatus,
  Artifact,
  ArtifactKind,
  AuthorityGrant,
  Blocker,
  Capability,
  CertificationStatus,
  HealthComponent,
  HealthStatus,
  Mission,
  MissionStatus,
  Review,
  ReviewStatus,
  RiskLevel,
  SystemHealth,
  Task,
  TaskStatus,
  Worker,
} from '@/domain/types';

/**
 * Translate untrusted backend JSON ("Forge Floor wire format v1") into domain
 * types. Rules:
 * - Records missing identity fields are DROPPED and reported, never guessed.
 * - Unknown enum values become UNKNOWN (or the most conservative value) and are reported.
 * - Optional numbers that are invalid become null/undefined. A backend's garbage
 *   progress is never displayed as 0%.
 * - Authority grants with missing provenance are dropped. Capabilities are
 *   never promoted to authority.
 */
export class IssueLog {
  readonly issues: DataIssue[] = [];
  constructor(private readonly at: string) {}
  add(severity: DataIssue['severity'], source: string, message: string): void {
    if (this.issues.length >= 200) return; // bound the log
    this.issues.push({
      id: `${source}#${this.issues.length}`,
      severity,
      source,
      message,
      at: this.at,
    });
  }
  get dropped(): boolean {
    return this.issues.some((i) => i.severity === 'error');
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.slice(0, 2000) : undefined;
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const iso = (v: unknown): string | undefined => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(Date.parse(s)).toISOString() : undefined;
};
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
  log: IssueLog,
  source: string,
  field: string,
): T {
  if (typeof v === 'string') {
    const up = v
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    const hit = allowed.find((a) => a.toUpperCase() === up);
    if (hit) return hit;
  }
  if (v !== undefined)
    log.add('warning', source, `Unrecognised ${field} "${String(v).slice(0, 60)}" → ${fallback}`);
  return fallback;
}

function progress(v: unknown, log: IssueLog, source: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) return v;
  log.add('warning', source, 'Invalid progress value ignored (expected 0..1)');
  return null;
}

/** Accepts `{ key: [...] }` or a bare array. */
export function listFrom(payload: unknown, key: string, log: IssueLog): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (isObj(payload) && Array.isArray(payload[key])) return payload[key] as unknown[];
  log.add('error', key, `Malformed payload: expected an array or { "${key}": [...] }`);
  return null;
}

/* -------------------------------------------------------------------------- */

export function normalizeWorker(
  raw: unknown,
  i: number,
  log: IssueLog,
  mapping?: WorkerStateMapping,
): Worker | null {
  const src = `workers[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return (log.add('error', src, 'Dropped: missing id or name'), null);

  const rawState = str(raw.state) ?? '';
  const state = rawState ? mapWorkerState(rawState, mapping) : 'UNKNOWN';
  if (!rawState || !isKnownWorkerState(rawState, mapping)) {
    log.add(
      'warning',
      `worker ${id}`,
      `Unknown state "${rawState || '(missing)'}" shown as UNKNOWN`,
    );
  }

  const capabilities: Capability[] = (Array.isArray(raw.capabilities) ? raw.capabilities : [])
    .map((c) =>
      isObj(c) && str(c.id) ? { id: str(c.id)!, label: str(c.label) ?? str(c.id)! } : null,
    )
    .filter((c): c is Capability => c !== null);

  const authority: AuthorityGrant[] = [];
  (Array.isArray(raw.authority) ? raw.authority : []).forEach((g, gi) => {
    const grant =
      isObj(g) && str(g.id) && str(g.label) && str(g.grantedBy) && iso(g.grantedAt)
        ? {
            id: str(g.id)!,
            label: str(g.label)!,
            grantedBy: str(g.grantedBy)!,
            grantedAt: iso(g.grantedAt)!,
            scope: str(g.scope),
            expiresAt: iso(g.expiresAt),
          }
        : null;
    if (!grant) {
      log.add(
        'error',
        `worker ${id}.authority[${gi}]`,
        'Dropped malformed authority grant (missing provenance)',
      );
    } else {
      authority.push(grant);
    }
  });

  const blockers: Blocker[] = (Array.isArray(raw.blockers) ? raw.blockers : [])
    .map((b, bi): Blocker | null => {
      if (!isObj(b) || !str(b.description)) return null;
      const dep = isObj(b.dependsOn) ? b.dependsOn : undefined;
      const depKind =
        dep && ['mission', 'task', 'approval', 'external'].includes(String(dep.kind))
          ? (dep.kind as NonNullable<Blocker['dependsOn']>['kind'])
          : undefined;
      return {
        id: str(b.id) ?? `${id}-blocker-${bi}`,
        description: str(b.description)!,
        dependsOn: depKind && str(dep?.id) ? { kind: depKind, id: str(dep?.id)! } : undefined,
        since: iso(b.since) ?? new Date(0).toISOString(),
      };
    })
    .filter((b): b is Blocker => b !== null);

  return {
    id,
    name,
    role: str(raw.role) ?? 'Worker',
    crewId: str(raw.crewId) ?? 'unassigned',
    characterId: str(raw.characterId) ?? id,
    homeRoomId: str(raw.homeRoomId) ?? '',
    state,
    stateSince: iso(raw.stateSince) ?? '',
    currentMissionId: str(raw.currentMissionId),
    currentTaskId: str(raw.currentTaskId),
    currentActivity: str(raw.currentActivity),
    progress: progress(raw.progress, log, `worker ${id}`),
    blockers,
    capabilities,
    authority,
  };
}

const MISSION_STATUSES: readonly MissionStatus[] = [
  'QUEUED',
  'ACTIVE',
  'WAITING_REVIEW',
  'WAITING_APPROVAL',
  'BLOCKED',
  'COMPLETE',
  'FAILED',
  'CANCELLED',
  'UNKNOWN',
];
const TASK_STATUSES: readonly TaskStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'DONE',
  'BLOCKED',
  'FAILED',
  'SKIPPED',
];
const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'NOT_REQUESTED',
  'REQUESTED',
  'IN_REVIEW',
  'PASSED',
  'FAILED',
];
const CERT_STATUSES: readonly CertificationStatus[] = [
  'NOT_REQUIRED',
  'PENDING',
  'IN_PROGRESS',
  'CERTIFIED',
  'REJECTED',
];
const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  'code',
  'document',
  'report',
  'test-result',
  'build',
  'dataset',
  'link',
  'other',
];

/** Only http(s) links are kept; anything else (javascript:, data:) is dropped. */
function safeUri(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Artifact record. Only http(s) links survive. */
export function normalizeArtifact(
  a: unknown,
  missionId: string,
  log: IssueLog,
  source: string,
): Artifact | null {
  if (!isObj(a) || !str(a.id) || !str(a.title)) {
    log.add('warning', source, 'Dropped artifact without id/title');
    return null;
  }
  return {
    id: str(a.id)!,
    missionId,
    producedBy: str(a.producedBy),
    kind: oneOf(a.kind, ARTIFACT_KINDS, 'other', log, source, 'artifact kind'),
    title: str(a.title)!,
    uri: safeUri(a.uri),
    summary: str(a.summary),
    createdAt: iso(a.createdAt) ?? '',
  };
}

export function normalizeMission(raw: unknown, i: number, log: IssueLog): Mission | null {
  const src = `missions[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = str(raw.id);
  const title = str(raw.title);
  if (!id || !title) return (log.add('error', src, 'Dropped: missing id or title'), null);
  const s = `mission ${id}`;

  const status = oneOf(raw.status, MISSION_STATUSES, 'UNKNOWN', log, s, 'status');
  if (raw.status === undefined) log.add('warning', s, 'Missing status shown as UNKNOWN');

  const tasks: Task[] = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .map((t, ti): Task | null => {
      if (!isObj(t) || !str(t.id) || !str(t.title)) {
        log.add('warning', `${s}.tasks[${ti}]`, 'Dropped task without id/title');
        return null;
      }
      return {
        id: str(t.id)!,
        missionId: id,
        title: str(t.title)!,
        status: oneOf(t.status, TASK_STATUSES, 'PENDING', log, `${s}.tasks[${ti}]`, 'task status'),
        assigneeId: str(t.assigneeId),
        progress: progress(t.progress, log, `${s}.tasks[${ti}]`),
        startedAt: iso(t.startedAt),
        completedAt: iso(t.completedAt),
        dependsOn: strArr(t.dependsOn),
      };
    })
    .filter((t): t is Task => t !== null);

  const artifacts: Artifact[] = (Array.isArray(raw.artifacts) ? raw.artifacts : [])
    .map((a) => normalizeArtifact(a, id, log, `${s}.artifact`))
    .filter((a): a is Artifact => a !== null);

  const rv = isObj(raw.review) ? raw.review : {};
  const review: Review = {
    id: str(rv.id) ?? `rev-${id}`,
    missionId: id,
    reviewerId: str(rv.reviewerId),
    status: oneOf(rv.status, REVIEW_STATUSES, 'NOT_REQUESTED', log, s, 'review status'),
    requestedAt: iso(rv.requestedAt),
    completedAt: iso(rv.completedAt),
    findings: Array.isArray(rv.findings) ? strArr(rv.findings) : undefined,
    summary: str(rv.summary),
  };

  const est = isObj(raw.estimate) ? raw.estimate : undefined;
  const estimate =
    est &&
    typeof est.durationMs === 'number' &&
    est.durationMs > 0 &&
    Number.isFinite(est.durationMs)
      ? {
          durationMs: est.durationMs,
          source: str(est.source) ?? 'Backend estimate',
          confidence: ['low', 'medium', 'high'].includes(String(est.confidence))
            ? (est.confidence as 'low' | 'medium' | 'high')
            : undefined,
        }
      : undefined;
  if (est && !estimate) log.add('warning', s, 'Invalid estimate ignored');

  const res = isObj(raw.result) ? raw.result : undefined;
  const result =
    res && str(res.summary)
      ? {
          outcome: oneOf(
            res.outcome,
            ['SUCCESS', 'PARTIAL', 'FAILURE'] as const,
            'PARTIAL',
            log,
            s,
            'result outcome',
          ),
          summary: str(res.summary)!,
          nextAction: str(res.nextAction),
        }
      : undefined;

  return {
    id,
    title,
    objective: str(raw.objective) ?? '',
    status,
    priority: oneOf(
      raw.priority,
      ['low', 'normal', 'high', 'critical'] as const,
      'normal',
      log,
      s,
      'priority',
    ),
    assignedWorkerIds: strArr(raw.assignedWorkerIds),
    createdAt: iso(raw.createdAt) ?? '',
    startedAt: iso(raw.startedAt),
    completedAt: iso(raw.completedAt),
    estimate,
    progress: progress(raw.progress, log, s),
    dependsOn: strArr(raw.dependsOn),
    tasks,
    artifacts,
    review,
    certification: oneOf(raw.certification, CERT_STATUSES, 'PENDING', log, s, 'certification'),
    approvalIds: strArr(raw.approvalIds),
    result,
  };
}

const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'PENDING',
  'HELD',
  'APPROVED',
  'DENIED',
  'EXPIRED',
  'WITHDRAWN',
  'UNKNOWN',
];
const DECISIONS: readonly ApprovalDecision[] = ['APPROVE', 'DENY', 'HOLD'];

/** Validates a decision record reported by the backend. Returns null if unusable. */
export function normalizeDecisionRecord(raw: unknown): ApprovalDecisionRecord | null {
  if (!isObj(raw)) return null;
  const decision = typeof raw.decision === 'string' ? raw.decision.toUpperCase() : '';
  const decidedBy = str(raw.decidedBy);
  const decidedAt = iso(raw.decidedAt);
  if (!DECISIONS.includes(decision as ApprovalDecision) || !decidedBy || !decidedAt) return null;
  return {
    decision: decision as ApprovalDecision,
    decidedBy,
    decidedAt,
    note: str(raw.note),
    delivery: 'delivered',
  };
}

export function normalizeApproval(raw: unknown, i: number, log: IssueLog): ApprovalRequest | null {
  const src = `approvals[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = str(raw.id);
  const title = str(raw.title);
  const requestedBy = str(raw.requestedBy);
  const requestedAt = iso(raw.requestedAt);
  if (!id || !title || !requestedBy || !requestedAt) {
    return (log.add('error', src, 'Dropped: missing id, title, requestedBy or requestedAt'), null);
  }
  const s = `approval ${id}`;
  const requiredAuthority = str(raw.requiredAuthority) ?? '';
  if (!requiredAuthority)
    log.add('error', s, 'Missing required authority. Decisions are disabled for this request');

  const risk = oneOf(
    raw.risk,
    ['low', 'medium', 'high', 'critical'] as const,
    'critical',
    log,
    s,
    'risk',
  ) as RiskLevel;
  const reversible = bool(raw.reversible);
  if (reversible === undefined)
    log.add('warning', s, 'Reversibility unknown. Treated as irreversible');

  let decision: ApprovalDecisionRecord | undefined;
  if (raw.decision !== undefined && raw.decision !== null) {
    decision = normalizeDecisionRecord(raw.decision) ?? undefined;
    if (!decision) log.add('warning', s, 'Malformed decision record ignored');
  }

  let status = oneOf(raw.status, APPROVAL_STATUSES, 'UNKNOWN', log, s, 'status');
  // A "decided" status without a valid decision record is not trusted.
  if ((status === 'APPROVED' || status === 'DENIED') && !decision) {
    log.add('error', s, `Status ${status} has no valid decision record. Shown as UNKNOWN`);
    status = 'UNKNOWN';
  }

  return {
    id,
    title,
    action: str(raw.action) ?? '(action not described by backend)',
    rationale: str(raw.rationale) ?? '',
    risk,
    reversible: reversible ?? false,
    missionId: str(raw.missionId),
    requestedBy,
    requestedAt,
    status,
    requiredAuthority,
    expiresAt: iso(raw.expiresAt),
    decision,
  };
}

const SEVERITIES: readonly AlertSeverity[] = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'];

export function normalizeAlert(raw: unknown, i: number, log: IssueLog): Alert | null {
  const src = `alerts[${i}]`;
  if (!isObj(raw)) return (log.add('error', src, 'Dropped: not an object'), null);
  const id = str(raw.id);
  const title = str(raw.title);
  const raisedAt = iso(raw.raisedAt);
  if (!id || !title || !raisedAt)
    return (log.add('error', src, 'Dropped: missing id, title or raisedAt'), null);
  const s = `alert ${id}`;
  const human = bool(raw.humanActionRequired);
  if (human === undefined)
    log.add('warning', s, 'humanActionRequired unknown. Treated as required');
  return {
    id,
    // Unknown severity is escalated, never downgraded.
    severity: oneOf(raw.severity, SEVERITIES, 'WARNING', log, s, 'severity'),
    title,
    whatHappened: str(raw.whatHappened) ?? '',
    affected: (Array.isArray(raw.affected) ? raw.affected : [])
      .filter(isObj)
      .filter(
        (a) => ['mission', 'worker', 'system', 'approval'].includes(String(a.kind)) && str(a.id),
      )
      .map((a) => ({
        kind: a.kind as Alert['affected'][number]['kind'],
        id: str(a.id)!,
        label: str(a.label) ?? str(a.id)!,
      })),
    attention: str(raw.attention) ?? '',
    humanActionRequired: human ?? true,
    raisedAt,
    acknowledgedAt: iso(raw.acknowledgedAt),
    resolvedAt: iso(raw.resolvedAt),
  };
}

const HEALTH: readonly HealthStatus[] = ['NOMINAL', 'DEGRADED', 'CRITICAL', 'UNKNOWN'];

export function normalizeHealth(raw: unknown, log: IssueLog, now: string): SystemHealth | null {
  if (!isObj(raw))
    return (log.add('error', 'health', 'Malformed payload: expected an object'), null);
  if (raw.status === undefined) log.add('warning', 'health', 'Missing status shown as UNKNOWN');
  const components: HealthComponent[] = (Array.isArray(raw.components) ? raw.components : [])
    .filter(isObj)
    .filter((c) => str(c.id))
    .map((c) => ({
      id: str(c.id)!,
      label: str(c.label) ?? str(c.id)!,
      status: oneOf(c.status, HEALTH, 'UNKNOWN', log, `health.${str(c.id)}`, 'status'),
      detail: str(c.detail),
      latencyMs:
        typeof c.latencyMs === 'number' && Number.isFinite(c.latencyMs) ? c.latencyMs : null,
    }));
  return {
    status: oneOf(raw.status, HEALTH, 'UNKNOWN', log, 'health', 'status'),
    checkedAt: iso(raw.checkedAt) ?? now,
    components,
  };
}

/** Environment label reported by the health endpoint, if any (e.g. `mock`). */
export function healthEnvironment(raw: unknown): string | undefined {
  return isObj(raw) ? str(raw.environment)?.slice(0, 40) : undefined;
}

/**
 * Events are accepted only when their kind is known and the fields the UI
 * reads are present. Anything else is dropped and reported.
 */
export function normalizeEvent(raw: unknown, i: number, log: IssueLog): DashboardEvent | null {
  const src = `events[${i}]`;
  if (!isObj(raw)) return (log.add('warning', src, 'Dropped: not an object'), null);
  const id = str(raw.id);
  const kind = str(raw.kind);
  const at = iso(raw.at);
  if (!id || !kind || !at || !(kind in EVENT_CATEGORY)) {
    return (log.add('warning', src, `Dropped event with unknown kind or missing id/at`), null);
  }
  const p = isObj(raw.payload) ? raw.payload : {};
  const ok = (() => {
    switch (kind as DashboardEvent['kind']) {
      case 'mission.created':
        return isObj(p.mission) && !!str(p.mission.title);
      case 'worker.state_changed':
        return typeof p.state === 'string';
      case 'task.progress':
        return typeof p.progress === 'number';
      case 'task.completed':
        return !!str(p.taskId);
      case 'artifact.produced':
        return isObj(p.artifact) && !!str(p.artifact.title);
      case 'certification.updated':
        return typeof p.status === 'string';
      case 'approval.requested':
        return isObj(p.request) && !!str(p.request.title);
      case 'approval.decided':
        return !!str(p.approvalId) && normalizeDecisionRecord(p.record) !== null;
      case 'mission.completed':
      case 'mission.failed':
        return isObj(p.result) && !!str(p.result.summary);
      case 'worker.blocked':
        return isObj(p.blocker) && !!str(p.blocker.description);
      case 'alert.raised':
        return isObj(p.alert) && !!str(p.alert.title) && !!str(p.alert.severity);
      case 'alert.acknowledged':
        return !!str(p.by);
      case 'health.updated':
        return isObj(p.health) && typeof p.health.status === 'string';
      case 'message.posted':
        return isObj(p.message) && !!str(p.message.body);
      default:
        return true;
    }
  })();
  if (!ok) return (log.add('warning', src, `Dropped ${kind} event with malformed payload`), null);
  const event = {
    id,
    kind,
    at,
    missionId: str(raw.missionId),
    workerId: str(raw.workerId),
    payload: p,
    via: 'poll',
  } as DashboardEvent;
  if (event.kind === 'worker.state_changed') {
    event.payload = { ...event.payload, state: mapWorkerState(String(p.state)) };
  }
  if (event.kind === 'approval.decided') {
    // Decisions reported by a backend are backend-delivered by definition.
    event.payload = { ...event.payload, record: normalizeDecisionRecord(p.record)! };
  }
  return event;
}
