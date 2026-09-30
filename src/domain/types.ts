/**
 * Normalized domain model for the Forge Floor dashboard.
 *
 * Every adapter (demo, Assembly Nexus, REST, event stream, ...) translates its
 * backend's shapes into these types. UI components depend ONLY on this module,
 * never on backend-specific payloads.
 *
 * Conventions:
 * - All timestamps are ISO-8601 strings (UTC). Absent means "unknown", never "zero".
 * - Optional numeric fields are `null`/`undefined` when the backend does not
 *   provide them. The UI must not invent precision it was not given.
 */

export type ISODateString = string;

/* ------------------------------------------------------------------------- */
/* Provenance                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Where the data on screen comes from. The UI always surfaces this so that
 * simulated state is never mistaken for a live, connected backend.
 */
export type DataMode = 'demo' | 'live' | 'replay' | 'disconnected';

export interface DataProvenance {
  mode: DataMode;
  /** Adapter identifier, e.g. `demo`, `assembly-nexus`, `rest`. */
  adapterId: string;
  /** Human readable adapter label. */
  adapterLabel: string;
  /**
   * True only when a real backend connection has been established and
   * verified by the adapter. Demo adapters MUST report `false`.
   */
  verifiedBackend: boolean;
  /** Short note displayed next to the provenance badge. */
  note?: string;
  /**
   * Optional environment label reported by the backend (e.g. `mock`, `staging`).
   * Shown next to the provenance badge so test backends are not mistaken for production.
   */
  environment?: string;
  /**
   * How updates arrive: `polling`, `sse` (push stream healthy), or
   * `polling-fallback` (a configured stream failed; polling explicitly took over).
   */
  transport?: 'polling' | 'sse' | 'polling-fallback';
}

/* ------------------------------------------------------------------------- */
/* Workers                                                                   */
/* ------------------------------------------------------------------------- */

export const WORKER_STATES = [
  'IDLE',
  'PLANNING',
  'WORKING',
  'WAITING',
  'BLOCKED',
  'REVIEWING',
  'CERTIFYING',
  'COMPLETE',
  'FAILED',
  'STOPPED',
  /** The backend reported a state this dashboard does not recognise. */
  'UNKNOWN',
] as const;

export type WorkerState = (typeof WORKER_STATES)[number];

/**
 * A capability describes what a worker is technically ABLE to do.
 * It never implies permission. Authority is modelled separately.
 */
export interface Capability {
  id: string;
  label: string;
}

/**
 * An explicit, human-granted permission. Workers have none by default.
 * Only a human authority (see `DashboardConfig.governance`) can grant it,
 * and the dashboard never grants authority on its own.
 */
export interface AuthorityGrant {
  id: string;
  label: string;
  grantedBy: string;
  grantedAt: ISODateString;
  /** Scope the grant is limited to, e.g. a mission id or repository. */
  scope?: string;
  expiresAt?: ISODateString;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  /** Crew/team the worker belongs to (e.g. `forge`, `snow-wolf`). */
  crewId: string;
  /** Character/avatar key resolved through the character registry. */
  characterId: string;
  /** Room the worker returns to when doing their own specialty. */
  homeRoomId: string;
  state: WorkerState;
  /** When the worker entered the current state. */
  stateSince: ISODateString;
  currentMissionId?: string;
  currentTaskId?: string;
  /** Short human readable description of what the worker is doing now. */
  currentActivity?: string;
  /** 0..1 progress on the current task, if the backend reports it. */
  progress?: number | null;
  blockers: Blocker[];
  capabilities: Capability[];
  authority: AuthorityGrant[];
  /** Id of the most recent event involving this worker. */
  lastEventId?: string;
}

export interface Blocker {
  id: string;
  description: string;
  /** Mission/task/approval that must resolve for work to continue. */
  dependsOn?: { kind: 'mission' | 'task' | 'approval' | 'external'; id: string };
  since: ISODateString;
}

/* ------------------------------------------------------------------------- */
/* Missions, tasks, artifacts, reviews                                       */
/* ------------------------------------------------------------------------- */

export type MissionStatus =
  | 'QUEUED'
  | 'ACTIVE'
  | 'WAITING_REVIEW'
  | 'WAITING_APPROVAL'
  | 'BLOCKED'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED'
  /** Unrecognised backend status. Never treated as healthy or in flight. */
  | 'UNKNOWN';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'FAILED' | 'SKIPPED';

export interface Task {
  id: string;
  missionId: string;
  title: string;
  status: TaskStatus;
  assigneeId?: string;
  progress?: number | null;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  dependsOn: string[];
}

export type ArtifactKind =
  'code' | 'document' | 'report' | 'test-result' | 'build' | 'dataset' | 'link' | 'other';

