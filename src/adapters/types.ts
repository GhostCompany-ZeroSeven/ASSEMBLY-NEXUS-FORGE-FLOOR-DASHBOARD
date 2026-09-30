import type { DashboardEvent } from '@/domain/events';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type {
  ApprovalDecision,
  ApprovalDecisionRecord,
  DataProvenance,
  WorkerMessage,
} from '@/domain/types';

/**
 * Adapter contract.
 *
 * The UI talks to exactly one `DashboardAdapter` through the store. Adapters
 * own everything backend-specific: transport, authentication, payload
 * translation and state mapping. They emit NORMALIZED snapshots/events only.
 *
 * Implementations:
 * - `DemoAdapter` (this repo) — deterministic local simulation. Never claims a backend.
 * - `AssemblyNexusAdapter` (future) — Assembly Nexus control plane.
 * - `RestAdapter` / `EventStreamAdapter` (future) — generic backends.
 */
export interface DashboardAdapter {
  readonly id: string;
  readonly label: string;
  readonly capabilities: AdapterCapabilities;
  provenance(): DataProvenance;

  /** Establish the connection and return the initial snapshot. */
  connect(): Promise<DashboardSnapshot>;

  /** Receive updates after `connect()`. Returns an unsubscribe function. */
  subscribe(listener: AdapterListener): () => void;

  /** Tear down timers, sockets, etc. Safe to call more than once. */
  disconnect(): void;

  /**
   * Submit a HUMAN approval decision. Adapters must pass the decision to the
   * backend verbatim and report honestly whether it was delivered. Adapters
   * must never auto-approve on behalf of a human.
   */
  submitApprovalDecision(input: ApprovalDecisionInput): Promise<ApprovalDecisionRecord>;

  acknowledgeAlert(alertId: string, by: string): Promise<void>;

  /** Optional — only present when `capabilities.messaging` is true. */
  sendWorkerMessage?(workerId: string, body: string, author: string): Promise<WorkerMessage>;

  /**
   * Optional read-only transport diagnostics for the Settings page. Values the
   * adapter does not know are left undefined (shown as UNKNOWN). Must never
   * contain credentials, tokens, headers or URLs.
   */
  diagnostics?(): TransportDiagnostics;
}

export type StreamStateName =
  'connecting' | 'open' | 'stale' | 'retrying' | 'failed' | 'closed' | 'disabled';

export interface TransportDiagnostics {
  /** `simulated` = demo adapter: there is no network transport at all. */
  configured: 'simulated' | 'polling' | 'polling+stream';
  active: 'simulated' | 'polling' | 'sse' | 'polling-fallback';
  streamState?: StreamStateName;
  /** Consecutive failed stream attempts since data last arrived. */
  streamAttempts?: number;
  /** Any stream message, including heartbeats. */
  lastStreamMessageAt?: string;
  /** Last stream event accepted and applied (after validation). */
  lastStreamEventAt?: string;
  /** Stream messages rejected as malformed, unknown, oversized or unauthorized. */
  rejectedStreamMessages?: number;
  /** Last REST cycle whose health payload verified the backend. */
  lastRestVerificationAt?: string;
  /** Last REST cycle attempted (successful or not). */
  lastRestAttemptAt?: string;
  pollIntervalMs?: number;
  /** Full REST re-sync interval while the stream is healthy. */
  resyncIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxRetries?: number;
}

export interface AdapterCapabilities {
  /** Adapter can push incremental updates (vs. only initial snapshot). */
  realtime: boolean;
  /** Adapter can deliver approval decisions to something. */
  approvals: boolean;
  alertAcknowledgement: boolean;
  messaging: boolean;
  /** Demo-only: simulation controls (pause, step, speed). */
  simulationControls: boolean;
}

export interface ApprovalDecisionInput {
  approvalId: string;
  decision: ApprovalDecision;
  decidedBy: string;
  note?: string;
}

export type AdapterUpdate =
  | { type: 'snapshot'; snapshot: DashboardSnapshot; events?: DashboardEvent[] }
  | { type: 'connection'; status: ConnectionStatus; message?: string };

export type AdapterListener = (update: AdapterUpdate) => void;

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed';

/** Optional extension implemented by adapters with simulation controls. */
export interface SimulationControls {
  isRunning(): boolean;
  setRunning(running: boolean): void;
  /** Advance the simulation by one scripted step. */
  step(): void;
  setSpeed(multiplier: number): void;
  getSpeed(): number;
  reset(): void;
  /** Notified when running state or speed changes. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
}

export function hasSimulationControls(
  adapter: DashboardAdapter,
): adapter is DashboardAdapter & { simulation: SimulationControls } {
  return adapter.capabilities.simulationControls && 'simulation' in adapter;
}
