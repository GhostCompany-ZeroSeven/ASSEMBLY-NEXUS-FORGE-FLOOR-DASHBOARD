import type {
  AlertSeverity,
  CertificationStatus,
  RiskLevel,
  ApprovalStatus,
  HealthStatus,
  MissionStatus,
  ReviewStatus,
  WorkerState,
} from './types';
import { WORKER_STATES } from './types';

/**
 * Semantic tone used by the design system. Components map tones to colors via
 * CSS tokens, so themes can restyle every status consistently.
 */
/**
 * Semantic colour roles. `success` is reserved for data-backed positive
 * outcomes (completed, approved, passed, nominal from a real report);
 * `connected` means only that data is flowing (live, reachable), which says
 * nothing about health.
 */
export type Tone =
  | 'neutral'
  | 'info'
  | 'active'
  | 'progress'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'connected';

export interface StatusMeta {
  label: string;
  tone: Tone;
  description: string;
}

export const WORKER_STATE_META: Record<WorkerState, StatusMeta> = {
  IDLE: { label: 'Idle', tone: 'muted', description: 'Available, no assigned work.' },
  PLANNING: { label: 'Planning', tone: 'info', description: 'Breaking down the mission.' },
  WORKING: { label: 'Working', tone: 'active', description: 'Actively executing a task.' },
  WAITING: {
    label: 'Waiting',
    tone: 'warning',
    description: 'Waiting on a dependency or decision.',
  },
  BLOCKED: {
    label: 'Blocked',
    tone: 'danger',
    description: 'Cannot proceed until a blocker clears.',
  },
  REVIEWING: {
    label: 'Reviewing',
    tone: 'progress',
    description: 'Reviewing work produced by others.',
  },
  CERTIFYING: {
    label: 'Certifying',
    tone: 'progress',
    description: 'Running certification checks.',
  },
  COMPLETE: { label: 'Complete', tone: 'success', description: 'Finished the assigned work.' },
  FAILED: { label: 'Failed', tone: 'danger', description: 'Work failed and needs attention.' },
  STOPPED: { label: 'Stopped', tone: 'neutral', description: 'Halted by an operator.' },
  UNKNOWN: {
    label: 'Unknown state',
    tone: 'neutral',
    description: 'The data source reported a state this dashboard does not recognise.',
  },
};

export const MISSION_STATUS_META: Record<MissionStatus, StatusMeta> = {
  QUEUED: { label: 'Queued', tone: 'muted', description: 'Waiting to start.' },
  ACTIVE: { label: 'Mission Active', tone: 'active', description: 'Work is in progress.' },
  WAITING_REVIEW: {
    label: 'Waiting for Review',
    tone: 'progress',
    description: 'Awaiting review.',
  },
  WAITING_APPROVAL: {
    label: 'Waiting for Approval',
    tone: 'warning',
    description: 'Blocked on a human approval gate.',
  },
  BLOCKED: { label: 'Blocked', tone: 'danger', description: 'Cannot proceed.' },
  COMPLETE: { label: 'Mission Complete', tone: 'success', description: 'Finished.' },
  FAILED: { label: 'Mission Failed', tone: 'danger', description: 'Ended in failure.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', description: 'Stopped before completion.' },
  UNKNOWN: {
    label: 'Unknown status',
    tone: 'neutral',
    description: 'The data source reported an unrecognised mission status.',
  },
};

export const REVIEW_STATUS_META: Record<ReviewStatus, StatusMeta> = {
  NOT_REQUESTED: { label: 'Not requested', tone: 'muted', description: '' },
  REQUESTED: { label: 'Review requested', tone: 'progress', description: '' },
  IN_REVIEW: { label: 'In review', tone: 'progress', description: '' },
  PASSED: { label: 'Review passed', tone: 'success', description: '' },
  FAILED: { label: 'Review failed', tone: 'danger', description: '' },
};

export const APPROVAL_STATUS_META: Record<ApprovalStatus, StatusMeta> = {
  PENDING: { label: 'Awaiting decision', tone: 'warning', description: '' },
  HELD: { label: 'On hold', tone: 'progress', description: '' },
  APPROVED: { label: 'Approved', tone: 'success', description: '' },
  DENIED: { label: 'Denied', tone: 'danger', description: '' },
  EXPIRED: { label: 'Expired', tone: 'muted', description: '' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'muted', description: '' },
  UNKNOWN: {
    label: 'Unknown status',
    tone: 'neutral',
    description: 'Unrecognised approval status. It cannot be decided from here.',
  },
};

