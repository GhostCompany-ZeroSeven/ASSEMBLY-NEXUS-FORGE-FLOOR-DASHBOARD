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
  /** Newest last. Bounded by `MAX_EVENTS`. */
  events: DashboardEvent[];
  messages: WorkerMessage[];
  health: SystemHealth;
}

export const MAX_EVENTS = 500;

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
  };
}
