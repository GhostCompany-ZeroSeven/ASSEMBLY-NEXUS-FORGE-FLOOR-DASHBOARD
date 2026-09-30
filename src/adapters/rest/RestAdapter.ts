import { assertHumanDecisionAllowed, verifyBackendAuthorityClaims } from '@/domain/governance';
import { applyEvent } from '@/domain/reducer';
import { MAX_EVENTS, type DashboardSnapshot, type DataIssue } from '@/domain/snapshot';
import type { ApprovalDecisionRecord, DataProvenance } from '@/domain/types';
import { createPollingTransport } from '../transport/polling';
import {
  createSseTransport,
  type SseMessage,
  type SseTransport,
  type SseTransportOptions,
  type StreamState,
} from '../transport/sse';
import type { EventTransport } from '../transport/types';
import type {
  AdapterCapabilities,
  AdapterListener,
  ApprovalDecisionInput,
  ConnectionStatus,
  DashboardAdapter,
} from '../types';
import {
  endpointUrl,
  resolveRestConfig,
  type ResolvedRestConfig,
  type RestAdapterConfig,
} from './config';
import { RestRequestError, requestJson, type FetchLike } from './http';
import {
  IssueLog,
  healthEnvironment,
  listFrom,
  normalizeAlert,
  normalizeApproval,
  normalizeDecisionRecord,
  normalizeEvent,
  normalizeHealth,
  normalizeMission,
  normalizeWorker,
} from './normalize';
import { normalizeStreamEvent } from './stream';

export interface RestAdapterDeps {
  fetch?: FetchLike;
  now?: () => number;
  /** Injected transport factory (tests). Defaults to the polling transport. */
  createTransport?: (poll: () => Promise<void>, intervalMs: number) => EventTransport<void>;
  /** Injected SSE transport factory (tests). Defaults to `createSseTransport`. */
  createStream?: (opts: SseTransportOptions) => SseTransport;
}

type Resource = 'health' | 'workers' | 'missions' | 'approvals' | 'alerts' | 'events';
const REQUIRED: readonly Resource[] = ['health', 'workers', 'missions', 'approvals'];

/**
 * Generic REST adapter. Polls a backend that speaks the Forge Floor wire format
 * (docs/ADAPTERS.md) and normalizes it into domain types.
 *
 * Truthfulness rules:
 * - LIVE (`verifiedBackend: true`) only while the most recent cycle fetched a
 *   valid health payload. Otherwise the badge reads DISCONNECTED.
 * - Failed resources keep their last good data. The snapshot is then marked
 *   partial, and stale once `staleAfterMs` passes.
 * - Malformed records are dropped or downgraded to UNKNOWN, and every drop is
 *   recorded in `snapshot.quality.issues`.
 * - Approval decisions are never applied locally. They count only when the
 *   backend returns a valid decision record, and state then comes from the next fetch.
 */
export class RestAdapter implements DashboardAdapter {
  readonly id = 'rest';
  readonly label: string;
  readonly capabilities: AdapterCapabilities;
  readonly config: ResolvedRestConfig;

  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly createTransport: NonNullable<RestAdapterDeps['createTransport']>;
  private transport: EventTransport<void> | null = null;
  private listeners = new Set<AdapterListener>();
  private snapshot: DashboardSnapshot;
  private verified = false;
  private everSynced = false;
  private environment: string | undefined;
  private status: ConnectionStatus = 'idle';
  private abort = new AbortController();
  private cycle: Promise<boolean> | null = null;
  private closed = false;
  private readonly createStream: NonNullable<RestAdapterDeps['createStream']>;
  private stream: SseTransport | null = null;
  private streamState: StreamState | 'disabled' = 'disabled';
  private streamIssues: DataIssue[] = [];
  private lastCycleAt = 0;
  private lastFullSyncOk = false;