export interface Artifact {
  id: string;
  missionId: string;
  producedBy?: string;
  kind: ArtifactKind;
  title: string;
  /** Optional external reference. Never auto-fetched by the dashboard. */
  uri?: string;
  summary?: string;
  createdAt: ISODateString;
}

export type ReviewStatus = 'NOT_REQUESTED' | 'REQUESTED' | 'IN_REVIEW' | 'PASSED' | 'FAILED';

export interface Review {
  id: string;
  missionId: string;
  reviewerId?: string;
  status: ReviewStatus;
  requestedAt?: ISODateString;
  completedAt?: ISODateString;
  findings?: string[];
  summary?: string;
}

export type CertificationStatus =
  'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'CERTIFIED' | 'REJECTED';

/**
 * Estimate of the mission duration. Only present when the backend provides
 * one — the UI shows "NO ESTIMATE" rather than inventing a number.
 */
export interface MissionEstimate {
  durationMs: number;
  /** Who/what produced the estimate. */
  source: string;
  confidence?: 'low' | 'medium' | 'high';
}

export interface MissionResult {
  outcome: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
  summary: string;
  nextAction?: string;
}

export interface Mission {
  id: string;
  title: string;
  objective: string;
  status: MissionStatus;
  priority: 'low' | 'normal' | 'high' | 'critical';
  assignedWorkerIds: string[];
  createdAt: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  estimate?: MissionEstimate;
  /** 0..1, if the backend reports it. */
  progress?: number | null;
  /** Other mission ids that must complete first. */
  dependsOn: string[];
  tasks: Task[];
  artifacts: Artifact[];
  review: Review;
  certification: CertificationStatus;
  /** Approval request ids gating this mission. */
  approvalIds: string[];
  result?: MissionResult;
}

/* ------------------------------------------------------------------------- */
/* Governance: approvals                                                     */
/* ------------------------------------------------------------------------- */

export type ApprovalDecision = 'APPROVE' | 'DENY' | 'HOLD';

export type ApprovalStatus =
  | 'PENDING'
  | 'HELD'
  | 'APPROVED'
  | 'DENIED'
  | 'EXPIRED'
  | 'WITHDRAWN'
  /** Unrecognised backend status. Cannot be decided from the dashboard. */
  | 'UNKNOWN';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  title: string;
  /** Precisely what will happen if approved. */
  action: string;
  rationale: string;
  risk: RiskLevel;
  /** Whether the action can be undone after it is carried out. */
  reversible: boolean;
  missionId?: string;
  /** Worker that asked. A request is never an authority grant by itself. */
  requestedBy: string;
  requestedAt: ISODateString;
  status: ApprovalStatus;
  /** Human authority required to decide, e.g. `Founder #0007`. */
  requiredAuthority: string;
  expiresAt?: ISODateString;
  decision?: ApprovalDecisionRecord;
}

export interface ApprovalDecisionRecord {
  decision: ApprovalDecision;
  decidedBy: string;
  decidedAt: ISODateString;
  note?: string;
  /**
   * `delivered` — the backend acknowledged the decision.
   * `simulated` — recorded locally by a demo adapter; no backend received it.
   */
  delivery: 'delivered' | 'simulated';
}

/* ------------------------------------------------------------------------- */
/* Alerts                                                                    */
/* ------------------------------------------------------------------------- */

export const ALERT_SEVERITIES = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  /** WHAT HAPPENED */
  whatHappened: string;
  /** WHAT IS AFFECTED */
  affected: { kind: 'mission' | 'worker' | 'system' | 'approval'; id: string; label: string }[];
  /** WHAT NEEDS ATTENTION */
  attention: string;
  /** WHETHER FOUNDER / HUMAN ACTION IS REQUIRED */
  humanActionRequired: boolean;
  raisedAt: ISODateString;
  acknowledgedAt?: ISODateString;
  resolvedAt?: ISODateString;
}

/* ------------------------------------------------------------------------- */
/* System health                                                             */
/* ------------------------------------------------------------------------- */

export type HealthStatus = 'NOMINAL' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

export interface HealthComponent {
  id: string;
  label: string;
  status: HealthStatus;
  detail?: string;
  latencyMs?: number | null;
}

export interface SystemHealth {
  status: HealthStatus;
  checkedAt: ISODateString;
  components: HealthComponent[];
}

/* ------------------------------------------------------------------------- */
/* Messages (worker conversation)                                            */
/* ------------------------------------------------------------------------- */

export interface WorkerMessage {
  id: string;
  workerId: string;
  direction: 'from-worker' | 'to-worker';
  author: string;
  body: string;
  sentAt: ISODateString;
  delivery: 'delivered' | 'simulated' | 'pending' | 'failed';
}
