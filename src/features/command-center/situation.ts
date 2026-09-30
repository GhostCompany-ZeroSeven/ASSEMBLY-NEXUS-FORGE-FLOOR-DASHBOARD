import type { ConnectionStatus } from '@/adapters/types';
import { displayMode } from '@/domain/provenance';
import { isStale, openAlerts, pendingApprovals } from '@/domain/selectors';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { DataMode, DataProvenance, HealthStatus, Mission } from '@/domain/types';
import { isWaitingForFounder } from '@/features/filters/filters';

/**
 * The seven questions the Founder asks first, answered from the snapshot only.
 * No invented urgency: counts are what the data says, nothing is escalated here.
 */
export interface Situation {
  founder: {
    approvals: number;
    humanAlerts: number;
    workersWaiting: number;
    oldestRequestAt?: string;
  };
  data: { display: DataMode; transport?: DataProvenance['transport'] };
  backend: { health: HealthStatus; connection: ConnectionStatus; stale: boolean; partial: boolean };
  running: { missions: number; workersBusy: number; workersTotal: number };
  blocked: { workers: number; missions: number };
  failed: {
    missions: number;
    workers: number;
    latest?: Pick<Mission, 'id' | 'title' | 'completedAt'>;
  };
  completed: { count: number; latest?: Pick<Mission, 'id' | 'title' | 'completedAt'> };
  /**
   * Resources the latest sync could not load. Answers that depend on them are
   * UNKNOWN, never "Nothing": an empty list from a failed fetch is not reassurance.
   */
  unavailable: Record<SituationResource, boolean>;
}

export type SituationResource = 'workers' | 'missions' | 'approvals' | 'alerts';
const RESOURCES: readonly SituationResource[] = ['workers', 'missions', 'approvals', 'alerts'];

const BUSY = new Set(['PLANNING', 'WORKING', 'REVIEWING', 'CERTIFYING']);

export function selectSituation(
  s: DashboardSnapshot,
  connection: ConnectionStatus,
  nowMs: number,
): Situation {
  const gates = pendingApprovals(s).filter((a) => a.status === 'PENDING' || a.status === 'HELD');
  const latest = (status: Mission['status']) =>
    s.missions
      .filter((m) => m.status === status)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
  const failedSources = new Set(
    s.quality.issues.filter((i) => i.severity === 'error').map((i) => i.source),
  );
  const unavailable = Object.fromEntries(RESOURCES.map((r) => [r, failedSources.has(r)])) as Record<
    SituationResource,
    boolean
  >;
  return {
    unavailable,
    founder: {
      approvals: gates.length,
      humanAlerts: openAlerts(s).filter((a) => a.humanActionRequired && !a.acknowledgedAt).length,
      workersWaiting: s.workers.filter((w) => isWaitingForFounder(w, s)).length,
      oldestRequestAt: gates.map((g) => g.requestedAt).sort()[0],
    },
    data: { display: displayMode(s.provenance, connection), transport: s.provenance.transport },
    backend: {
      health: s.health.status,
      connection,
      stale: isStale(s, nowMs),
      partial: s.quality.partial,
    },
    running: {
      missions: s.missions.filter((m) => m.status === 'ACTIVE' || m.status === 'WAITING_REVIEW')
        .length,
      workersBusy: s.workers.filter((w) => BUSY.has(w.state)).length,
      workersTotal: s.workers.length,
    },
    blocked: {
      workers: s.workers.filter(
        (w) => w.state === 'BLOCKED' || (w.blockers.length > 0 && !isWaitingForFounder(w, s)),
      ).length,
      missions: s.missions.filter((m) => m.status === 'BLOCKED').length,
    },
    failed: {
      missions: s.missions.filter((m) => m.status === 'FAILED').length,
      workers: s.workers.filter((w) => w.state === 'FAILED').length,
      latest: latest('FAILED'),
    },
    completed: {
      count: s.missions.filter((m) => m.status === 'COMPLETE').length,
      latest: latest('COMPLETE'),
    },
  };
}