  constructor(config: RestAdapterConfig, deps: RestAdapterDeps = {}) {
    this.config = resolveRestConfig(config);
    this.label = this.config.label;
    this.fetchImpl = deps.fetch ?? ((input, init) => fetch(input, init));
    this.createStream = deps.createStream ?? createSseTransport;
    this.now = deps.now ?? (() => Date.now());
    this.createTransport =
      deps.createTransport ??
      ((poll, intervalMs) =>
        createPollingTransport<void>({ poll: () => poll(), intervalMs, maxBackoffMs: 60_000 }));
    this.capabilities = {
      realtime: true,
      approvals: this.config.endpoints.decide !== undefined,
      alertAcknowledgement: this.config.endpoints.acknowledge !== undefined,
      messaging: false,
      simulationControls: false,
    };
    const at = this.iso();
    this.snapshot = {
      provenance: this.provenance(),
      generatedAt: at,
      workers: [],
      missions: [],
      approvals: [],
      alerts: [],
      events: [],
      messages: [],
      health: { status: 'UNKNOWN', checkedAt: at, components: [] },
      quality: { partial: true, issues: [], staleAfterMs: this.config.staleAfterMs },
    };
  }

  provenance(): DataProvenance {
    return {
      mode: this.everSynced ? 'live' : 'disconnected',
      adapterId: this.id,
      adapterLabel: this.label,
      verifiedBackend: this.verified,
      environment: this.environment,
      transport: this.transportMode(),
      note: !this.verified
        ? `Not verified: ${this.config.baseUrl} has not returned a valid health payload in the latest cycle.`
        : this.transportMode() === 'sse'
          ? `Live stream from ${this.config.baseUrl}; full re-sync every ${Math.round((this.config.stream?.resyncIntervalMs ?? 0) / 1000)}s.`
          : this.transportMode() === 'polling-fallback'
            ? `Live stream unavailable; polling ${this.config.baseUrl} every ${Math.round(this.config.pollIntervalMs / 1000)}s instead.`
            : `Polling ${this.config.baseUrl} every ${Math.round(this.config.pollIntervalMs / 1000)}s.`,
    };
  }

  /** Current update mechanism (explicit fallback when a configured stream is not healthy). */
  transportMode(): 'polling' | 'sse' | 'polling-fallback' {
    if (!this.config.stream) return 'polling';
    if (this.streamState === 'open') return 'sse';
    const failedBefore =
      this.streamState === 'stale' ||
      this.streamState === 'retrying' ||
      this.streamState === 'failed' ||
      (this.stream?.attempts() ?? 0) > 0;
    // Before the first open we are simply polling; "fallback" means the stream actually failed.
    return failedBefore ? 'polling-fallback' : 'polling';
  }

  /** Stream lifecycle state, or `disabled` when no stream is configured. */
  getStreamState(): StreamState | 'disabled' {
    return this.streamState;
  }

  /**
   * Resolves even when the backend is down, with an honest DISCONNECTED
   * snapshot, and keeps retrying in the background. It rejects only for
   * invalid configuration, which the constructor reports.
   */
  async connect(): Promise<DashboardSnapshot> {
    this.closed = false;
    this.abort = new AbortController();
    this.setStatus('connecting');
    await this.runCycle();
    if (!this.transport && !this.closed) {
      // The polling transport fires immediately on start. Skip that tick, since we just synced.
      let skipFirst = true;
      this.transport = this.createTransport(async () => {
        if (skipFirst) {
          skipFirst = false;
          return;
        }
        // While the push stream is healthy, only re-sync occasionally.
        if (
          this.streamState === 'open' &&
          this.config.stream &&
          this.now() - this.lastCycleAt < this.config.stream.resyncIntervalMs
        ) {
          return;
        }
        const ok = await this.runCycle();
        if (!ok) throw new Error('sync failed'); // lets the transport back off
      }, this.config.pollIntervalMs);
      this.transport.start(
        () => undefined,
        () => undefined,
      );
    }
    if (this.config.stream && !this.stream && !this.closed) this.startStream();
    return this.snapshot;
  }

