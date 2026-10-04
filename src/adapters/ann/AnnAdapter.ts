import type { DashboardSnapshot } from '@/domain/snapshot';
import type { ApprovalDecisionRecord, DataProvenance } from '@/domain/types';
import type {
  AdapterCapabilities,
  AdapterListener,
  ApprovalDecisionInput,
  DashboardAdapter,
} from '../types';
import { AnnAdapterError, type AnnFeedSource, type AnnTrust } from './contract';
import { ANN_LOCAL_SOURCE_ERROR_CODES } from './localSnapshotSource';
import { normalizeAnnFeed } from './normalize';

export interface AnnAdapterOptions {
  /** The deployment's human decision authority (config), never the feed's claim. */
  humanAuthority: string;
  /** Injected clock for deterministic evaluation (default Date.now). */
  now?: () => number;
  staleAfterMs?: number;
  healthMaxAgeMs?: number;
}

/**
 * Read-only DashboardAdapter over any transport-neutral `AnnFeedSource`.
 *
 * It loads a raw feed, normalizes it through the ONE boundary
 * (`normalizeAnnFeed`), and hands the UI only normalized snapshots. It never
 * writes back: it cannot decide approvals, acknowledge alerts, message
 * workers, dispatch work, certify or deploy. No polling, no retries, no
 * background work: a refresh happens only when `refresh()` is called.
 */
export class AnnAdapter implements DashboardAdapter {
  readonly id = 'ann';
  readonly label = 'ANN feed v1';
  readonly capabilities: AdapterCapabilities = {
    realtime: false,
    approvals: false,
    alertAcknowledgement: false,
    messaging: false,
    simulationControls: false,
  };

  private snapshot: DashboardSnapshot | null = null;
  private lastTrust: AnnTrust | null = null;
  private readonly listeners = new Set<AdapterListener>();

  constructor(
    private readonly source: AnnFeedSource,
    private readonly opts: AnnAdapterOptions,
  ) {}

  /**
   * Trust of the last loaded snapshot. In v1 nothing is ever authenticated:
   * snapshot and decision authenticity are always NOT_ESTABLISHED.
   */
  trust(): AnnTrust | null {
    return this.lastTrust;
  }

  provenance(): DataProvenance {
    return (
      this.snapshot?.provenance ?? {
        mode: 'disconnected',
        adapterId: this.id,
        adapterLabel: this.label,
        verifiedBackend: false,
      }
    );
  }

  async connect(): Promise<DashboardSnapshot> {
    const snapshot = await this.load();
    this.emit({ type: 'snapshot', snapshot });
    return snapshot;
  }

  /** Re-read the source once. A failure is reported, never shown as an empty dashboard. */
  async refresh(): Promise<DashboardSnapshot | null> {
    try {
      const snapshot = await this.load();
      this.emit({ type: 'snapshot', snapshot });
      return snapshot;
    } catch (e) {
      this.emit({
        type: 'connection',
        status: 'error',
        message: e instanceof Error ? e.message : 'ANN feed unavailable',
      });
      return null;
    }
  }

  subscribe(listener: AdapterListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    this.listeners.clear();
  }

  submitApprovalDecision(input: ApprovalDecisionInput): Promise<ApprovalDecisionRecord> {
    return Promise.reject(
      new AnnAdapterError(
        'READ_ONLY',
        `approval ${String(input.approvalId).slice(0, 60)}: the ANN v1 adapter cannot write back`,
      ),
    );
  }

  acknowledgeAlert: DashboardAdapter['acknowledgeAlert'] = (alertId) =>
    Promise.reject(
      new AnnAdapterError(
        'READ_ONLY',
        `alert ${String(alertId).slice(0, 60)}: the ANN v1 adapter cannot write back`,
      ),
    );

  private async load(): Promise<DashboardSnapshot> {
    let raw: unknown;
    try {
      raw = await this.source.load();
    } catch (e) {
      // The transport's own error text never reaches the UI; only a code from
      // the local source's bounded vocabulary may be named.
      const code = (e as { code?: unknown } | null)?.code;
      const known = ANN_LOCAL_SOURCE_ERROR_CODES.find((c) => c === code);
      throw new AnnAdapterError(
        'SOURCE_UNAVAILABLE',
        known ? `the feed could not be read (${known})` : 'the feed could not be read',
      );
    }
    const result = normalizeAnnFeed(raw, {
      now: (this.opts.now ?? Date.now)(),
      humanAuthority: this.opts.humanAuthority,
      staleAfterMs: this.opts.staleAfterMs,
      healthMaxAgeMs: this.opts.healthMaxAgeMs,
    });
    if (!result.ok) throw result.error;
    this.snapshot = result.snapshot;
    this.lastTrust = {
      sourceMode: result.snapshot.provenance.mode === 'demo' ? 'SIMULATED' : 'LIVE',
      transport:
        this.source.transport === 'in-memory-mock'
          ? 'IN_MEMORY_MOCK'
          : this.source.transport === 'local-snapshot'
            ? 'LOCAL_FILE_UNVERIFIED'
            : 'UNVERIFIED',
      snapshotAuthenticity: 'NOT_ESTABLISHED',
      decisionAuthenticity: 'NOT_ESTABLISHED',
    };
    return result.snapshot;
  }

  private emit(update: Parameters<AdapterListener>[0]): void {
    for (const l of [...this.listeners]) l(update);
  }
}
