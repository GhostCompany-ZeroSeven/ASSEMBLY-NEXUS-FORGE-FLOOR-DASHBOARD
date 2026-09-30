import type { DashboardEvent } from './events';
import type {
  Alert,
  ApprovalRequest,
  DataProvenance,
  Mission,
  SystemHealth,
  Worker,
  WorkerMessage,
} from './types';

/**
 * Complete normalized state the UI renders. Adapters produce snapshots;
 * components read from them. Collections are arrays to keep ordering stable.
 */
export interface DashboardSnapshot {
  provenance: DataProvenance;
  generatedAt: string;
  workers: Worker[];
  missions: Mission[];
  approvals: ApprovalRequest[];
  alerts: Alert[];
  /**
   * In the order this dashboard first OBSERVED them (arrival order; for a
   * history load, by event time). Bounded by `MAX_EVENTS`: the earliest
   * observed are dropped first. Consumers needing event-time order sort by `at`.
   */
  events: DashboardEvent[];
  messages: WorkerMessage[];
  health: SystemHealth;
  /** Freshness/completeness of this snapshot. Drives stale/partial/malformed-data states. */
  quality: DataQuality;
}

/** A problem found while fetching or normalizing backend data. */
export interface DataIssue {
  id: string;
  severity: 'warning' | 'error';
  /** Where it came from, e.g. `workers`, `missions[3]`, `transport`. */
  source: string;
  message: string;
  at: string;
  /**
   * Machine-readable kind for issues that are not about one resource or record
   * (set by the adapter; display text never drives classification).
   */
  code?: 'event-conflict' | 'history-gap' | 'duplicate-delivery';
}

export interface DataQuality {
  /** Last time every required resource was fetched successfully. Absent = never / not applicable. */
  lastSuccessfulSyncAt?: string;
  /** Data older than this is shown as STALE. Absent = adapter does not sync (e.g. demo). */
  staleAfterMs?: number;
  /** True when some resources failed or some records were dropped as malformed. */
  partial: boolean;
  issues: DataIssue[];
  /**
   * Dashboard-clock time of the latest detected break in event-history
   * continuity since the adapter connected: a listing that shares no event
   * with the previous listing, so events in between may never have been
   * observed. Event coverage is never exact across it. Adapter-set only.
   */
  eventHistoryGapAt?: string;
}

export const MAX_EVENTS = 500;
/** Retained conversation messages across all workers. */
export const MAX_MESSAGES = 300;

export function emptySnapshot(provenance: DataProvenance, now: string): DashboardSnapshot {
  return {
    provenance,
    generatedAt: now,
    workers: [],
    missions: [],
    approvals: [],
    alerts: [],
    events: [],
    messages: [],
    health: { status: 'UNKNOWN', checkedAt: now, components: [] },
    quality: { partial: false, issues: [] },
  };
}