  subscribe(listener: AdapterListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    this.closed = true;
    this.transport?.stop();
    this.transport = null;
    this.stream?.stop();
    this.stream = null;
    this.abort.abort();
    this.listeners.clear();
    this.status = 'closed';
  }

  getSnapshot(): DashboardSnapshot {
    return this.snapshot;
  }

  /** Force a sync now (used after decisions and by tests). Returns true when all required resources loaded. */
  async refresh(): Promise<boolean> {
    return this.runCycle();
  }

  async submitApprovalDecision(input: ApprovalDecisionInput): Promise<ApprovalDecisionRecord> {
    const path = this.config.endpoints.decide;
    if (!path) throw new Error('This backend does not accept approval decisions.');
    const request = assertHumanDecisionAllowed(this.snapshot, input);
    const response = await requestJson(endpointUrl(this.config, path, request.id), {
      fetch: this.fetchImpl,
      timeoutMs: this.config.requestTimeoutMs,
      credentials: this.config.credentials,
      method: 'POST',
      body: { decision: input.decision, note: input.note ?? null, decidedBy: input.decidedBy },
      signal: this.abort.signal,
    }).catch((e: unknown) => {
      throw new Error(`Decision not delivered: ${describeError(e)}`);
    });
    // The backend must confirm the exact decision. Anything else counts as not delivered.
    const record = normalizeDecisionRecord(
      typeof response === 'object' && response !== null && 'record' in response
        ? (response as { record: unknown }).record
        : response,
    );
    if (!record || record.decision !== input.decision) {
      throw new Error(
        'Decision not confirmed: the backend response did not include a matching decision record.',
      );
    }
    void this.refresh();
    return record;
  }

  async acknowledgeAlert(alertId: string, by: string): Promise<void> {
    const path = this.config.endpoints.acknowledge;
    if (!path) throw new Error('This backend does not support alert acknowledgement.');
    if (!this.snapshot.alerts.some((a) => a.id === alertId))
      throw new Error(`Unknown alert ${alertId}`);
    await requestJson(endpointUrl(this.config, path, alertId), {
      fetch: this.fetchImpl,
      timeoutMs: this.config.requestTimeoutMs,
      credentials: this.config.credentials,
      method: 'POST',
      body: { by },
      signal: this.abort.signal,
    }).catch((e: unknown) => {
      throw new Error(`Acknowledgement not delivered: ${describeError(e)}`);
    });
    void this.refresh();
  }

  /* ---------------------------------------------------------------------- */

  /** One sync cycle. Concurrent callers share the in-flight cycle. */
  private runCycle(): Promise<boolean> {
    if (!this.cycle) {
      this.cycle = this.sync().finally(() => {
        this.cycle = null;
      });
    }
    return this.cycle;
  }

