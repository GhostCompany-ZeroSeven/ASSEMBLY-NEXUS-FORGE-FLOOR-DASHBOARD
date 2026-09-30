import type { DashboardSnapshot } from '@/domain/snapshot';
import { ALERT_SEVERITY_META, MISSION_STATUS_META, WORKER_STATE_META } from '@/domain/status';
import { isOpenForDecision } from '@/domain/governance';
import { isMissionInFlight } from '@/domain/selectors';
import type {
  Alert,
  AlertSeverity,
  ApprovalRequest,
  Mission,
  RiskLevel,
  Worker,
  WorkerState,
} from '@/domain/types';

/**
 * Pure filter/sort functions for each surface. UI state stays in components;
 * these are unit-tested so "what matches" is never ambiguous.
 */

const text = (q: string, ...fields: (string | undefined)[]) => {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return terms.every((t) => hay.includes(t));
};

/* --------------------------- Founder attention ----------------------------- */

/** Worker is waiting on an OPEN approval gate (a human decision). */
export function isWaitingForFounder(w: Worker, s: Pick<DashboardSnapshot, 'approvals'>): boolean {
  return w.blockers.some(
    (b) =>
      b.dependsOn?.kind === 'approval' &&
      s.approvals.some((a) => a.id === b.dependsOn!.id && isOpenForDecision(a)),
  );
}

/** Mission is gated on at least one OPEN approval. */
export function missionAwaitsFounder(m: Mission, s: Pick<DashboardSnapshot, 'approvals'>): boolean {
  return (
    m.status === 'WAITING_APPROVAL' ||
    s.approvals.some((a) => m.approvalIds.includes(a.id) && isOpenForDecision(a))
  );
}

/* --------------------------------- Missions -------------------------------- */

export type MissionGroup =
  'all' | 'in-flight' | 'founder' | 'blocked' | 'queued' | 'complete' | 'failed' | 'unknown';
export type MissionSort = 'status' | 'priority' | 'newest' | 'elapsed' | 'id';

export interface MissionFilter {
  q: string;
  group: MissionGroup;
  priority: Mission['priority'] | 'all';
  workerId: string | 'all';
  sort: MissionSort;
}

export const DEFAULT_MISSION_FILTER: MissionFilter = {
  q: '',
  group: 'all',
  priority: 'all',
  workerId: 'all',
  sort: 'status',
};

const PRIORITY_RANK: Record<Mission['priority'], number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function missionMatchesGroup(
  m: Mission,
  g: MissionGroup,
  s: Pick<DashboardSnapshot, 'approvals'>,
): boolean {
  switch (g) {
    case 'all':
      return true;
    case 'in-flight':
      return isMissionInFlight(m);
    case 'founder':
      return missionAwaitsFounder(m, s) && m.status !== 'COMPLETE' && m.status !== 'FAILED';
    case 'blocked':
      return m.status === 'BLOCKED';
    case 'queued':
      return m.status === 'QUEUED';
    case 'complete':
      return m.status === 'COMPLETE';
    case 'failed':
      return m.status === 'FAILED' || m.status === 'CANCELLED';
    case 'unknown':
      return m.status === 'UNKNOWN';
  }
}

