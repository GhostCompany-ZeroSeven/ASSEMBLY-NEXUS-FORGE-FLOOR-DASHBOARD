import { en, type Messages } from '@/i18n/en';
import type { DashboardEvent } from './events';
import type { DashboardSnapshot } from './snapshot';

export interface EventDescription {
  /** Short verb phrase, e.g. "Review passed". */
  title: string;
  /** Optional one-line detail. */
  detail?: string;
}

/**
 * Human readable rendering of a structured event, in the given UI language.
 * Names are resolved from the snapshot at render time so the event log itself
 * stays language-free data. Backend-provided text (titles, summaries, message
 * bodies, decidedBy) is shown verbatim, never translated.
 */
export function describeEvent(
  e: DashboardEvent,
  s: DashboardSnapshot,
  m: Messages = en,
): EventDescription {
  const t = m.events;
  const worker = e.workerId ? (s.workers.find((w) => w.id === e.workerId)?.name ?? e.workerId) : '';
  switch (e.kind) {
    case 'mission.created':
      return { title: t.missionCreated, detail: e.payload.mission.title };
    case 'worker.assigned':
      return { title: t.workerAssigned, detail: worker };
    case 'work.started':
      return { title: t.workStarted, detail: e.payload.activity };
    case 'worker.state_changed':
      return {
        title: t.stateChanged(worker, m.status.worker[e.payload.state]),
        detail: e.payload.activity,
      };
    case 'task.progress':
      return { title: t.progress, detail: `${Math.round(e.payload.progress * 100)}%` };
    case 'task.completed':
      return { title: t.taskCompleted, detail: e.payload.taskId };
    case 'artifact.produced':
      return { title: t.artifactProduced, detail: e.payload.artifact.title };
    case 'review.requested':
      return { title: t.reviewRequested };
    case 'review.passed':
      return { title: t.reviewPassed, detail: e.payload.summary };
    case 'review.failed':
      return { title: t.reviewFailed, detail: e.payload.summary };
    case 'certification.updated':
      return { title: t.certificationUpdated, detail: m.status.certification[e.payload.status] };
    case 'approval.requested':
      return { title: t.approvalRequested, detail: e.payload.request.title };
    case 'approval.decided':
      return {
        title: t.approvalDecided(
          m.decision.past[e.payload.record.decision],
          e.payload.record.delivery === 'simulated',
        ),
        detail: m.common.by(e.payload.record.decidedBy),
      };
    case 'mission.completed':
      return { title: t.missionComplete, detail: e.payload.result.summary };
    case 'mission.failed':
      return { title: t.missionFailed, detail: e.payload.result.summary };
    case 'worker.blocked':
      return { title: t.blocked(worker), detail: e.payload.blocker.description };
    case 'worker.unblocked':
      return { title: t.unblocked(worker) };
    case 'alert.raised':
      return {
        title: t.alertRaised(m.status.severity[e.payload.alert.severity], e.payload.alert.title),
      };
    case 'alert.acknowledged':
      return { title: t.alertAcknowledged, detail: m.common.by(e.payload.by) };
    case 'alert.resolved':
      return { title: t.alertResolved };
    case 'health.updated':
      return { title: t.healthUpdated, detail: m.status.health[e.payload.health.status] };
    case 'message.posted':
      return {
        title:
          e.payload.message.direction === 'to-worker' ? t.messageTo(worker) : t.workerSays(worker),
        detail: e.payload.message.body,
      };
  }
}