  private async sync(): Promise<boolean> {
    const at = this.iso();
    const log = new IssueLog(at);
    const ep = this.config.endpoints;
    const resources: [Resource, string | undefined][] = [
      ['health', ep.health],
      ['workers', ep.workers],
      ['missions', ep.missions],
      ['approvals', ep.approvals],
      ['alerts', ep.alerts],
      ['events', ep.events],
    ];
    const results = await Promise.all(
      resources.map(async ([name, path]) => {
        if (!path) return [name, { skipped: true }] as const;
        try {
          const data = await requestJson(endpointUrl(this.config, path), {
            fetch: this.fetchImpl,
            timeoutMs: this.config.requestTimeoutMs,
            credentials: this.config.credentials,
            signal: this.abort.signal,
          });
          return [name, { data }] as const;
        } catch (e) {
          return [name, { error: e }] as const;
        }
      }),
    );
    if (this.closed) return false;

    const prev = this.snapshot;
    const next: DashboardSnapshot = { ...prev, generatedAt: at };
    const failed = new Set<Resource>();
    let healthOk = false;

    for (const [name, r] of results) {
      if ('skipped' in r) continue;
      if ('error' in r) {
        failed.add(name);
        log.add('error', name, describeError(r.error));
        continue;
      }
      const data = r.data;
      switch (name) {
        case 'health': {
          const h = normalizeHealth(data, log, at);
          if (h) {
            next.health = h;
            healthOk = true;
            this.environment = healthEnvironment(data);
          } else failed.add(name);
          break;
        }
        case 'workers': {
          const list = listFrom(data, 'workers', log);
          if (!list) failed.add(name);
          else
            next.workers = dedupe(
              list.map((x, i) => normalizeWorker(x, i, log, this.config.statusMapping)),
              log,
              'workers',
            );
          break;
        }
        case 'missions': {
          const list = listFrom(data, 'missions', log);
          if (!list) failed.add(name);
          else
            next.missions = dedupe(
              list.map((x, i) => normalizeMission(x, i, log)),
              log,
              'missions',
            );
          break;
        }
        case 'approvals': {
          const list = listFrom(data, 'approvals', log);
          if (!list) failed.add(name);
          else
            next.approvals = dedupe(
              list.map((x, i) => normalizeApproval(x, i, log)),
              log,
              'approvals',
            );
          break;
        }
        case 'alerts': {
          const list = listFrom(data, 'alerts', log);
          if (!list) failed.add(name);
          else
            next.alerts = dedupe(
              list.map((x, i) => normalizeAlert(x, i, log)),
              log,
              'alerts',
            );
          break;
        }
        case 'events': {
          const list = listFrom(data, 'events', log);
          if (!list) failed.add(name);
          else
            next.events = dedupe(
              list.map((x, i) => normalizeEvent(x, i, log)),
              log,
              'events',
            )
              .sort((a, b) => a.at.localeCompare(b.at))
              .slice(-MAX_EVENTS);
          break;
        }
      }
    }

    // Health failures must not leave a stale "NOMINAL" on screen.
    if (!healthOk) {
      next.health = {
        status: 'UNKNOWN',
        checkedAt: prev.health.checkedAt,
        components: prev.health.components.map((c) => ({ ...c, status: 'UNKNOWN' as const })),
      };
    }

    // BACKEND CLAIM ≠ VERIFIED AUTHORITY: cross-check decisions and grants.
    const claims = verifyBackendAuthorityClaims(next.approvals, next.workers);
    next.approvals = claims.approvals;
    next.workers = claims.workers;
    for (const pr of claims.problems) log.add('error', pr.source, pr.message);

    const requiredOk = REQUIRED.every((r) => !failed.has(r));
    this.lastCycleAt = this.now();
    this.lastFullSyncOk = requiredOk;
    this.verified = healthOk;
    if (healthOk || REQUIRED.some((r) => !failed.has(r))) this.everSynced = true;

    next.quality = {
      staleAfterMs: this.config.staleAfterMs,
      lastSuccessfulSyncAt: requiredOk ? at : prev.quality.lastSuccessfulSyncAt,
      partial: failed.size > 0 || log.dropped,
      issues: [...log.issues, ...this.recentStreamIssues()],
    };
    next.provenance = this.provenance();
    this.snapshot = next;

    const allFailed = REQUIRED.every((r) => failed.has(r));
    this.setStatus(
      requiredOk
        ? 'connected'
        : allFailed
          ? this.everSynced
            ? 'reconnecting'
            : 'error'
          : 'connected',
      allFailed ? summarize(log.issues) : undefined,
    );
    for (const l of this.listeners) l({ type: 'snapshot', snapshot: next });
    return requiredOk;
  }

  /* ---------------------------------------------------------------------- */
  /* Server-Sent Events                                                      */
  /* ---------------------------------------------------------------------- */

  private startStream(): void {
    const cfg = this.config.stream;
    if (!cfg) return;
    this.stream = this.createStream({
      url: endpointUrl(this.config, cfg.path),
      heartbeatTimeoutMs: cfg.heartbeatTimeoutMs,
      maxRetries: cfg.maxRetries,
      onState: (state, detail) => this.onStreamState(state, detail),
    });
    this.stream.start(
      (m) => this.onStreamMessage(m),
      () => undefined, // failures surface through onState
    );
  }

