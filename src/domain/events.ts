import type {
  Alert,
  ApprovalDecisionRecord,
  ApprovalRequest,
  Artifact,
  Blocker,
  ISODateString,
  Mission,
  MissionResult,
  SystemHealth,
  WorkerMessage,
  WorkerState,
} from './types';

/**
 * Structured operational events. The activity stream, worker timelines and
 * snapshot reducer are all driven by these — never by free-form text.
 *
 * Each event has a discriminating `kind` and a typed `payload`.
 */
interface EventBase<K extends string, P> {
  id: string;
  kind: K;
  at: ISODateString;
  missionId?: string;
  workerId?: string;
  payload: P;
  /**
   * How this dashboard received the event, stamped by the ADAPTER on ingest
   * (never read from backend data). Observability only: it says nothing about
   * whether the event's claims are authorized.
   */
  via?: EventVia;
}

export type EventVia = 'stream' | 'poll' | 'simulated';

export type MissionCreatedEvent = EventBase<'mission.created', { mission: Mission }>;
export type WorkerAssignedEvent = EventBase<'worker.assigned', { taskId?: string }>;
export type WorkStartedEvent = EventBase<'work.started', { taskId?: string; activity?: string }>;
export type WorkerStateChangedEvent = EventBase<
  'worker.state_changed',
  { state: WorkerState; activity?: string; progress?: number | null }
>;
export type TaskProgressEvent = EventBase<
  'task.progress',
  { taskId: string; progress: number; missionProgress?: number | null }
>;
export type TaskCompletedEvent = EventBase<'task.completed', { taskId: string }>;
export type ArtifactProducedEvent = EventBase<'artifact.produced', { artifact: Artifact }>;
export type ReviewRequestedEvent = EventBase<'review.requested', { reviewerId?: string }>;
export type ReviewPassedEvent = EventBase<'review.passed', { summary?: string }>;
export type ReviewFailedEvent = EventBase<
  'review.failed',
  { summary?: string; findings?: string[] }
>;
export type CertificationUpdatedEvent = EventBase<
  'certification.updated',
  { status: Mission['certification'] }
>;
export type ApprovalRequestedEvent = EventBase<'approval.requested', { request: ApprovalRequest }>;
export type ApprovalDecidedEvent = EventBase<
  'approval.decided',
  { approvalId: string; record: ApprovalDecisionRecord }
>;
export type MissionCompletedEvent = EventBase<'mission.completed', { result: MissionResult }>;
export type MissionFailedEvent = EventBase<'mission.failed', { result: MissionResult }>;
export type WorkerBlockedEvent = EventBase<'worker.blocked', { blocker: Blocker }>;
export type WorkerUnblockedEvent = EventBase<'worker.unblocked', { blockerId: string }>;
export type AlertRaisedEvent = EventBase<'alert.raised', { alert: Alert }>;
export type AlertAcknowledgedEvent = EventBase<
  'alert.acknowledged',
  { alertId: string; by: string }
>;
export type AlertResolvedEvent = EventBase<'alert.resolved', { alertId: string }>;
export type HealthUpdatedEvent = EventBase<'health.updated', { health: SystemHealth }>;
export type MessageEvent = EventBase<'message.posted', { message: WorkerMessage }>;

export type DashboardEvent =
  | MissionCreatedEvent
  | WorkerAssignedEvent
  | WorkStartedEvent
  | WorkerStateChangedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | ArtifactProducedEvent
  | ReviewRequestedEvent
  | ReviewPassedEvent
  | ReviewFailedEvent
  | CertificationUpdatedEvent
  | ApprovalRequestedEvent
  | ApprovalDecidedEvent
  | MissionCompletedEvent
  | MissionFailedEvent
  | WorkerBlockedEvent
  | WorkerUnblockedEvent
  | AlertRaisedEvent
  | AlertAcknowledgedEvent
  | AlertResolvedEvent
  | HealthUpdatedEvent
  | MessageEvent;

export type DashboardEventKind = DashboardEvent['kind'];

/** Broad buckets used for filtering and colouring the activity stream. */
export type EventCategory = 'mission' | 'worker' | 'review' | 'approval' | 'alert' | 'system';

export const EVENT_CATEGORY: Record<DashboardEventKind, EventCategory> = {
  'mission.created': 'mission',
  'mission.completed': 'mission',
  'mission.failed': 'mission',
  'worker.assigned': 'worker',
  'work.started': 'worker',
  'worker.state_changed': 'worker',
  'worker.blocked': 'worker',
  'worker.unblocked': 'worker',
  'task.progress': 'worker',
  'task.completed': 'worker',
  'artifact.produced': 'mission',
  'message.posted': 'worker',
  'review.requested': 'review',
  'review.passed': 'review',
  'review.failed': 'review',
  'certification.updated': 'review',
  'approval.requested': 'approval',
  'approval.decided': 'approval',
  'alert.raised': 'alert',
  'alert.acknowledged': 'alert',
  'alert.resolved': 'alert',
  'health.updated': 'system',
};

/** Events considered too chatty for the default activity stream view. */
export const LOW_SIGNAL_EVENTS: ReadonlySet<DashboardEventKind> = new Set([
  'task.progress',
  'health.updated',
]);
