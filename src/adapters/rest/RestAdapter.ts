import {
  assertHumanDecisionAllowed,
  checkDecision,
  verifyBackendAuthorityClaims,
} from '@/domain/governance';
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
  TransportDiagnostics,
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

/** Minimum wait before a stream that gave up is tried again (after a verified REST sync). */
export const STREAM_RECOVERY_MS = 5 * 60_000;

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
  // Diagnostics only (never used for decisions or verification).
  private lastVerifiedAt: string | undefined;
  private lastAttemptAt: string | undefined;
  private lastStreamMessageAt: string | undefined;
  private lastStreamEventAt: string | undefined;
  private rejectedStreamMessages = 0;
  private streamFailedAt: number | null = null;
  /** Ids in the previous successful events listing (continuity check). */
  private lastListedIds: Set<string> | null = null;
  /** Ids dropped from the bounded log: re-deliveries are not new observations. */
  private readonly evicted = new BoundedIdSet(MAX_EVICTED_IDS);

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
      contractProfile: this.config.contractProfile,
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

  /** Read-only transport diagnostics (no URLs, headers or credentials). */
  diagnostics(): TransportDiagnostics {
    const stream = this.config.stream;
    return {
      configured: stream ? 'polling+stream' : 'polling',
      active: this.transportMode(),
      streamState: this.streamState,
      streamAttempts: this.stream?.attempts(),
      lastStreamMessageAt: this.lastStreamMessageAt,
      lastStreamEventAt: this.lastStreamEventAt,
      rejectedStreamMessages: stream ? this.rejectedStreamMessages : undefined,
      lastRestVerificationAt: this.lastVerifiedAt,
      lastRestAttemptAt: this.lastAttemptAt,
      pollIntervalMs: this.config.pollIntervalMs,
      resyncIntervalMs: stream?.resyncIntervalMs,
      heartbeatTimeoutMs: stream?.heartbeatTimeoutMs,
      maxRetries: stream?.maxRetries,
    };
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
        // While the push stream is healthy AND the backend is verified, only
        // re-sync occasionally. An unverified backend is re-checked at the
        // normal poll interval even if the stream is open: an open stream must
        // never delay recovering (or losing) verification.
        if (
          this.streamState === 'open' &&
          this.verified &&
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
    // HTTP success is not trust: the confirmed record must itself satisfy the
    // governance rules (the required human authority, never a worker).
    const confirmed = checkDecision(
      request,
      record.decidedBy,
      this.snapshot.workers,
      record.decision,
    );
    if (!confirmed.ok) {
      throw new Error(
        `Decision not confirmed: the backend record fails governance (${confirmed.code ?? 'refused'}).`,
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
    let gapAt: string | undefined;

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
          else {
            const listed = dedupeEvents(
              list.map((x, i) => normalizeEvent(x, i, log)),
              log,
            );
            const merged = mergeObserved(listed, prev.events, at, this.evicted);
            next.events = merged.events;
            for (const id of merged.dropped) this.evicted.add(id);
            for (const id of merged.conflicts)
              log.add(
                'warning',
                'events',
                `Conflicting content for event id "${id}": kept the first observation`,
                'event-conflict',
              );
            // Continuity: a listing sharing no event with the previous one may
            // have skipped events in between (the source window moved past them).
            const ids = new Set(listed.map((e) => e.id));
            const prevIds = this.lastListedIds;
            if (
              prevIds &&
              prevIds.size > 0 &&
              ids.size > 0 &&
              ![...ids].some((id) => prevIds.has(id))
            ) {
              gapAt = at;
              log.add(
                'warning',
                'events',
                'Event history gap: this listing shares no event with the previous one, so events in between may be missing',
                'history-gap',
              );
            }
            this.lastListedIds = ids;
          }
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
    this.lastAttemptAt = at;
    if (healthOk) {
      this.lastVerifiedAt = at;
      this.maybeRecoverStream();
    }
    if (healthOk || REQUIRED.some((r) => !failed.has(r))) this.everSynced = true;

    next.quality = {
      staleAfterMs: this.config.staleAfterMs,
      lastSuccessfulSyncAt: requiredOk ? at : prev.quality.lastSuccessfulSyncAt,
      partial: failed.size > 0 || log.dropped,
      issues: [...log.issues, ...this.recentStreamIssues()],
      eventHistoryGapAt: gapAt ?? prev.quality.eventHistoryGapAt,
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

  /**
   * After the stream gave up, re-arm it once the backend is verified again and
   * a cool-down has passed. At most one new attempt series per cool-down, and
   * each series is itself bounded by `maxRetries`: no reconnect storm.
   */
  private maybeRecoverStream(): void {
    if (this.closed || !this.config.stream || this.streamState !== 'failed') return;
    if (this.streamFailedAt === null || this.now() - this.streamFailedAt < STREAM_RECOVERY_MS)
      return;
    this.stream?.stop();
    this.stream = null;
    this.streamFailedAt = null;
    this.startStream();
  }

  private onStreamState(state: StreamState, detail?: string): void {
    if (this.closed) return;
    const was = this.streamState;
    this.streamState = state;
    if (state === 'failed') {
      this.streamFailedAt = this.now();
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
      // The stream reconnecting while unverified hints the backend is back:
      // re-verify by REST now instead of waiting for the next poll.
      if (state === 'open' && !this.verified) void this.runCycle();
      this.publish();
    }
  }

  private onStreamMessage(m: SseMessage): void {
    if (this.closed) return;
    const at = this.iso();
    this.lastStreamMessageAt = at;
    if (m.type === 'heartbeat') {
      this.touchFreshness(at);
      this.publish();
      return;
    }
    const log = new IssueLog(at);
    const event = normalizeStreamEvent(m.data, this.snapshot, log, this.config.statusMapping);
    for (const i of log.issues) this.addStreamIssue(i.severity, `${i.source}: ${i.message}`, false);
    if (!event) {
      this.rejectedStreamMessages += 1;
      this.publish();
      return;
    }
    this.lastStreamEventAt = at;
    event.receivedAt = at;
    if (this.evicted.has(event.id)) {
      // Observed before and dropped from the bounded log: a re-delivery, not new.
      this.publish();
      return;
    }
    const known = this.snapshot.events.find((e) => e.id === event.id);
    const full = this.snapshot.events.length >= MAX_EVENTS;
    if (!known && full) this.evicted.add(this.snapshot.events[0]!.id);
    if (known && fingerprint(known) !== fingerprint(event))
      this.addStreamIssue(
        'warning',
        `events: Conflicting content for event id "${event.id}": kept the first observation`,
        false,
        'event-conflict',
      );
    // Duplicates are ignored by id (applyEvent is idempotent). The snapshot time
    // is the ARRIVAL time: a source's claimed event time (possibly skewed or
    // late) never becomes the time this data was generated.
    this.snapshot = { ...applyEvent(this.snapshot, event), generatedAt: at };
    this.touchFreshness(at);
    this.publish(known ? undefined : [event]);
  }

  /** Stream traffic proves freshness only when the last full re-sync was complete. */
  private touchFreshness(at: string): void {
    if (!this.lastFullSyncOk || this.streamState !== 'open') return;
    this.snapshot = {
      ...this.snapshot,
      quality: { ...this.snapshot.quality, lastSuccessfulSyncAt: at },
    };
  }

  private addStreamIssue(
    severity: DataIssue['severity'],
    message: string,
    publish = false,
    code?: DataIssue['code'],
  ): void {
    const at = this.iso();
    this.streamIssues = [
      ...this.streamIssues,
      {
        id: `stream#${at}#${this.streamIssues.length}`,
        severity,
        source: 'stream',
        message,
        at,
        ...(code ? { code } : {}),
      },
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

/**
 * Merge a REST listing into the retained event log.
 *
 * - Ingest facts (how and when THIS dashboard first received an event) belong
 *   to the first arrival: a re-sync listing an event already received over the
 *   stream must not relabel it as polled or move its arrival time.
 * - The first observation of an event id is kept. A listing that reports the
 *   same id with different identity facts (kind, event time, mission, worker)
 *   is not allowed to rewrite it; the conflict is returned for data quality.
 * - An event already OBSERVED (e.g. over the stream) that the listing omits is
 *   kept: a backend window that does not list it is not evidence it did not
 *   happen. Nothing is invented; only observed events are retained.
 * - The log is kept in first-observation order and bounded (MAX_EVENTS) by
 *   dropping the EARLIEST OBSERVED first; dropped ids are returned and are not
 *   re-admitted later (`evicted`). Newly listed events are appended in
 *   event-time order. A late event (old event time, new arrival) is therefore
 *   never the first to go, and every event observed after a retained one is
 *   retained too, which is what event coverage relies on (eventCoverage.ts).
 */
export function mergeObserved(
  listed: DashboardSnapshot['events'],
  prev: DashboardSnapshot['events'],
  at: string,
  evicted: { has(id: string): boolean } = new Set<string>(),
): { events: DashboardSnapshot['events']; conflicts: string[]; dropped: string[] } {
  const listedById = new Map(listed.map((e) => [e.id, e]));
  const conflicts: string[] = [];
  const kept = prev.map((p) => {
    const l = listedById.get(p.id);
    if (l && fingerprint(l) !== fingerprint(p)) conflicts.push(p.id);
    return p;
  });
  const known = new Set(prev.map((e) => e.id));
  // An id dropped earlier to keep the log bounded was already observed: a
  // listing that still contains it must not re-admit it as a new arrival.
  const fresh = listed
    .filter((e) => !known.has(e.id) && !evicted.has(e.id))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => ({ ...e, receivedAt: at }));
  const events = [...kept, ...fresh];
  const cut = Math.max(0, events.length - MAX_EVENTS);
  return {
    events: cut ? events.slice(cut) : events,
    conflicts,
    dropped: events.slice(0, cut).map((e) => e.id),
  };
}

/** Remembered evicted ids (bounded; the oldest are forgotten first). */
export const MAX_EVICTED_IDS = 5000;

class BoundedIdSet {
  private readonly ids = new Set<string>();
  constructor(private readonly max: number) {}
  add(id: string): void {
    this.ids.delete(id);
    this.ids.add(id);
    if (this.ids.size > this.max) this.ids.delete(this.ids.values().next().value!);
  }
  has(id: string): boolean {
    return this.ids.has(id);
  }
}

/** The identity facts of an event (payload shapes differ between ingest paths). */
function fingerprint(e: DashboardSnapshot['events'][number]): string {
  return JSON.stringify([e.kind, e.at, e.missionId ?? null, e.workerId ?? null]);
}

/**
 * Event ids are unique in the mock contract, and a repeated id is a duplicate
 * delivery. It is dropped at RECORD level (`events <id>`): one duplicate does
 * not make the whole events resource unavailable. A repeat with different
 * identity facts is also reported as a conflict (the first entry is kept).
 * Other resources keep the stricter rule in `dedupe`: an ambiguous record
 * there (e.g. two gates with one id) makes the resource's answers UNKNOWN.
 */
function dedupeEvents(
  items: (DashboardSnapshot['events'][number] | null)[],
  log: IssueLog,
): DashboardSnapshot['events'] {
  const seen = new Map<string, string>();
  const out: DashboardSnapshot['events'] = [];
  for (const item of items) {
    if (!item) continue;
    const fp = fingerprint(item);
    const first = seen.get(item.id);
    if (first !== undefined) {
      if (first === fp)
        log.add('warning', `events ${item.id}`, 'Dropped duplicate delivery', 'duplicate-delivery');
      else
        log.add(
          'warning',
          `events ${item.id}`,
          'Dropped a second entry with the same id and different facts; kept the first',
          'event-conflict',
        );
      continue;
    }
    seen.set(item.id, fp);
    out.push(item);
  }
  return out;
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
