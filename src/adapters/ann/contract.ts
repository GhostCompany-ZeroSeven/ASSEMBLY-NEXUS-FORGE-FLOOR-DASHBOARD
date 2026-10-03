/**
 * ANN dashboard feed contract, generation 1: the boundary between Assembly
 * Nexus operational truth and the Forge Floor dashboard.
 *
 *   raw source → envelope validation → normalization (normalize.ts)
 *     → normalized DashboardSnapshot → selectors → existing components
 *
 * The contract describes DATA TRUTH, not transport: nothing here knows about
 * HTTP, WebSocket, SSE, IPC, files or queues. No live ANN connection exists.
 *
 * The adapter never manufactures authority, certification, health, mission
 * ordinals, timing or "live". Missing or ambiguous data stays UNKNOWN.
 */

/** The only contract version this module accepts. No fuzzy compatibility. */
export const ANN_CONTRACT_VERSION = 'assembly-nexus.dashboard-feed.v1' as const;

/** Declared nature of the data. Missing/unrecognised values never become LIVE. */
export const ANN_SOURCE_MODES = ['SIMULATED', 'LIVE', 'UNKNOWN'] as const;
export type AnnSourceMode = (typeof ANN_SOURCE_MODES)[number];

/**
 * What produced the feed. Only `ann-runtime` may declare LIVE; a mock or the
 * Local Demo Simulation declaring LIVE is a contradiction and is rejected.
 */
export const ANN_SOURCE_KINDS = ['ann-runtime', 'ann-mock', 'local-demo-simulation'] as const;
export type AnnSourceKind = (typeof ANN_SOURCE_KINDS)[number];

/** Mission lifecycle values (exact strings; anything else is UNKNOWN). */
export const ANN_LIFECYCLES = [
  'QUEUED',
  'ACTIVE',
  'WAITING_REVIEW',
  'WAITING_APPROVAL',
  'BLOCKED',
  'COMPLETE',
  'FAILED',
  'CANCELLED',
] as const;

export const ANN_CERTIFICATION = [
  'NOT_REQUIRED',
  'PENDING',
  'IN_PROGRESS',
  'CERTIFIED',
  'REJECTED',
] as const;

export const ANN_REVIEW = ['NOT_REQUESTED', 'REQUESTED', 'IN_REVIEW', 'PASSED', 'FAILED'] as const;

export const ANN_APPROVAL_STATUSES = [
  'PENDING',
  'HELD',
  'APPROVED',
  'DENIED',
  'EXPIRED',
  'WITHDRAWN',
] as const;

/** The only decision authority v1 can express. Strings in names never grant it. */
export const ANN_DECISION_AUTHORITY = 'FOUNDER' as const;

/**
 * Activity is evidence for the timeline, never authority. Only these purely
 * informational kinds are accepted; approval, certification, review outcome,
 * completion, health or alert claims in activity are dropped.
 */
export const ANN_ACTIVITY_KINDS = [
  'worker.assigned',
  'work.started',
  'task.completed',
  'review.requested',
] as const;
export type AnnActivityKind = (typeof ANN_ACTIVITY_KINDS)[number];

/** Defensive bounds. Exceeding a collection bound rejects the whole envelope. */
export const ANN_LIMITS = {
  missions: 2_000,
  workers: 1_000,
  approvals: 1_000,
  alerts: 1_000,
  /** Activity is history: longer feeds keep the newest `activity` entries. */
  activity: 500,
  healthComponents: 200,
  /** Maximum characters kept from any source string (longer is truncated). */
  text: 2_000,
  /** Identifier length; longer ids make the record invalid. */
  id: 200,
  /** Estimates beyond this are not credible and are ignored. */
  estimateMs: 400 * 24 * 3_600_000,
} as const;

/** Clock skew tolerated before a source time "in the future" is distrusted. */
export const ANN_CLOCK_SKEW_MS = 60_000;

export interface AnnNormalizeOptions {
  /** Evaluation time (epoch ms), injected: no hidden Date.now() in normalization. */
  now: number;
  /**
   * The deployment's human decision authority (config `governance.humanAuthority`),
   * NOT read from the feed. A decision is accepted only when it names exactly
   * this principal; the feed can never redefine who the authority is.
   */
  humanAuthority: string;
  /** Snapshot older than this is shown STALE (default 120 s). */
  staleAfterMs?: number;
  /** Health reports older than this are UNKNOWN (default 300 s). */
  healthMaxAgeMs?: number;
}

export const ANN_DEFAULT_STALE_AFTER_MS = 120_000;
export const ANN_DEFAULT_HEALTH_MAX_AGE_MS = 300_000;

/** Bounded error vocabulary. Raw exceptions never reach the UI. */
export type AnnErrorCode =
  | 'UNSUPPORTED_CONTRACT'
  | 'MALFORMED_ENVELOPE'
  | 'CONTRADICTORY_ENVELOPE'
  | 'SOURCE_MODE_UNKNOWN'
  | 'RESOURCE_LIMIT'
  | 'SOURCE_UNAVAILABLE'
  | 'READ_ONLY';

export class AnnAdapterError extends Error {
  readonly code: AnnErrorCode;
  constructor(code: AnnErrorCode, detail: string) {
    super(`ANN feed ${code}: ${detail.slice(0, 200)}`);
    this.name = 'AnnAdapterError';
    this.code = code;
  }
}

