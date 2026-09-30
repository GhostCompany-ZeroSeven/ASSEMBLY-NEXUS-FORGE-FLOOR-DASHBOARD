import type { ConnectionStatus } from '@/adapters/types';
import type { EventVia } from './events';
import { isStale, resourceUnavailable } from './selectors';
import { MAX_EVENTS, type DataIssue, type DashboardSnapshot } from './snapshot';
import type { Freshness } from './freshness';
import type { DataProvenance } from './types';

/**
 * Data quality, as separate explicit dimensions. There is deliberately no
 * single "health score": one number would hide which part is uncertain.
 * Everything here is read from the normalized snapshot; no network call.
 */
export const QUALITY_RESOURCES = ['missions', 'workers', 'approvals', 'alerts', 'events'] as const;
export type QualityResource = (typeof QUALITY_RESOURCES)[number];

export type IssueClass =
  | 'resource-unavailable' // the whole resource failed to load or parse
  | 'record-dropped' // one record was invalid and left out
  | 'record-repaired' // one field was unknown/invalid and shown as UNKNOWN or a safe default
  | 'transport' // the event stream or polling transport
  | 'event-conflict' // one event id reported with different facts; the first observation is kept
  | 'history-gap' // event history continuity broke: events in between may be missing
  | 'duplicate-delivery' // the same event delivered again; counted once
  | 'other';

export interface ClassifiedIssue {
  class: IssueClass;
  severity: DataIssue['severity'];
  /** Where it came from (resource or record path), from the adapter. */
  source: string;
  /** Adapter-generated text (bounded); never a stack trace. */
  message: string;
  at: string;
}

export interface DataQualityReport {
  source: Freshness['source'];
  qualifiers: Freshness['qualifiers'];
  adapterLabel: string;
  /** The adapter's own description of its state (adapter text, not localized). */
  adapterNote?: string;
  environment?: string;
  transport?: DataProvenance['transport'];
  connection: ConnectionStatus;
  verifiedBackend: boolean;
  resources: { name: QualityResource; available: boolean; issues: number }[];
  freshness: {
    /** Last time every required resource loaded (dashboard clock). Absent = never / not applicable. */
    lastSuccessfulSyncAt?: string;
    staleAfterMs?: number;
    stale: boolean;
    /** When the adapter produced the snapshot on screen (dashboard clock). */
    generatedAt: string;
  };
  history: {
    retained: number;
    capacity: number;
    atCapacity: boolean;
    /** Oldest/newest retained event time (SOURCE clock). */
    oldestAt?: string;
    newestAt?: string;
    /** Latest detected continuity break (dashboard clock); absent = none detected. */
    gapAt?: string;
  };
  /** Newest event by source time, with how and when it arrived. */
  lastEvent?: { id: string; at: string; receivedAt?: string; via?: EventVia };
  /** Event with the latest arrival (dashboard clock). */
  lastReceived?: { id: string; at: string; receivedAt: string; via?: EventVia };
  ingest: Record<EventVia | 'unrecorded', number>;
  issues: ClassifiedIssue[];
  /** Issues beyond the listing cap. */
  moreIssues: number;
}

export const MAX_LISTED_ISSUES = 50;

export function classifyIssue(i: DataIssue): IssueClass {
  if (i.code) return i.code;
  if ((QUALITY_RESOURCES as readonly string[]).includes(i.source) || i.source === 'health')
    return i.severity === 'error' ? 'resource-unavailable' : 'record-repaired';
  if (/^(stream|transport)\b/.test(i.source)) return 'transport';
  // Record paths come as `missions[3]…` (list position) or `mission AN-0139…` (id).
  if (/^[a-z]+(\[\d+\]| \S)/.test(i.source))
    return i.severity === 'error' ? 'record-dropped' : 'record-repaired';
  return 'other';
}

export function selectDataQuality(
  s: DashboardSnapshot,
  freshness: Freshness,
  connection: ConnectionStatus,
  nowMs: number,
): DataQualityReport {
  const ingest: DataQualityReport['ingest'] = { stream: 0, poll: 0, simulated: 0, unrecorded: 0 };
  let oldest: string | undefined;
  let newest: DashboardSnapshot['events'][number] | undefined;
  let lastRx: DashboardSnapshot['events'][number] | undefined;
  for (const e of s.events) {
    ingest[e.via ?? 'unrecorded'] += 1;
    if (oldest === undefined || e.at < oldest) oldest = e.at;
    if (!newest || e.at > newest.at) newest = e;
    // Latest arrival; within one arrival batch (same receivedAt) the newest event time.
    if (
      e.receivedAt &&
      (!lastRx ||
        e.receivedAt > lastRx.receivedAt! ||
        (e.receivedAt === lastRx.receivedAt && e.at > lastRx.at))
    )
      lastRx = e;
  }
  const bySource = new Map<string, number>();
  for (const i of s.quality.issues) {
    const root = i.source.split(/[[.]/)[0]!;
    bySource.set(root, (bySource.get(root) ?? 0) + 1);
  }
  const classified = s.quality.issues.map((i) => ({
    class: classifyIssue(i),
    severity: i.severity,
    source: i.source.slice(0, 120),
    message: i.message.slice(0, 300),
    at: i.at,
  }));
  return {
    source: freshness.source,
    qualifiers: freshness.qualifiers,
    adapterLabel: s.provenance.adapterLabel,
    adapterNote: s.provenance.note,
    environment: s.provenance.environment,
    transport: s.provenance.transport,
    connection,
    verifiedBackend: s.provenance.verifiedBackend,
    resources: QUALITY_RESOURCES.map((name) => ({
      name,
      available: !resourceUnavailable(s, name),
      issues: bySource.get(name) ?? 0,
    })),
    freshness: {
      lastSuccessfulSyncAt: s.quality.lastSuccessfulSyncAt,
      staleAfterMs: s.quality.staleAfterMs,
      stale: isStale(s, nowMs),
      generatedAt: s.generatedAt,
    },
    history: {
      retained: s.events.length,
      capacity: MAX_EVENTS,
      atCapacity: s.events.length >= MAX_EVENTS,
      oldestAt: oldest,
      newestAt: newest?.at,
      gapAt: s.quality.eventHistoryGapAt,
    },
    lastEvent: newest
      ? { id: newest.id, at: newest.at, receivedAt: newest.receivedAt, via: newest.via }
      : undefined,
    lastReceived: lastRx
      ? { id: lastRx.id, at: lastRx.at, receivedAt: lastRx.receivedAt!, via: lastRx.via }
      : undefined,
    ingest,
    issues: classified.slice(0, MAX_LISTED_ISSUES),
    moreIssues: Math.max(0, classified.length - MAX_LISTED_ISSUES),
  };
}
