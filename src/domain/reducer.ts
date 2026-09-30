import type { DashboardEvent } from './events';
import { MAX_EVENTS, MAX_MESSAGES, type DashboardSnapshot } from './snapshot';
import type { ApprovalDecision, ApprovalStatus, Mission, Worker } from './types';

/**
 * Pure reducer: applies a structured event to a snapshot and returns a new
 * snapshot. Shared by the demo adapter and available to any event-stream
 * adapter (WebSocket, SSE, ...) that receives incremental events.
 *
 * Side effects are deliberately limited to what the event names. Adapters that
 * want a worker to change state should emit `worker.state_changed` explicitly.
 */
export function applyEvent(snapshot: DashboardSnapshot, event: DashboardEvent): DashboardSnapshot {
  if (snapshot.events.some((e) => e.id === event.id)) return snapshot; // idempotent

  let next: DashboardSnapshot = {
    ...snapshot,
    generatedAt: event.at,
    events: appendBounded(snapshot.events, event),
  };

  next = reduceDomain(next, event);

  if (event.workerId) {
    next = updateWorker(next, event.workerId, (w) => ({ ...w, lastEventId: event.id }));
  }
  return next;
}

export function applyEvents(
  snapshot: DashboardSnapshot,
  events: readonly DashboardEvent[],
): DashboardSnapshot {
  return events.reduce(applyEvent, snapshot);
}

const DECISION_STATUS: Record<ApprovalDecision, ApprovalStatus> = {
  APPROVE: 'APPROVED',
  DENY: 'DENIED',
  HOLD: 'HELD',
};