  private onStreamState(state: StreamState, detail?: string): void {
    if (this.closed) return;
    const was = this.streamState;
    this.streamState = state;
    if (state === 'failed') {
      this.addStreamIssue(
        'error',
        `Live stream unavailable (${detail ?? 'failed'}). Falling back to polling.`,
      );
    } else if (state === 'stale') {
      this.addStreamIssue('warning', detail ?? 'Live stream went quiet');
    }
    if (was !== state) {
      // Leaving 'open' means we must not rely on the stream: re-sync now.
      if (was === 'open' && state !== 'open') void this.runCycle();
      this.publish();
    }
  }

  private onStreamMessage(m: SseMessage): void {
    if (this.closed) return;
    const at = this.iso();
    if (m.type === 'heartbeat') {
      this.touchFreshness(at);
      this.publish();
      return;
    }
    const log = new IssueLog(at);
    const event = normalizeStreamEvent(m.data, this.snapshot, log, this.config.statusMapping);
    for (const i of log.issues) this.addStreamIssue(i.severity, `${i.source}: ${i.message}`, false);
    if (!event) {
      this.publish();
      return;
    }
    this.snapshot = applyEvent(this.snapshot, event);
    this.touchFreshness(at);
    this.publish([event]);
  }

  /** Stream traffic proves freshness only when the last full re-sync was complete. */
  private touchFreshness(at: string): void {
    if (!this.lastFullSyncOk || this.streamState !== 'open') return;
    this.snapshot = {
      ...this.snapshot,
      quality: { ...this.snapshot.quality, lastSuccessfulSyncAt: at },
    };
  }

  private addStreamIssue(severity: DataIssue['severity'], message: string, publish = false): void {
    const at = this.iso();
    this.streamIssues = [
      ...this.streamIssues,
      { id: `stream#${at}#${this.streamIssues.length}`, severity, source: 'stream', message, at },
    ].slice(-20); // bounded
    const issues = [
      ...this.snapshot.quality.issues.filter((i) => i.source !== 'stream'),
      ...this.streamIssues,
    ];
    this.snapshot = {
      ...this.snapshot,
      quality: {
        ...this.snapshot.quality,
        issues,
        partial: this.snapshot.quality.partial || severity === 'error',
      },
    };
    if (publish) this.publish();
  }

  /** Stream issues age out after 5 minutes so a past glitch does not stick forever. */
  private recentStreamIssues(): DataIssue[] {
    const cutoff = this.now() - 5 * 60_000;
    this.streamIssues = this.streamIssues.filter((i) => Date.parse(i.at) >= cutoff);
    return this.streamIssues;
  }

  private publish(events?: DashboardSnapshot['events']): void {
    this.snapshot = { ...this.snapshot, provenance: this.provenance() };
    const snapshot = this.snapshot;
    for (const l of this.listeners) l({ type: 'snapshot', snapshot, events });
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    if (status === this.status && !message) return;
    this.status = status;
    for (const l of this.listeners) l({ type: 'connection', status, message });
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }
}

function dedupe<T extends { id: string }>(items: (T | null)[], log: IssueLog, source: string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item) continue;
    if (seen.has(item.id)) {
      log.add('error', source, `Dropped duplicate id "${item.id}"`);
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function describeError(e: unknown): string {
  if (e instanceof RestRequestError) {
    switch (e.kind) {
      case 'timeout':
        return `Request timed out (${e.message})`;
      case 'network':
        return 'Backend unavailable (network error)';
      case 'http':
        return `Backend returned ${e.message}`;
      case 'malformed':
        return `Malformed payload: ${e.message}`;
      case 'aborted':
        return 'Request cancelled';
    }
  }
  return 'Unexpected adapter error';
}

function summarize(issues: DataIssue[]): string {
  const first = issues.find((i) => i.severity === 'error');
  return first ? `${first.source}: ${first.message}` : 'Backend unavailable';
}