/**
 * Wire shape of a v1 envelope, for documentation and mock authoring. Every
 * field is validated at runtime; the type is never trusted.
 *
 * Unknown properties anywhere are IGNORED: normalization reads only the fields
 * below and builds fresh objects, so an extra property can never reach the
 * normalized model or change any decision.
 */
export interface AnnFeedV1 {
  contract: typeof ANN_CONTRACT_VERSION;
  source: { id: string; name?: string; kind: AnnSourceKind };
  snapshot: { id: string; generatedAt: string };
  sourceMode: AnnSourceMode;
  /** A missing or non-array collection means UNAVAILABLE, never empty. */
  missions: AnnMissionV1[];
  workers: AnnWorkerV1[];
  approvals: AnnApprovalV1[];
  alerts: AnnAlertV1[];
  activity: AnnActivityV1[];
  /** Missing = health UNKNOWN. */
  health?: AnnHealthV1;
}

export interface AnnMissionV1 {
  /** Opaque source identity (routing). Not the ordinal. */
  id: string;
  /** Lifetime ordinal assigned upstream: non-negative safe integer, never derived here. */
  ordinal?: number;
  title: string;
  objective?: string;
  lifecycle: (typeof ANN_LIFECYCLES)[number];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  assignedWorkerIds?: string[];
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  /** Percent 0..100, as reported. */
  progressPct?: number;
  estimate?: { durationMs: number; source?: string; confidence?: 'low' | 'medium' | 'high' };
  review?: {
    status: (typeof ANN_REVIEW)[number];
    reviewerId?: string;
    requestedAt?: string;
    completedAt?: string;
    summary?: string;
  };
  certification?: {
    status: (typeof ANN_CERTIFICATION)[number];
    /** Required for CERTIFIED / REJECTED. */
    decidedBy?: string;
    decidedAt?: string;
  };
  approvalIds?: string[];
  result?: { outcome: 'SUCCESS' | 'PARTIAL' | 'FAILURE'; summary: string };
}

export interface AnnWorkerV1 {
  id: string;
  name?: string;
  role?: string;
  state?: string;
  stateSince?: string;
  crewId?: string;
  characterId?: string;
  currentMissionId?: string;
  currentActivity?: string;
  progressPct?: number;
  capabilities?: { id: string; label?: string }[];
}

export interface AnnApprovalV1 {
  id: string;
  title: string;
  action?: string;
  rationale?: string;
  missionId?: string;
  /** Worker id of the requester. A request is never authority. */
  requestedBy: string;
  requestedAt: string;
  requiredAuthority?: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  reversible?: boolean;
  expiresAt?: string;
  status: (typeof ANN_APPROVAL_STATUSES)[number];
  decision?: {
    decision: 'APPROVE' | 'DENY' | 'HOLD';
    authority: typeof ANN_DECISION_AUTHORITY;
    decidedBy: string;
    decidedAt: string;
    note?: string;
  };
}

export interface AnnAlertV1 {
  id: string;
  severity: 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';
  title: string;
  whatHappened?: string;
  attention?: string;
  raisedAt: string;
  humanActionRequired?: boolean;
  acknowledgedAt?: string;
  resolvedAt?: string;
  affected?: { kind: 'mission' | 'worker' | 'system' | 'approval'; id: string; label?: string }[];
}

export interface AnnActivityV1 {
  id: string;
  kind: AnnActivityKind;
  at: string;
  missionId?: string;
  workerId?: string;
  /** Free text, shown as text only. Never interpreted. */
  summary?: string;
  taskId?: string;
}

export interface AnnHealthV1 {
  status: 'NOMINAL' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
  checkedAt: string;
  components: {
    id: string;
    label?: string;
    status: 'NOMINAL' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
    detail?: string;
    latencyMs?: number;
  }[];
}

/**
 * Transport-neutral, READ-ONLY source of raw feed values. A future bridge
 * (local process, REST, stream, …) implements this; the truth rules above do
 * not change. There is deliberately no write method.
 */
export interface AnnFeedSource {
  /**
   * What carries the feed. v1 knows only an in-memory mock; any other source
   * is UNVERIFIED until a future mission defines how it is verified.
   */
  readonly transport?: 'in-memory-mock';
  /** Resolves the current raw envelope (untrusted) or rejects when unavailable. */
  load(): Promise<unknown>;
}

/**
 * Trust state of the data on screen, kept SEPARATE from the source's own
 * claims. Ladder (low → high):
 *
 *   SIMULATED | UNVERIFIED  →  TRANSPORT_VERIFIED  →  SNAPSHOT_SIGNED  →  DECISION_SIGNED
 *
 * v1 can only ever reach the first rung: schema validity is not source
 * authenticity, a LIVE `sourceMode` is a claim, and a structurally valid
 * Founder decision is a source assertion. The higher rungs are DESIGN ONLY
 * (docs/ADAPTERS.md, "Future read-only transport trust contract").
 */
export interface AnnTrust {
  /** The source's declaration (a claim, never proof). */
  sourceMode: 'SIMULATED' | 'LIVE';
  /** What the transport proves about who sent the bytes. v1: nothing. */
  transport: 'IN_MEMORY_MOCK' | 'UNVERIFIED';
  /** Whether the snapshot is proven to come from the claimed source. v1: never. */
  snapshotAuthenticity: 'NOT_ESTABLISHED';
  /** Whether any Founder decision is authenticated. v1: never. */
  decisionAuthenticity: 'NOT_ESTABLISHED';
}