export function filterMissions(
  s: DashboardSnapshot,
  f: MissionFilter,
  nowMs = Date.now(),
): Mission[] {
  const out = s.missions.filter(
    (m) =>
      missionMatchesGroup(m, f.group, s) &&
      (f.priority === 'all' || m.priority === f.priority) &&
      (f.workerId === 'all' || m.assignedWorkerIds.includes(f.workerId)) &&
      text(f.q, m.id, m.title, m.objective, MISSION_STATUS_META[m.status].label),
  );
  const statusRank = (m: Mission) =>
    missionAwaitsFounder(m, s)
      ? 0
      : m.status === 'BLOCKED'
        ? 1
        : isMissionInFlight(m)
          ? 2
          : m.status === 'QUEUED'
            ? 3
            : m.status === 'UNKNOWN'
              ? 4
              : m.status === 'FAILED'
                ? 5
                : 6;
  const elapsed = (m: Mission) =>
    m.startedAt ? (Date.parse(m.completedAt ?? '') || nowMs) - Date.parse(m.startedAt) : -1;
  const cmp: Record<MissionSort, (a: Mission, b: Mission) => number> = {
    status: (a, b) =>
      statusRank(a) - statusRank(b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    elapsed: (a, b) => elapsed(b) - elapsed(a),
    id: () => 0,
  };
  return out.sort((a, b) => cmp[f.sort](a, b) || a.id.localeCompare(b.id));
}

/* --------------------------------- Workers --------------------------------- */

export type WorkerFlag = 'all' | 'active' | 'blocked' | 'founder' | 'idle' | 'failed' | 'unknown';

export interface WorkerFilter {
  q: string;
  flag: WorkerFlag;
  state: WorkerState | 'all';
  crewId: string | 'all';
  roomId: string | 'all';
  authority: 'all' | 'granted' | 'none';
  sort: WorkerSort;
}

/** `attention`: waiting for Founder, blocked, failed, unknown, active, then idle. */
export type WorkerSort = 'attention' | 'name' | 'longest-in-state';

export const DEFAULT_WORKER_FILTER: WorkerFilter = {
  q: '',
  flag: 'all',
  state: 'all',
  crewId: 'all',
  roomId: 'all',
  authority: 'all',
  sort: 'attention',
};

const ACTIVE = new Set<WorkerState>(['PLANNING', 'WORKING', 'REVIEWING', 'CERTIFYING']);

export function workerMatchesFlag(
  w: Worker,
  flag: WorkerFlag,
  s: Pick<DashboardSnapshot, 'approvals'>,
): boolean {
  switch (flag) {
    case 'all':
      return true;
    case 'active':
      return ACTIVE.has(w.state);
    case 'blocked':
      return w.state === 'BLOCKED' || (w.blockers.length > 0 && !isWaitingForFounder(w, s));
    case 'founder':
      return isWaitingForFounder(w, s);
    case 'idle':
      return w.state === 'IDLE' || w.state === 'COMPLETE';
    case 'failed':
      return w.state === 'FAILED' || w.state === 'STOPPED';
    case 'unknown':
      return w.state === 'UNKNOWN';
  }
}

export function filterWorkers(
  s: DashboardSnapshot,
  f: WorkerFilter,
  roomOf: (w: Worker) => string | undefined = () => undefined,
): Worker[] {
  const out = s.workers.filter(
    (w) =>
      workerMatchesFlag(w, f.flag, s) &&
      (f.state === 'all' || w.state === f.state) &&
      (f.crewId === 'all' || w.crewId === f.crewId) &&
      (f.roomId === 'all' || roomOf(w) === f.roomId) &&
      (f.authority === 'all' ||
        (f.authority === 'granted' ? w.authority.length > 0 : w.authority.length === 0)) &&
      text(
        f.q,
        w.id,
        w.name,
        w.role,
        w.currentActivity,
        w.currentMissionId,
        WORKER_STATE_META[w.state].label,
      ),
  );
  const rank = (w: Worker) =>
    isWaitingForFounder(w, s)
      ? 0
      : workerMatchesFlag(w, 'blocked', s)
        ? 1
        : workerMatchesFlag(w, 'failed', s)
          ? 2
          : w.state === 'UNKNOWN'
            ? 3
            : ACTIVE.has(w.state)
              ? 4
              : 5;
  const cmp: Record<WorkerSort, (a: Worker, b: Worker) => number> = {
    // Stable by name within a rank, so the order never jitters between syncs.
    attention: (a, b) => rank(a) - rank(b),
    name: () => 0,
    'longest-in-state': (a, b) => a.stateSince.localeCompare(b.stateSince),
  };
  return out.sort((a, b) => cmp[f.sort](a, b) || a.name.localeCompare(b.name));
}

/* -------------------------------- Approvals -------------------------------- */

export type ApprovalView = 'open' | 'held' | 'decided' | 'unknown' | 'all';
export interface ApprovalFilter {
  q: string;
  view: ApprovalView;
  risk: RiskLevel | 'all';
  sort: 'oldest' | 'risk' | 'newest';
}
export const DEFAULT_APPROVAL_FILTER: ApprovalFilter = {
  q: '',
  view: 'all',
  risk: 'all',
  sort: 'oldest',
};
const RISK_RANK: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function approvalMatchesView(a: ApprovalRequest, v: ApprovalView): boolean {
  switch (v) {
    case 'all':
      return true;
    case 'open':
      return a.status === 'PENDING';
    case 'held':
      return a.status === 'HELD';
    case 'unknown':
      return a.status === 'UNKNOWN';
    case 'decided':
      return !isOpenForDecision(a) && a.status !== 'UNKNOWN';
  }
}

export function filterApprovals(s: DashboardSnapshot, f: ApprovalFilter): ApprovalRequest[] {
  const out = s.approvals.filter(
    (a) =>
      approvalMatchesView(a, f.view) &&
      (f.risk === 'all' || a.risk === f.risk) &&
      text(
        f.q,
        a.id,
        a.title,
        a.action,
        a.missionId,
        a.requestedBy,
        s.workers.find((w) => w.id === a.requestedBy)?.name,
      ),
  );
  const cmp = {
    oldest: (a: ApprovalRequest, b: ApprovalRequest) => a.requestedAt.localeCompare(b.requestedAt),
    newest: (a: ApprovalRequest, b: ApprovalRequest) => b.requestedAt.localeCompare(a.requestedAt),
    risk: (a: ApprovalRequest, b: ApprovalRequest) =>
      RISK_RANK[a.risk] - RISK_RANK[b.risk] || a.requestedAt.localeCompare(b.requestedAt),
  }[f.sort];
  return out.sort(cmp);
}

/* ---------------------------------- Alerts --------------------------------- */

export interface AlertFilter {
  q: string;
  severity: AlertSeverity | 'ALL';
  humanOnly: boolean;
  sort: 'severity' | 'newest' | 'oldest';
}
export const DEFAULT_ALERT_FILTER: AlertFilter = {
  q: '',
  severity: 'ALL',
  humanOnly: false,
  sort: 'severity',
};
const SEVERITY_RANK: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  NOTICE: 2,
  INFO: 3,
};

export function filterAlerts(alerts: readonly Alert[], f: AlertFilter): Alert[] {
  const newest = (a: Alert, b: Alert) => b.raisedAt.localeCompare(a.raisedAt);
  const cmp = {
    severity: (a: Alert, b: Alert) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    newest,
    oldest: (a: Alert, b: Alert) => -newest(a, b),
  }[f.sort];
  return alerts
    .filter(
      (a) =>
        (f.severity === 'ALL' || a.severity === f.severity) &&
        (!f.humanOnly || a.humanActionRequired) &&
        text(
          f.q,
          a.id,
          a.title,
          a.whatHappened,
          a.attention,
          ALERT_SEVERITY_META[a.severity].label,
          ...a.affected.map((x) => x.label),
        ),
    )
    .sort((a, b) => cmp(a, b) || newest(a, b) || a.id.localeCompare(b.id));
}

/** Count of fields that differ from defaults (for "Reset (n)"). */
export function activeFilterCount<T extends object>(f: T, defaults: T): number {
  return (Object.keys(defaults) as (keyof T)[]).filter(
    (k) => k !== ('sort' as keyof T) && f[k] !== defaults[k],
  ).length;
}
