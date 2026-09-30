import type { DashboardEvent } from './events';
import type { DashboardSnapshot } from './snapshot';
import { WORKER_STATE_META } from './status';

export interface EventDescription {
  /** Short verb phrase, e.g. "Review passed". */
  title: string;
  /** Optional one-line detail. */
  detail?: string;
}

/**
 * Human readable rendering of a structured event. Names are resolved from the
 * snapshot at render time so the event log itself stays pure data.
 */
export function describeEvent(e: DashboardEvent, s: DashboardSnapshot): EventDescription {
  const worker = e.workerId ? (s.workers.find((w) => w.id === e.workerId)?.name ?? e.workerId) : '';
  switch (e.kind) {
    case 'mission.created':
      return { title: 'Mission created', detail: e.payload.mission.title };
    case 'worker.assigned':
      return { title: 'Worker assigned', detail: worker };
    case 'work.started':
      return { title: 'Work started', detail: e.payload.activity };
    case 'worker.state_changed':
      return {
        title: `${worker} → ${WORKER_STATE_META[e.payload.state].label}`,
        detail: e.payload.activity,
      };
    case 'task.progress':
      return { title: 'Progress update', detail: `${Math.round(e.payload.progress * 100)}%` };
    case 'task.completed':
      return { title: 'Task completed', detail: e.payload.taskId };
    case 'artifact.produced':
      return { title: 'Artifact produced', detail: e.payload.artifact.title };
    case 'review.requested':
      return { title: 'Review requested' };
    case 'review.passed':
      return { title: 'Review passed', detail: e.payload.summary };
    case 'review.failed':
      return { title: 'Review failed', detail: e.payload.summary };
    case 'certification.updated':
      return { title: 'Certification updated', detail: e.payload.status.replace('_', ' ') };
    case 'approval.requested':
      return { title: 'Approval requested', detail: e.payload.request.title };
    case 'approval.decided': {
      const verb = { APPROVE: 'granted', DENY: 'denied', HOLD: 'placed on hold' }[
        e.payload.record.decision
      ];
      const simulated = e.payload.record.delivery === 'simulated' ? ' (simulated)' : '';
      return {
        title: `Approval ${verb}${simulated}`,
        detail: `by ${e.payload.record.decidedBy}`,
      };
    }
    case 'mission.completed':
      return { title: 'Mission complete', detail: e.payload.result.summary };
    case 'mission.failed':
      return { title: 'Mission failed', detail: e.payload.result.summary };
    case 'worker.blocked':
      return { title: `${worker} blocked`, detail: e.payload.blocker.description };
    case 'worker.unblocked':
      return { title: `${worker} unblocked` };
    case 'alert.raised':
      return { title: `${e.payload.alert.severity}: ${e.payload.alert.title}` };
    case 'alert.acknowledged':
      return { title: 'Alert acknowledged', detail: `by ${e.payload.by}` };
    case 'alert.resolved':
      return { title: 'Alert resolved' };
    case 'health.updated':
      return { title: 'System health updated', detail: e.payload.health.status };
    case 'message.posted':
      return {
        title:
          e.payload.message.direction === 'to-worker' ? `Message to ${worker}` : `${worker} says`,
        detail: e.payload.message.body,
      };
  }
}
