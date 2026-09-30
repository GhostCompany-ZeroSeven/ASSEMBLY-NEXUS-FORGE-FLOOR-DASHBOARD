import type { DashboardEvent } from './events';
import type { DashboardSnapshot } from './snapshot';
import { ALERT_SEVERITY_META } from './status';
import type { Alert, ApprovalRequest, Mission, Worker } from './types';

export interface OverviewStats {
  activeMissions: number;
  queuedMissions: number;
  completedMissions: number;
  failedMissions: number;
  workersTotal: number;
  workersBusy: number;
  workersBlocked: number;
  reviewsOpen: number;
  approvalsPending: number;
  alertsOpen: number;
  alertsCritical: number;
}

const BUSY_STATES = new Set<Worker['state']>(['PLANNING', 'WORKING', 'REVIEWING', 'CERTIFYING']);
const IN_FLIGHT = new Set<Mission['status']>([
  'ACTIVE',
  'WAITING_REVIEW',
  'WAITING_APPROVAL',
  'BLOCKED',
]);

export function isMissionInFlight(m: Mission): boolean {
  return IN_FLIGHT.has(m.status);
}

export function selectOverview(s: DashboardSnapshot): OverviewStats {
  const open = openAlerts(s);
  return {
    activeMissions: s.missions.filter(isMissionInFlight).length,
    queuedMissions: s.missions.filter((m) => m.status === 'QUEUED').length,
    completedMissions: s.missions.filter((m) => m.status === 'COMPLETE').length,
    failedMissions: s.missions.filter((m) => m.status === 'FAILED').length,
    workersTotal: s.workers.length,
    workersBusy: s.workers.filter((w) => BUSY_STATES.has(w.state)).length,
    workersBlocked: s.workers.filter((w) => w.state === 'BLOCKED' || w.state === 'FAILED').length,
    reviewsOpen: s.missions.filter(
      (m) => m.review.status === 'REQUESTED' || m.review.status === 'IN_REVIEW',
    ).length,
    approvalsPending: pendingApprovals(s).length,
    alertsOpen: open.length,
    alertsCritical: open.filter((a) => a.severity === 'CRITICAL').length,
  };
}

/** Alerts that are not resolved, most severe then newest first. */
export function openAlerts(s: DashboardSnapshot): Alert[] {
  return s.alerts
    .filter((a) => !a.resolvedAt)
    .sort(
      (a, b) =>
        ALERT_SEVERITY_META[b.severity].rank - ALERT_SEVERITY_META[a.severity].rank ||
        b.raisedAt.localeCompare(a.raisedAt),
    );
}

/** Critical alerts that are neither resolved nor acknowledged trigger Red Alert. */
export function redAlertActive(s: DashboardSnapshot): boolean {
  return s.alerts.some((a) => a.severity === 'CRITICAL' && !a.resolvedAt && !a.acknowledgedAt);
}

export function pendingApprovals(s: DashboardSnapshot): ApprovalRequest[] {
  return s.approvals
    .filter((a) => a.status === 'PENDING' || a.status === 'HELD')
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export function eventsForWorker(s: DashboardSnapshot, workerId: string): DashboardEvent[] {
  return s.events.filter((e) => e.workerId === workerId);
}

export function eventsForMission(s: DashboardSnapshot, missionId: string): DashboardEvent[] {
  return s.events.filter((e) => e.missionId === missionId);
}

export function findWorker(s: DashboardSnapshot, id: string | undefined): Worker | undefined {
  return id ? s.workers.find((w) => w.id === id) : undefined;
}

export function findMission(s: DashboardSnapshot, id: string | undefined): Mission | undefined {
  return id ? s.missions.find((m) => m.id === id) : undefined;
}

/** Stable ordering for mission lists: in flight → queued → finished. */
export function sortMissions(missions: readonly Mission[]): Mission[] {
  const rank = (m: Mission) =>
    isMissionInFlight(m) ? 0 : m.status === 'QUEUED' ? 1 : m.status === 'FAILED' ? 2 : 3;
  return [...missions].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/**
 * True when the adapter syncs from a backend and the last full sync is older than
 * its stale threshold, or when no full sync has ever succeeded.
 * Adapters that do not sync (demo) never report stale.
 */
export function isStale(s: DashboardSnapshot, nowMs: number): boolean {
  const { staleAfterMs, lastSuccessfulSyncAt } = s.quality;
  if (staleAfterMs === undefined) return false;
  if (!lastSuccessfulSyncAt) return true;
  return nowMs - Date.parse(lastSuccessfulSyncAt) > staleAfterMs;
}