function reduceDomain(s: DashboardSnapshot, e: DashboardEvent): DashboardSnapshot {
  switch (e.kind) {
    case 'mission.created':
      if (s.missions.some((m) => m.id === e.payload.mission.id)) return s;
      return { ...s, missions: [...s.missions, e.payload.mission] };

    case 'worker.assigned': {
      if (!e.workerId || !e.missionId) return s;
      const { workerId, missionId } = e;
      let next = updateMission(s, missionId, (m) => ({
        ...m,
        assignedWorkerIds: m.assignedWorkerIds.includes(workerId)
          ? m.assignedWorkerIds
          : [...m.assignedWorkerIds, workerId],
        tasks: m.tasks.map((t) => (t.id === e.payload.taskId ? { ...t, assigneeId: workerId } : t)),
      }));
      next = updateWorker(next, workerId, (w) => ({
        ...w,
        currentMissionId: missionId,
        currentTaskId: e.payload.taskId ?? w.currentTaskId,
      }));
      return next;
    }

    case 'work.started': {
      let next = s;
      if (e.missionId) {
        next = updateMission(next, e.missionId, (m) => ({
          ...m,
          status: m.status === 'QUEUED' ? 'ACTIVE' : m.status,
          startedAt: m.startedAt ?? e.at,
          tasks: m.tasks.map((t) =>
            t.id === e.payload.taskId
              ? { ...t, status: 'IN_PROGRESS', startedAt: t.startedAt ?? e.at }
              : t,
          ),
        }));
      }
      if (e.workerId) {
        next = updateWorker(next, e.workerId, (w) =>
          withState(
            { ...w, currentActivity: e.payload.activity ?? w.currentActivity },
            'WORKING',
            e.at,
          ),
        );
      }
      return next;
    }

    case 'worker.state_changed':
      if (!e.workerId) return s;
      return updateWorker(s, e.workerId, (w) =>
        // A state change older than the worker's current state (late or
        // out-of-order delivery) must not roll the worker back. The event is
        // still kept in the log; only the current state ignores it.
        isOlder(e.at, w.stateSince)
          ? w
          : withState(
              {
                ...w,
                currentActivity: e.payload.activity ?? w.currentActivity,
                progress: e.payload.progress !== undefined ? e.payload.progress : w.progress,
              },
              e.payload.state,
              e.at,
            ),
      );

    case 'task.progress': {
      let next = s;
      if (e.missionId) {
        next = updateMission(next, e.missionId, (m) => ({
          ...m,
          progress:
            e.payload.missionProgress !== undefined ? e.payload.missionProgress : m.progress,
          tasks: m.tasks.map((t) =>
            t.id === e.payload.taskId ? { ...t, progress: e.payload.progress } : t,
          ),
        }));
      }
      if (e.workerId) {
        next = updateWorker(next, e.workerId, (w) => ({ ...w, progress: e.payload.progress }));
      }
      return next;
    }

    case 'task.completed':
      if (!e.missionId) return s;
      return updateMission(s, e.missionId, (m) => ({
        ...m,
        tasks: m.tasks.map((t) =>
          t.id === e.payload.taskId ? { ...t, status: 'DONE', progress: 1, completedAt: e.at } : t,
        ),
      }));

    case 'artifact.produced':
      if (!e.missionId) return s;
      return updateMission(s, e.missionId, (m) =>
        m.artifacts.some((a) => a.id === e.payload.artifact.id)
          ? m
          : { ...m, artifacts: [...m.artifacts, e.payload.artifact] },
      );

    case 'review.requested':
      if (!e.missionId) return s;
      return updateMission(s, e.missionId, (m) => ({
        ...m,
        status: isTerminal(m) ? m.status : 'WAITING_REVIEW',
        review: {
          ...m.review,
          status: 'REQUESTED',
          requestedAt: e.at,
          reviewerId: e.payload.reviewerId ?? m.review.reviewerId,
        },
      }));

    case 'review.passed':
    case 'review.failed':
      if (!e.missionId) return s;
      return updateMission(s, e.missionId, (m) => ({
        ...m,
        status: m.status === 'WAITING_REVIEW' ? 'ACTIVE' : m.status,
        review: {
          ...m.review,
          status: e.kind === 'review.passed' ? 'PASSED' : 'FAILED',
          completedAt: e.at,
          summary: e.payload.summary ?? m.review.summary,
          findings: e.kind === 'review.failed' ? e.payload.findings : m.review.findings,
        },
      }));

    case 'certification.updated':
      if (!e.missionId) return s;
      return updateMission(s, e.missionId, (m) => ({ ...m, certification: e.payload.status }));

    case 'approval.requested': {
      const req = e.payload.request;
      if (s.approvals.some((a) => a.id === req.id)) return s;
      let next: DashboardSnapshot = { ...s, approvals: [...s.approvals, req] };
      if (req.missionId) {
        next = updateMission(next, req.missionId, (m) => ({
          ...m,
          status: isTerminal(m) ? m.status : 'WAITING_APPROVAL',
          approvalIds: m.approvalIds.includes(req.id) ? m.approvalIds : [...m.approvalIds, req.id],
        }));
      }
      return next;
    }

    case 'approval.decided': {
      const { approvalId, record } = e.payload;
      const approvals = s.approvals.map((a) =>
        a.id === approvalId
          ? { ...a, status: DECISION_STATUS[record.decision], decision: record }
          : a,
      );
      let next: DashboardSnapshot = { ...s, approvals };
      const req = approvals.find((a) => a.id === approvalId);
      if (req?.missionId) {
        next = updateMission(next, req.missionId, (m) => {
          if (isTerminal(m)) return m;
          if (record.decision === 'DENY') return { ...m, status: 'BLOCKED' };
          const gating = approvals.filter((a) => m.approvalIds.includes(a.id));
          const allApproved = gating.every((a) => a.status === 'APPROVED');
          return allApproved && m.status === 'WAITING_APPROVAL' ? { ...m, status: 'ACTIVE' } : m;
        });
      }
      return next;
    }

    case 'mission.completed':
    case 'mission.failed':
      if (!e.missionId) return s;
      return updateMission(s, e.missionId, (m) => ({
        ...m,
        status: e.kind === 'mission.completed' ? 'COMPLETE' : 'FAILED',
        completedAt: e.at,
        progress: e.kind === 'mission.completed' ? 1 : m.progress,
        result: e.payload.result,
      }));

    case 'worker.blocked':
      if (!e.workerId) return s;
      return updateWorker(s, e.workerId, (w) =>
        withState(
          {
            ...w,
            blockers: w.blockers.some((b) => b.id === e.payload.blocker.id)
              ? w.blockers
              : [...w.blockers, e.payload.blocker],
          },
          'BLOCKED',
          e.at,
        ),
      );

    case 'worker.unblocked':
      if (!e.workerId) return s;
      return updateWorker(s, e.workerId, (w) => {
        const blockers = w.blockers.filter((b) => b.id !== e.payload.blockerId);
        const resumed = blockers.length === 0 && w.state === 'BLOCKED';
        return resumed ? withState({ ...w, blockers }, 'WORKING', e.at) : { ...w, blockers };
      });

    case 'alert.raised': {
      const alert = e.payload.alert;
      const exists = s.alerts.some((a) => a.id === alert.id);
      return {
        ...s,
        alerts: exists
          ? s.alerts.map((a) => (a.id === alert.id ? alert : a))
          : [...s.alerts, alert],
      };
    }

    case 'alert.acknowledged':
      return {
        ...s,
        alerts: s.alerts.map((a) =>
          a.id === e.payload.alertId ? { ...a, acknowledgedAt: a.acknowledgedAt ?? e.at } : a,
        ),
      };

    case 'alert.resolved':
      return {
        ...s,
        alerts: s.alerts.map((a) =>
          a.id === e.payload.alertId ? { ...a, resolvedAt: a.resolvedAt ?? e.at } : a,
        ),
      };

    case 'health.updated':
      return { ...s, health: e.payload.health };

    case 'message.posted':
      if (s.messages.some((m) => m.id === e.payload.message.id)) return s;
      return { ...s, messages: [...s.messages, e.payload.message].slice(-MAX_MESSAGES) };
  }
}

function isTerminal(m: Mission): boolean {
  return m.status === 'COMPLETE' || m.status === 'FAILED' || m.status === 'CANCELLED';
}

function isOlder(at: string, than: string | undefined): boolean {
  const a = Date.parse(at);
  const b = than ? Date.parse(than) : NaN;
  return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
}

function withState(w: Worker, state: Worker['state'], at: string): Worker {
  return w.state === state ? w : { ...w, state, stateSince: at };
}

function appendBounded<T>(list: readonly T[], item: T): T[] {
  const next = [...list, item];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

export function updateMission(
  s: DashboardSnapshot,
  id: string,
  fn: (m: Mission) => Mission,
): DashboardSnapshot {
  if (!s.missions.some((m) => m.id === id)) return s;
  return { ...s, missions: s.missions.map((m) => (m.id === id ? fn(m) : m)) };
}

export function updateWorker(
  s: DashboardSnapshot,
  id: string,
  fn: (w: Worker) => Worker,
): DashboardSnapshot {
  if (!s.workers.some((w) => w.id === id)) return s;
  return { ...s, workers: s.workers.map((w) => (w.id === id ? fn(w) : w)) };
}