export const ALERT_SEVERITY_META: Record<AlertSeverity, StatusMeta & { rank: number }> = {
  INFO: { label: 'Info', tone: 'info', description: 'For awareness.', rank: 0 },
  NOTICE: { label: 'Notice', tone: 'progress', description: 'Worth a look.', rank: 1 },
  WARNING: { label: 'Warning', tone: 'warning', description: 'Needs attention soon.', rank: 2 },
  CRITICAL: { label: 'Critical', tone: 'danger', description: 'Needs attention now.', rank: 3 },
};

export const HEALTH_STATUS_META: Record<HealthStatus, StatusMeta> = {
  NOMINAL: { label: 'Nominal', tone: 'success', description: '' },
  DEGRADED: { label: 'Degraded', tone: 'warning', description: '' },
  CRITICAL: { label: 'Critical', tone: 'danger', description: '' },
  UNKNOWN: { label: 'Unknown', tone: 'muted', description: '' },
};

/**
 * The one rule for colouring a health status (Command Center cell, health
 * panel, anywhere else): lime only for a NOMINAL report that is current,
 * complete, over a working connection, and not simulated. A lost connection
 * or a critical report is red; stale, partial, degraded or reconnecting is
 * amber; a simulated "nominal" is simulated amber, never real-looking green.
 */
export function healthTone(h: {
  status: HealthStatus;
  connection?: string;
  stale?: boolean;
  partial?: boolean;
  simulated?: boolean;
}): Tone {
  if (h.connection === 'error' || h.status === 'CRITICAL') return 'danger';
  if (h.stale || h.partial || h.status === 'DEGRADED' || h.connection === 'reconnecting')
    return 'warning';
  if (h.status === 'NOMINAL' && h.simulated) return 'warning';
  return HEALTH_STATUS_META[h.status]?.tone ?? 'muted';
}

/** Map of raw backend state strings → normalized worker states. */
export type WorkerStateMapping = Record<string, WorkerState>;

export const DEFAULT_WORKER_STATE_MAPPING: WorkerStateMapping = {
  idle: 'IDLE',
  available: 'IDLE',
  planning: 'PLANNING',
  running: 'WORKING',
  working: 'WORKING',
  busy: 'WORKING',
  in_progress: 'WORKING',
  waiting: 'WAITING',
  pending: 'WAITING',
  blocked: 'BLOCKED',
  reviewing: 'REVIEWING',
  review: 'REVIEWING',
  certifying: 'CERTIFYING',
  done: 'COMPLETE',
  complete: 'COMPLETE',
  completed: 'COMPLETE',
  succeeded: 'COMPLETE',
  failed: 'FAILED',
  error: 'FAILED',
  stopped: 'STOPPED',
  cancelled: 'STOPPED',
  canceled: 'STOPPED',
};

/**
 * Normalize an arbitrary backend state string. Unknown values map to
 * `fallback` (default `UNKNOWN`) rather than throwing, so a new backend state
 * never crashes the dashboard. The default is deliberately not a healthy-looking
 * state, and adapters should record an issue for unmapped values.
 */
export function mapWorkerState(
  raw: string,
  mapping: WorkerStateMapping = DEFAULT_WORKER_STATE_MAPPING,
  fallback: WorkerState = 'UNKNOWN',
): WorkerState {
  const upper = raw.trim().toUpperCase();
  if ((WORKER_STATES as readonly string[]).includes(upper)) return upper as WorkerState;
  if (!Object.prototype.hasOwnProperty.call(mapping, normalizeKey(raw))) return fallback;
  return mapping[normalizeKey(raw)] ?? fallback;
}

/** True when `raw` maps to a known state (canonical or via the mapping). */
export function isKnownWorkerState(
  raw: string,
  mapping: WorkerStateMapping = DEFAULT_WORKER_STATE_MAPPING,
): boolean {
  const upper = raw.trim().toUpperCase();
  return (
    ((WORKER_STATES as readonly string[]).includes(upper) && upper !== 'UNKNOWN') ||
    Object.prototype.hasOwnProperty.call(mapping, normalizeKey(raw))
  );
}

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Risk is an assessment of a request, never an outcome: low risk is not lime. */
export const RISK_TONE: Record<RiskLevel, Tone> = {
  low: 'info',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export const CERT_TONE: Record<CertificationStatus, Tone> = {
  NOT_REQUIRED: 'muted',
  PENDING: 'muted',
  IN_PROGRESS: 'progress',
  CERTIFIED: 'success',
  REJECTED: 'danger',
};
